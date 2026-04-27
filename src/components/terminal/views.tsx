import { ExposurePoint, KeyLevels, formatNumber, DemoTicker, OptionContract, computeMaxPain, buildIvGrid, computeExposures, computeKeyLevels } from "@/lib/gex";
import { Panel, StatBlock } from "./Panel";
import { ExposureChart } from "@/components/ExposureChart";
import { GexDexBars } from "./GexDexBars";
import { GexExposureTabs, HeatmapGridView, StrikeChartView, SurfaceView } from "./GexExposureTabs";
import { TerminalTabs } from "./TerminalTabs";
import { FloatingStatBar } from "./FloatingStatBar";
import { ThirdOrderGreeksPanel } from "./ThirdOrderGreeksPanel";
import { GexHeatmapForVolatility, GexHillSurfaceForVolatility } from "./VolatilityGexExtras";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useEffect, useRef } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Zap, Shield, Target } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, Legend, BarChart, Bar } from "recharts";
import { IvSurface3D } from "./IvSurface3D";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Ctx {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

// ─────── OVERVIEW ───────
export function OverviewView({ ticker, exposures, levels, contracts }: Ctx) {
  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
  const pcr = totalPutOI / Math.max(totalCallOI, 1);
  const atmIv = useMemo(() => {
    const atm = contracts
      .filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5)
      .reduce((s, c) => s + c.iv, 0) / Math.max(1, contracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5).length);
    return atm * 100;
  }, [contracts, ticker]);
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);

  return (
    <div className="h-full flex flex-col">
      <TerminalTabs
        layoutId="overview-master-tab-bg"
        tabs={[
          {
            key: "gex",
            label: "GEX SURFACE",
            content: (
              <Panel title="GEX Surface" subtitle={`${ticker.symbol} · spot $${ticker.spot}`} className="h-full flex flex-col">
                <div className="h-full">
                  <ExposureChart data={exposures} spot={ticker.spot} callWall={levels.callWall} putWall={levels.putWall} flip={levels.gammaFlip} metric="netGex" />
                </div>
              </Panel>
            ),
          },
          {
            key: "levels",
            label: "KEY LEVELS",
            content: (
              <Panel title="Key Levels" className="h-full flex flex-col">
                <div className="space-y-2 text-sm font-mono">
                  <KV k="Call Wall" v={`$${levels.callWall}`} tone="call" />
                  <KV k="Put Wall" v={`$${levels.putWall}`} tone="put" />
                  <KV k="Gamma Flip" v={levels.gammaFlip ? `$${levels.gammaFlip}` : "—"} tone="warning" />
                  <KV k="Spot vs Flip" v={levels.gammaFlip ? `${(((ticker.spot - levels.gammaFlip) / levels.gammaFlip) * 100).toFixed(2)}%` : "—"} />
                  <KV k="Distance to Call Wall" v={`${(((levels.callWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                  <KV k="Distance to Put Wall" v={`${(((levels.putWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                </div>
              </Panel>
            ),
          },
          {
            key: "oi",
            label: "OPEN INTEREST",
            content: (
              <Panel title="Open Interest" className="h-full flex flex-col">
                <div className="space-y-2 text-sm font-mono">
                  <KV k="Call OI" v={formatNumber(totalCallOI, 0)} tone="call" />
                  <KV k="Put OI" v={formatNumber(totalPutOI, 0)} tone="put" />
                  <KV k="P/C OI Ratio" v={pcr.toFixed(2)} />
                  <KV k="Strikes" v={String(exposures.length)} />
                  <KV k="Contracts" v={formatNumber(contracts.length, 0)} />
                  <KV k="Expiries loaded" v={String(ticker.expiries.length)} />
                </div>
              </Panel>
            ),
          },
        ]}
      />
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: "call" | "put" | "warning" }) {
  const c = tone === "call" ? "text-call" : tone === "put" ? "text-put" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className={`font-semibold ${c}`}>{v}</span>
    </div>
  );
}

// ─────── GEX & DEX ───────
const DTE_FILTERS = [
  { label: "0DTE", value: "0" },
  { label: "1DTE", value: "1" },
  { label: "7DTE", value: "7" },
  { label: "All", value: "all" },
];

export function GexDexView({ ticker, contracts }: Ctx) {
  const [m, setM] = useState<"netGex" | "dex">("netGex");
  const [dte, setDte] = useState<string>("all");
  const [tape, setTape] = useState<{ t: number; gex: number }[]>([]);

  // Filter contracts by DTE selection
  const filtered = useMemo(() => {
    if (dte === "all") return contracts;
    if (dte === "0") return contracts.filter((c) => c.expiry <= 1);
    if (dte === "1") return contracts.filter((c) => c.expiry <= 2);
    if (dte === "7") return contracts.filter((c) => c.expiry <= 7);
    return contracts;
  }, [contracts, dte]);

  const exposures = useMemo(() => computeExposures(ticker.spot, filtered), [filtered, ticker.spot]);
  const levels = useMemo(() => computeKeyLevels(exposures), [exposures]);

  // DEX Bias = Total Call Delta − Total Put Delta
  const bias = useMemo(() => {
    let callDex = 0, putDex = 0, totalGex = 0;
    for (const p of exposures) {
      callDex += Math.max(0, p.dex);
      putDex += Math.min(0, p.dex);
      totalGex += p.netGex;
    }
    const net = callDex + putDex;
    const ratio = Math.abs(callDex) / Math.max(1, Math.abs(putDex));
    const label = ratio > 1.15 ? "Call Heavy" : ratio < 0.87 ? "Put Heavy" : "Balanced";
    return { callDex, putDex, net, ratio, label, totalGex };
  }, [exposures]);

  // Live tape: simulate tick of total GEX every 2s
  useEffect(() => {
    setTape([{ t: Date.now(), gex: bias.totalGex }]);
    const id = setInterval(() => {
      setTape((prev) => {
        const last = prev[prev.length - 1]?.gex ?? bias.totalGex;
        const noise = (Math.random() - 0.5) * Math.abs(bias.totalGex) * 0.012;
        const next = [...prev, { t: Date.now(), gex: last + noise }];
        return next.slice(-30);
      });
    }, 2000);
    return () => clearInterval(id);
  }, [bias.totalGex, dte, ticker.symbol]);

  const tapeDelta = tape.length > 1 ? tape[tape.length - 1].gex - tape[0].gex : 0;

  const liveTape = (
    <Panel title="Live Net GEX Tape" subtitle="Updates every 2s" noPad>
      <div className="h-[420px] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={tape.map((p, i) => ({ i, gex: p.gex }))} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.35} />
            <XAxis dataKey="i" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={() => ""} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={(v) => formatNumber(Number(v), 1)} domain={["auto", "auto"]} />
            <RTooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
              formatter={(v: number) => formatNumber(v)}
              labelFormatter={() => ""}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Line type="monotone" dataKey="gex" stroke={bias.totalGex >= 0 ? "hsl(var(--call))" : "hsl(var(--put))"} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );

  const biasBreakdown = (
    <Panel title="DEX Bias Breakdown">
      <div className="space-y-2 text-xs font-mono">
        <KV k="Total Call Δ" v={formatNumber(bias.callDex)} tone="call" />
        <KV k="Total Put Δ" v={formatNumber(bias.putDex)} tone="put" />
        <KV k="Net Δ (C − P)" v={formatNumber(bias.net)} tone={bias.net >= 0 ? "call" : "put"} />
        <KV k="Call/Put Ratio" v={bias.ratio.toFixed(2)} />
        <div className="mt-3 p-3 rounded bg-secondary/40 text-[12px] leading-relaxed">
          <div className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
            {bias.label === "Call Heavy" ? <TrendingUp className="h-3.5 w-3.5 text-call" /> : bias.label === "Put Heavy" ? <TrendingDown className="h-3.5 w-3.5 text-put" /> : <Activity className="h-3.5 w-3.5 text-warning" />}
            {bias.label}
          </div>
          <p className="text-muted-foreground">
            {bias.label === "Call Heavy" ? "Dealers net short calls — hedging skews bullish into rallies." : bias.label === "Put Heavy" ? "Dealers net long puts — selling pressure on declines amplifies downside." : "Symmetric positioning — directional bias is muted."}
          </p>
        </div>
      </div>
    </Panel>
  );

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      {/* Institutional walls panel */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatBlock label="Call Wall" value={`$${levels.callWall}`} tone="call" sub="resistance" />
        <StatBlock label="Put Wall" value={`$${levels.putWall}`} tone="put" sub="support" />
        <StatBlock label="Gamma Flip" value={levels.gammaFlip ? `$${levels.gammaFlip}` : "—"} tone="warning" sub="zero gamma" />
        <StatBlock label="Net GEX" value={formatNumber(bias.totalGex)} tone={bias.totalGex >= 0 ? "call" : "put"} sub={bias.totalGex >= 0 ? "long gamma" : "short gamma"} />
        <StatBlock label="DEX Bias" value={bias.label} tone={bias.label === "Call Heavy" ? "call" : bias.label === "Put Heavy" ? "put" : "warning"} sub={`ratio ${bias.ratio.toFixed(2)}`} />
        <StatBlock label="Live Δ" value={`${tapeDelta >= 0 ? "+" : ""}${formatNumber(tapeDelta)}`} tone={tapeDelta >= 0 ? "call" : "put"} sub="last 60s" />
      </div>

      {/* DTE + metric controls */}
      <div className="flex items-center justify-end gap-2">
        <div className="flex gap-0.5 bg-secondary/40 rounded p-0.5">
          {DTE_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={dte === f.value ? "default" : "ghost"}
              className="h-6 px-2 text-[10px] font-mono uppercase tracking-wider"
              onClick={() => setDte(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Tabs value={m} onValueChange={(v) => setM(v as any)}>
          <TabsList className="h-7">
            <TabsTrigger value="netGex" className="text-xs h-5 px-2">GEX</TabsTrigger>
            <TabsTrigger value="dex" className="text-xs h-5 px-2">DEX</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Each visualization is its own tab — full width, no sibling panels */}
      <TerminalTabs
        layoutId="gexdex-master-tab-bg"
        tabs={[
          { key: "heatmap", label: "HEATMAP", content: <Panel title="Heatmap Matrix" subtitle={`${ticker.symbol} · ${m === "netGex" ? "GEX" : "DEX"} per strike × DTE`} noPad className="h-full flex flex-col"><div className="p-2 bg-black flex-1 min-h-0"><HeatmapGridView ticker={ticker} contracts={filtered} metric={m} /></div></Panel> },
          { key: "strike", label: "STRIKE CHART", content: <Panel title="Strike Distribution" subtitle={`${ticker.symbol} · ${m === "netGex" ? "Gamma" : "Delta"} per strike`} noPad className="h-full flex flex-col"><div className="p-2 bg-black flex-1 min-h-0"><StrikeChartView ticker={ticker} contracts={filtered} metric={m} /></div></Panel> },
          { key: "surface", label: "3D SURFACE", content: <Panel title="3D Surface Projection" subtitle={`${ticker.symbol} · drag to rotate`} noPad className="h-full flex flex-col"><div className="p-2 bg-black flex-1 min-h-0"><SurfaceView ticker={ticker} contracts={filtered} metric={m} /></div></Panel> },
          { key: "tape", label: "LIVE TAPE", content: liveTape },
          { key: "bias", label: "BIAS", content: biasBreakdown },
          { key: "table", label: "STRIKE TABLE", content: <StrikeTable exposures={exposures} ticker={ticker} /> },
        ]}
      />
    </div>
  );
}

// ─────── GREEK LADDER ───────
export function GreeksView({ ticker, exposures }: Ctx) {
  return (
    <Panel title="Greek Ladder" subtitle="Aggregated dealer exposure per strike" noPad>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="bg-secondary/40 sticky top-0">
            <tr className="text-left text-muted-foreground">
              <Th>Strike</Th><Th r>Call OI</Th><Th r>Put OI</Th>
              <Th r>GEX</Th><Th r>DEX</Th><Th r>VEX</Th><Th r>Vanna</Th><Th r>Charm</Th>
            </tr>
          </thead>
          <tbody>
            {exposures.map((p) => {
              const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
              return (
                <tr key={p.strike} className={`border-b border-border/30 ${isSpot ? "bg-primary/10" : "hover:bg-secondary/30"}`}>
                  <Td bold>{p.strike}{isSpot && <span className="ml-1 text-[10px] text-primary">●</span>}</Td>
                  <Td r>{formatNumber(p.callOI, 0)}</Td>
                  <Td r>{formatNumber(p.putOI, 0)}</Td>
                  <Td r tone={p.netGex >= 0 ? "call" : "put"}>{formatNumber(p.netGex)}</Td>
                  <Td r>{formatNumber(p.dex)}</Td>
                  <Td r>{formatNumber(p.vex)}</Td>
                  <Td r>{formatNumber(p.vanna)}</Td>
                  <Td r>{formatNumber(p.charm)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const Th = ({ children, r }: any) => <th className={`py-2 px-3 font-semibold text-[10px] uppercase tracking-wider ${r ? "text-right" : ""}`}>{children}</th>;
const Td = ({ children, r, bold, tone }: any) => {
  const c = tone === "call" ? "text-call" : tone === "put" ? "text-put" : "";
  return <td className={`py-1.5 px-3 ${r ? "text-right" : ""} ${bold ? "font-semibold" : ""} ${c}`}>{children}</td>;
};

// ─────── DEPTH VIEW ───────
export function DepthView({ ticker, exposures }: Ctx) {
  const max = Math.max(...exposures.map((p) => Math.max(p.callOI, p.putOI)));
  return (
    <Panel title="Order Book Depth" subtitle="Hover bars to inspect strike & OI">
      <div className="space-y-[3px]">
        {exposures.slice().reverse().map((p) => {
          const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
          const tip = `Strike $${p.strike} · Put ${formatNumber(p.putOI, 0)} · Call ${formatNumber(p.callOI, 0)}`;
          return (
            <div
              key={p.strike}
              title={tip}
              className={`grid grid-cols-2 items-center gap-1 group cursor-default ${isSpot ? "ring-1 ring-primary/40 rounded-sm" : ""}`}
            >
              <div className="flex justify-end h-3.5">
                <div
                  className="h-full rounded-l-sm transition-all duration-150 group-hover:brightness-125"
                  style={{
                    width: `${(p.putOI / max) * 100}%`,
                    background: "linear-gradient(90deg, hsl(0 95% 35%), hsl(0 100% 58%))",
                    boxShadow: "0 0 6px hsl(0 100% 55% / 0.45)",
                  }}
                />
              </div>
              <div className="flex h-3.5">
                <div
                  className="h-full rounded-r-sm transition-all duration-150 group-hover:brightness-125"
                  style={{
                    width: `${(p.callOI / max) * 100}%`,
                    background: "linear-gradient(90deg, hsl(140 100% 50%), hsl(140 95% 35%))",
                    boxShadow: "0 0 6px hsl(140 100% 50% / 0.45)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─────── LEVEL SCAN ───────
export function LevelsView({ ticker, exposures, levels }: Ctx) {
  const sorted = [...exposures].sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex)).slice(0, 8);
  return (
    <TerminalTabs
      layoutId="levels-master-tab-bg"
      tabs={[
        {
          key: "top",
          label: "TOP STRIKES",
          content: (
            <Panel title="Top GEX Strikes" subtitle="Largest absolute exposure">
              <div className="space-y-1.5">
                {sorted.map((p) => {
                  const dist = ((p.strike - ticker.spot) / ticker.spot) * 100;
                  return (
                    <div key={p.strike} className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-border/30">
                      <span className="font-semibold">${p.strike}</span>
                      <span className="text-muted-foreground">{dist >= 0 ? "+" : ""}{dist.toFixed(2)}%</span>
                      <span className={p.netGex >= 0 ? "text-call" : "text-put"}>{formatNumber(p.netGex)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ),
        },
        {
          key: "critical",
          label: "CRITICAL",
          content: (
            <Panel title="Critical Levels">
              <div className="grid grid-cols-2 gap-2">
                <StatBlock label="Call Wall" value={`$${levels.callWall}`} tone="call" sub={`${(((levels.callWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                <StatBlock label="Put Wall" value={`$${levels.putWall}`} tone="put" sub={`${(((levels.putWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                <StatBlock label="Gamma Flip" value={levels.gammaFlip ? `$${levels.gammaFlip}` : "—"} tone="warning" />
                <StatBlock label="Spot" value={`$${ticker.spot}`} tone="primary" />
              </div>
              <div className="mt-3 p-3 rounded bg-secondary/40 text-xs leading-relaxed">
                <div className="font-semibold mb-1 text-foreground">Reading</div>
                <p className="text-muted-foreground">
                  Spot is {ticker.spot > (levels.gammaFlip ?? 0) ? "above" : "below"} the gamma flip — dealers are{" "}
                  <span className={ticker.spot > (levels.gammaFlip ?? 0) ? "text-call" : "text-put"}>
                    {ticker.spot > (levels.gammaFlip ?? 0) ? "long gamma (suppressing volatility)" : "short gamma (amplifying moves)"}
                  </span>.
                </p>
              </div>
            </Panel>
          ),
        },
      ]}
    />
  );
}

// ─────── HEDGE PRESSURE ───────
export function HedgeView({ ticker, exposures }: Ctx) {
  // pressure = sum(dex * (strike - spot))
  const pressure = exposures.reduce((s, p) => s + p.dex * (p.strike - ticker.spot) / ticker.spot, 0);
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);
  const netVex = exposures.reduce((s, p) => s + p.vex, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBlock label="Net DEX" value={formatNumber(netDex)} tone={netDex >= 0 ? "call" : "put"} />
        <StatBlock label="Net VEX" value={formatNumber(netVex)} tone={netVex >= 0 ? "call" : "put"} />
        <StatBlock label="Hedge pressure" value={formatNumber(pressure)} tone={pressure >= 0 ? "call" : "put"} sub="bias direction" />
        <StatBlock label="Bias" value={pressure >= 0 ? "BULLISH" : "BEARISH"} tone={pressure >= 0 ? "call" : "put"} />
      </div>
      <Panel title="DEX per strike">
        <ExposureChart data={exposures} spot={ticker.spot} metric="dex" />
      </Panel>
    </div>
  );
}

// ─────── VANNA / CHARM ───────
export function VannaCharmView({ ticker, exposures }: Ctx) {
  return (
    <Panel title="Vanna / Charm Exposure" subtitle={`${ticker.symbol} · second-order greeks`} noPad>
      <div className="p-3">
        <TerminalTabs
          layoutId="vanna-charm-tab-bg"
          tabs={[
            {
              key: "vanna",
              label: "VANNA",
              content: <ExposureChart data={exposures} spot={ticker.spot} metric="vanna" />,
            },
            {
              key: "charm",
              label: "CHARM",
              content: <ExposureChart data={exposures} spot={ticker.spot} metric="charm" />,
            },
          ]}
        />
      </div>
    </Panel>
  );
}

// ─────── VEGA / THETA ───────
export function VegaThetaView({ ticker, contracts, exposures }: Ctx) {
  const [live, setLive] = useState(true);
  const [expiryFilter, setExpiryFilter] = useState<string>("all");
  const [tick, setTick] = useState(0);

  // Live ticker for subtle pulsing values
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), 2500);
    return () => clearInterval(id);
  }, [live]);

  // Build per-(strike,expiry) Vega/Theta grid
  const grid = useMemo(() => {
    const SQRT_2PI = Math.sqrt(2 * Math.PI);
    const pdf = (x: number) => Math.exp(-0.5 * x * x) / SQRT_2PI;
    const cdfApprox = (x: number) => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      const ax = Math.abs(x) / Math.SQRT2;
      const t = 1 / (1 + p * ax);
      const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
      return 0.5 * (1 + sign * y);
    };
    const r = 0.05;
    const map = new Map<string, { strike: number; expiry: number; vega: number; theta: number; iv: number; n: number }>();
    for (const c of contracts) {
      const T = Math.max(c.expiry, 1) / 365;
      const sigma = c.iv;
      if (sigma <= 0 || T <= 0) continue;
      const d1 = (Math.log(ticker.spot / c.strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      const nd1 = pdf(d1);
      const vega = ticker.spot * nd1 * Math.sqrt(T);
      // Theta per year, then convert to per-day
      const thetaCall = -(ticker.spot * nd1 * sigma) / (2 * Math.sqrt(T)) - r * c.strike * Math.exp(-r * T) * cdfApprox(d2);
      const thetaPut  = -(ticker.spot * nd1 * sigma) / (2 * Math.sqrt(T)) + r * c.strike * Math.exp(-r * T) * cdfApprox(-d2);
      const thetaPerDay = (c.type === "call" ? thetaCall : thetaPut) / 365;
      const sign = c.type === "call" ? 1 : -1; // dealer convention (matches gex.ts)
      const notional = c.oi * 100;
      const key = `${c.strike}|${c.expiry}`;
      const cur = map.get(key) ?? { strike: c.strike, expiry: c.expiry, vega: 0, theta: 0, iv: 0, n: 0 };
      cur.vega += vega * notional * sign;
      cur.theta += thetaPerDay * notional * sign;
      cur.iv += c.iv;
      cur.n++;
      map.set(key, cur);
    }
    return Array.from(map.values()).map((v) => ({ ...v, iv: v.iv / Math.max(1, v.n) }));
  }, [contracts, ticker.spot]);

  const allExpiries = useMemo(
    () => Array.from(new Set(grid.map((g) => g.expiry))).sort((a, b) => a - b),
    [grid]
  );
  const visibleExpiries = expiryFilter === "all" ? allExpiries : allExpiries.filter((e) => String(e) === expiryFilter);

  const allStrikes = useMemo(() => {
    const set = new Set<number>();
    for (const g of grid) if (visibleExpiries.includes(g.expiry)) set.add(g.strike);
    return Array.from(set).sort((a, b) => b - a); // high → low (top to bottom)
  }, [grid, visibleExpiries]);

  const cellMap = useMemo(() => {
    const m = new Map<string, { vega: number; theta: number; iv: number }>();
    for (const g of grid) m.set(`${g.strike}|${g.expiry}`, { vega: g.vega, theta: g.theta, iv: g.iv });
    return m;
  }, [grid]);

  // Header KPIs (filtered)
  const filteredCells = grid.filter((g) => visibleExpiries.includes(g.expiry));
  const netVega = filteredCells.reduce((s, c) => s + c.vega, 0);
  const netTheta = filteredCells.reduce((s, c) => s + c.theta, 0);
  const totalVanna = exposures.reduce((s, p) => s + Math.abs(p.vanna), 0);
  const totalCharm = exposures.reduce((s, p) => s + Math.abs(p.charm), 0);
  const vannaCharmRatio = totalCharm > 0 ? totalVanna / totalCharm : 0;

  // Per-strike aggregated series for area chart
  const series = useMemo(() => {
    const m = new Map<number, { strike: number; vega: number; theta: number; iv: number; n: number }>();
    for (const c of filteredCells) {
      const cur = m.get(c.strike) ?? { strike: c.strike, vega: 0, theta: 0, iv: 0, n: 0 };
      cur.vega += c.vega;
      cur.theta += c.theta;
      cur.iv += c.iv;
      cur.n++;
      m.set(c.strike, cur);
    }
    return Array.from(m.values())
      .map((v) => ({ strike: v.strike, vega: v.vega, theta: v.theta, iv: (v.iv / Math.max(1, v.n)) * 100 }))
      .filter((v) => v.strike >= ticker.spot * 0.9 && v.strike <= ticker.spot * 1.1)
      .sort((a, b) => a.strike - b.strike);
  }, [filteredCells, ticker.spot]);

  // Heatmap color scaling
  const maxAbsVega = Math.max(1, ...filteredCells.map((c) => Math.abs(c.vega)));
  const maxAbsTheta = Math.max(1, ...filteredCells.map((c) => Math.abs(c.theta)));

  const fmtExpiryHeader = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dow = ["SUN","MON","TUE","WED","THU","FRI","SAT"][d.getDay()];
    const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
    return { line1: `${days}D (${dow})`, line2: `${mon} ${d.getDate()}` };
  };

  const cellColor = (vega: number, theta: number, iv: number) => {
    const dom = Math.abs(vega) / maxAbsVega >= Math.abs(theta) / maxAbsTheta ? "vega" : "theta";
    if (Math.abs(vega) < maxAbsVega * 0.02 && Math.abs(theta) < maxAbsTheta * 0.02) {
      return { bg: "hsl(0 0% 6%)", fg: "hsl(0 0% 30%)" };
    }
    if (dom === "vega") {
      const intensity = Math.min(1, Math.abs(vega) / maxAbsVega);
      // cyan gradient
      const lightness = 12 + intensity * 38;
      return { bg: `hsl(190 100% ${lightness}%)`, fg: intensity > 0.55 ? "hsl(220 30% 8%)" : "hsl(190 100% 80%)" };
    } else {
      const intensity = Math.min(1, Math.abs(theta) / maxAbsTheta);
      // red/magenta gradient
      const lightness = 12 + intensity * 35;
      return { bg: `hsl(${theta < 0 ? 358 : 320} 90% ${lightness}%)`, fg: intensity > 0.55 ? "hsl(220 30% 8%)" : "hsl(0 100% 85%)" };
    }
  };

  const VEGA_COLOR = "#00e5ff";
  const THETA_COLOR = "#ff3d00";

  return (
    <div className="space-y-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="kpi-card rounded border border-border bg-card/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">NET VEGA</div>
          <div className="text-lg font-bold font-mono mt-0.5 kpi-pulse" style={{ color: VEGA_COLOR }}>
            {netVega >= 0 ? "+" : ""}{formatNumber(netVega)}
          </div>
          <div className="text-[10px] text-muted-foreground">per 1 vol pt</div>
          <span className="kpi-bar" style={{ color: VEGA_COLOR, animationDelay: "0s" }} />
        </div>
        <div className="kpi-card rounded border border-border bg-card/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">NET THETA</div>
          <div className="text-lg font-bold font-mono mt-0.5 kpi-pulse" style={{ color: THETA_COLOR, animationDelay: "1.1s" }}>
            {netTheta >= 0 ? "+" : ""}{formatNumber(netTheta)}
          </div>
          <div className="text-[10px] text-muted-foreground">decay / day</div>
          <span className="kpi-bar" style={{ color: THETA_COLOR, animationDelay: "1.4s" }} />
        </div>
        <div className="kpi-card rounded border border-border bg-card/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">VANNA / CHARM</div>
          <div className="text-lg font-bold font-mono mt-0.5 kpi-pulse text-foreground/80" style={{ animationDelay: "2.2s" }}>
            {vannaCharmRatio.toFixed(2)}
          </div>
          <div className="text-[10px] text-muted-foreground">cross-greek ratio</div>
          <span className="kpi-bar text-muted-foreground" style={{ animationDelay: "2.6s" }} />
        </div>
        <div className="rounded border border-border bg-card/60 px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">EXPIRIES</div>
            <select
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value)}
              className="mt-1 bg-secondary/60 border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
            >
              <option value="all">ALL ({allExpiries.length})</option>
              {allExpiries.map((e) => <option key={e} value={String(e)}>{e}D</option>)}
            </select>
          </div>
          <button
            onClick={() => setLive((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest"
          >
            <span className={`h-2 w-2 rounded-full ${live ? "bg-call animate-pulse" : "bg-muted-foreground"}`} />
            <span className={live ? "text-call" : "text-muted-foreground"}>LIVE</span>
          </button>
        </div>
      </div>

      {/* Heatmap */}
      <Panel title="Vega / Theta Exposure Map" subtitle={`Strikes × expiries · spot $${ticker.spot}`} noPad>
        <div className="overflow-x-auto">
          <table className="text-[10px] font-mono w-full" style={{ borderCollapse: "separate", borderSpacing: 1 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card text-left px-2 py-2 text-muted-foreground text-[9px] uppercase tracking-widest">Strike</th>
                {visibleExpiries.map((exp) => {
                  const h = fmtExpiryHeader(exp);
                  return (
                    <th key={exp} className="px-1 py-2 text-center text-muted-foreground text-[9px] tracking-widest min-w-[70px]">
                      <div>{h.line1}</div>
                      <div className="text-foreground/70">{h.line2}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {allStrikes.map((strike) => {
                const isSpot = Math.abs(strike - ticker.spot) < ticker.strikeStep / 2;
                return (
                  <tr key={strike}>
                    <td
                      className={`sticky left-0 z-10 px-2 py-1 font-bold text-right ${isSpot ? "text-primary-foreground" : "text-foreground"}`}
                      style={{ background: isSpot ? "hsl(190 100% 45%)" : "hsl(var(--card))" }}
                    >
                      {strike}{isSpot && <span className="ml-1">●</span>}
                    </td>
                    {visibleExpiries.map((exp) => {
                      const cell = cellMap.get(`${strike}|${exp}`);
                      if (!cell) {
                        return <td key={exp} style={{ background: "hsl(0 0% 6%)" }} className="px-1 py-1 text-center text-muted-foreground/30">–</td>;
                      }
                      const c = cellColor(cell.vega, cell.theta, cell.iv);
                      return (
                        <td
                          key={exp}
                          title={`Strike ${strike} · ${exp}D\nVega ${formatNumber(cell.vega)}\nTheta ${formatNumber(cell.theta)}\nIV ${(cell.iv * 100).toFixed(1)}%`}
                          style={{ background: c.bg, color: c.fg }}
                          className="px-1 py-1 text-center cursor-default transition-colors"
                        >
                          {formatNumber(cell.vega, 0)}
                        </td>
                      );
                    })}
                    {isSpot && (
                      <td
                        className="absolute"
                        style={{ display: "none" }}
                      />
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: VEGA_COLOR }} /> Vega+ (cyan)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: THETA_COLOR }} /> Theta decay (red)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" /> Spot anchor</span>
          {live && <span className="ml-auto text-call">● LIVE · tick {tick}</span>}
        </div>
      </Panel>

      {/* Area chart Vega vs Theta per strike */}
      <Panel title="Theta Decay vs Vega Sensitivity" subtitle="Per strike · ±10% spot">
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="vegaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VEGA_COLOR} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={VEGA_COLOR} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="thetaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={THETA_COLOR} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={THETA_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="strike" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis yAxisId="v" tick={{ fill: VEGA_COLOR, fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v), 1)} />
              <YAxis yAxisId="t" orientation="right" tick={{ fill: THETA_COLOR, fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v), 1)} />
              <RTooltip
                cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                labelFormatter={(l) => `Strike $${l}`}
                formatter={(v: number, name: string, p: any) => {
                  if (name === "iv") return [`${(v).toFixed(1)}%`, "IV"];
                  return [formatNumber(v), name === "vega" ? "Vega" : "Theta"];
                }}
              />
              <ReferenceLine x={ticker.spot} yAxisId="v" stroke="hsl(var(--primary))" strokeWidth={1.5} label={{ value: `Spot ${ticker.spot}`, fill: "hsl(var(--primary))", fontSize: 10, position: "top" }} />
              <ReferenceLine y={0} yAxisId="v" stroke="hsl(var(--border))" />
              <Line yAxisId="v" type="monotone" dataKey="vega" stroke={VEGA_COLOR} strokeWidth={2} dot={false} fill="url(#vegaFill)" isAnimationActive={false} />
              <Line yAxisId="t" type="monotone" dataKey="theta" stroke={THETA_COLOR} strokeWidth={2} dot={false} fill="url(#thetaFill)" isAnimationActive={false} />
              <Line yAxisId="v" type="monotone" dataKey="iv" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

// ─────── VOLATILITY ───────
export function VolatilityView({ ticker, contracts, exposures }: Ctx) {
  const data = useMemo(() => {
    const expiries = Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b);
    const nearExp = expiries[0] ?? 7;
    const nearContracts = contracts.filter((c) => c.expiry === nearExp);
    const strikes = Array.from(new Set(nearContracts.map((c) => c.strike))).sort((a, b) => a - b);

    const skew = strikes.map((k) => {
      const calls = nearContracts.filter((c) => c.strike === k && c.type === "call");
      const puts = nearContracts.filter((c) => c.strike === k && c.type === "put");
      const callIv = calls.length ? (calls.reduce((s, c) => s + c.iv, 0) / calls.length) * 100 : null;
      const putIv = puts.length ? (puts.reduce((s, c) => s + c.iv, 0) / puts.length) * 100 : null;
      const moneyness = ((k - ticker.spot) / ticker.spot) * 100;
      return { strike: k, moneyness: Number(moneyness.toFixed(1)), callIv, putIv };
    });

    const atmCells = nearContracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
    const atmIv = (atmCells.reduce((s, c) => s + c.iv, 0) / Math.max(1, atmCells.length)) * 100;

    // Term structure: avg ATM IV per expiry
    const term = expiries.map((e) => {
      const slice = contracts.filter((c) => c.expiry === e && Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 2);
      const iv = (slice.reduce((s, c) => s + c.iv, 0) / Math.max(1, slice.length)) * 100;
      return { dte: e, label: e === 1 ? "0DTE" : `${e}d`, iv: Number(iv.toFixed(2)) };
    });

    const lo = ticker.baseIV * 0.55 * 100;
    const hi = ticker.baseIV * 1.55 * 100;
    const rank = Math.max(0, Math.min(100, ((atmIv - lo) / (hi - lo)) * 100));
    const percentile = Math.max(0, Math.min(100, rank * 0.92 + 5));

    const shortTerm = term[0]?.iv ?? atmIv;
    const longTerm = term[term.length - 1]?.iv ?? atmIv;
    const structure = longTerm > shortTerm ? "Contango" : "Backwardation";
    const structureSpread = longTerm - shortTerm;

    const cells = buildIvGrid(contracts);

    const otmPuts = skew.filter((s) => s.moneyness < -3 && s.putIv).map((s) => s.putIv!);
    const otmCalls = skew.filter((s) => s.moneyness > 3 && s.callIv).map((s) => s.callIv!);
    const putAvg = otmPuts.reduce((a, b) => a + b, 0) / Math.max(1, otmPuts.length);
    const callAvg = otmCalls.reduce((a, b) => a + b, 0) / Math.max(1, otmCalls.length);
    const skewBias = putAvg - callAvg;
    const sentiment = skewBias > 1.5 ? "Fear" : skewBias < -1.5 ? "Greed" : "Neutral";

    // Risk reversal per DTE bucket (1..9d) — RR = OTM Call IV − OTM Put IV (negative = put skew)
    const rrDtes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const riskReversal = rrDtes.map((d) => {
      const slice = contracts.filter((c) => c.expiry === d || (d === 9 && c.expiry >= 9 && c.expiry <= 14));
      const calls = slice.filter((c) => c.type === "call" && (c.strike - ticker.spot) / ticker.spot > 0.02 && (c.strike - ticker.spot) / ticker.spot < 0.06);
      const puts = slice.filter((c) => c.type === "put" && (ticker.spot - c.strike) / ticker.spot > 0.02 && (ticker.spot - c.strike) / ticker.spot < 0.06);
      const cIv = calls.length ? (calls.reduce((s, c) => s + c.iv, 0) / calls.length) * 100 : 0;
      const pIv = puts.length ? (puts.reduce((s, c) => s + c.iv, 0) / puts.length) * 100 : 0;
      // Map RR to -10..+10 scale (Greed → Fear)
      let rr = pIv - cIv; // positive = puts more expensive = Fear
      // amplify display range
      rr = Math.max(-10, Math.min(10, rr * 1.6));
      return { dte: `${d}d`, rr: Number(rr.toFixed(2)) };
    });
    const avgRR = riskReversal.reduce((s, r) => s + r.rr, 0) / riskReversal.length;
    const skewLabel = avgRR > 4 ? "STRONG PUT SKEW" : avgRR > 1.5 ? "PUT SKEW" : avgRR < -4 ? "STRONG CALL SKEW" : avgRR < -1.5 ? "CALL SKEW" : "BALANCED";
    const skewMood = avgRR > 1.5 ? "FEAR" : avgRR < -1.5 ? "GREED" : "NEUTRAL";

    // Realized Volatility HV10/20/30 — synthesized from baseIV with deterministic noise
    // (no live tick history available; this provides a stable, plausible series)
    const hvSeries = Array.from({ length: 30 }).map((_, i) => {
      const x = i / 29;
      const base = ticker.baseIV * 100;
      const noise = (n: number) => Math.sin((i + n) * 0.7) * 1.6 + Math.cos((i + n) * 1.3) * 1.1;
      const hv10 = base * (0.78 + 0.18 * Math.sin(i * 0.4)) + noise(0);
      const hv20 = base * (0.85 + 0.10 * Math.sin(i * 0.25 + 1)) + noise(2) * 0.6;
      const hv30 = base * (0.92 + 0.06 * Math.sin(i * 0.15 + 2)) + noise(4) * 0.4;
      const iv  = atmIv * (0.95 + 0.06 * Math.sin(i * 0.3 + 3)) + noise(6) * 0.3;
      return {
        i,
        day: 30 - i,
        hv10: Number(hv10.toFixed(2)),
        hv20: Number(hv20.toFixed(2)),
        hv30: Number(hv30.toFixed(2)),
        iv: Number(iv.toFixed(2)),
      };
    });
    const lastHv = hvSeries[hvSeries.length - 1];
    const ivPremium = lastHv.iv - lastHv.hv30; // positive = options "expensive"

    // Volatility cone — percentiles per window (10/20/30/60/90 days)
    const cone = [
      { window: "10d", median: lastHv.hv10, p25: lastHv.hv10 * 0.85, p75: lastHv.hv10 * 1.18, p10: lastHv.hv10 * 0.7, p90: lastHv.hv10 * 1.4, current: atmIv },
      { window: "20d", median: lastHv.hv20, p25: lastHv.hv20 * 0.86, p75: lastHv.hv20 * 1.16, p10: lastHv.hv20 * 0.72, p90: lastHv.hv20 * 1.36, current: atmIv * 0.98 },
      { window: "30d", median: lastHv.hv30, p25: lastHv.hv30 * 0.88, p75: lastHv.hv30 * 1.14, p10: lastHv.hv30 * 0.74, p90: lastHv.hv30 * 1.32, current: atmIv * 0.96 },
      { window: "60d", median: lastHv.hv30 * 1.04, p25: lastHv.hv30 * 0.92, p75: lastHv.hv30 * 1.12, p10: lastHv.hv30 * 0.78, p90: lastHv.hv30 * 1.28, current: atmIv * 0.94 },
      { window: "90d", median: lastHv.hv30 * 1.08, p25: lastHv.hv30 * 0.95, p75: lastHv.hv30 * 1.10, p10: lastHv.hv30 * 0.82, p90: lastHv.hv30 * 1.24, current: atmIv * 0.92 },
    ].map((c) => ({ ...c, median: Number(c.median.toFixed(2)), p25: Number(c.p25.toFixed(2)), p75: Number(c.p75.toFixed(2)), p10: Number(c.p10.toFixed(2)), p90: Number(c.p90.toFixed(2)), current: Number(c.current.toFixed(2)) }));

    // P/C Ratio (volume proxy via OI) and Net DEX
    const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
    const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
    const pcr = totalPutOI / Math.max(1, totalCallOI);
    const netDex = exposures.reduce((s, p) => s + p.dex, 0);

    return {
      skew, atmIv, rank, percentile, term, structure, structureSpread,
      cells, sentiment, skewBias, nearExp, riskReversal, avgRR, skewLabel, skewMood,
      hvSeries, ivPremium, cone, pcr, netDex,
    };
  }, [contracts, ticker, exposures]);

  // Crosshair sync between Realized Vol chart & cone
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);

  const CYAN = "#00e5ff";
  const RED = "#ff3d00";
  const PURPLE = "#7c4dff";
  const YELLOW = "#facc15";
  const WHITE = "#ffffff";

  const skewColor = data.avgRR > 4 ? RED : data.avgRR > 1.5 ? "#ff7a3d" : data.avgRR < -1.5 ? CYAN : PURPLE;

  const tooltipStyle: React.CSSProperties = {
    background: "rgba(10,10,10,0.95)",
    border: "1px solid #1a1a1a",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "JetBrains Mono, monospace",
    boxShadow: "0 0 12px rgba(0,229,255,0.15)",
  };

  return (
    <div className="space-y-3" style={{ background: "#0a0a0a" }}>
      {/* ───── Top critical KPIs (Cyber-Quant) ───── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div className="kpi-card rounded border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#666]">ATM IV</div>
          <div className="text-2xl font-bold font-jetbrains kpi-pulse mt-1" style={{ color: CYAN }}>
            {data.atmIv.toFixed(1)}%
          </div>
          <div className="text-[10px] text-[#666] mt-0.5">{data.nearExp}DTE · IV Rank {data.rank.toFixed(0)}</div>
          <span className="kpi-bar" style={{ color: CYAN }} />
        </div>
        <div className="kpi-card rounded border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#666]">P/C RATIO</div>
          <div className="text-2xl font-bold font-jetbrains kpi-pulse mt-1" style={{ color: data.pcr > 1.2 ? RED : data.pcr < 0.8 ? CYAN : PURPLE, animationDelay: "1s" }}>
            {data.pcr.toFixed(2)}
          </div>
          <div className="text-[10px] text-[#666] mt-0.5">
            {data.pcr > 1.2 ? "defensive bias" : data.pcr < 0.8 ? "aggressive bias" : "balanced"}
          </div>
          <span className="kpi-bar" style={{ color: data.pcr > 1.2 ? RED : CYAN, animationDelay: "1.3s" }} />
        </div>
        <div className="kpi-card rounded border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#666]">NET DEX</div>
          <div className="text-2xl font-bold font-jetbrains kpi-pulse mt-1" style={{ color: data.netDex >= 0 ? CYAN : RED, animationDelay: "2s" }}>
            {data.netDex >= 0 ? "+" : ""}{formatNumber(data.netDex)}
          </div>
          <div className="text-[10px] text-[#666] mt-0.5">dollar delta exposure</div>
          <span className="kpi-bar" style={{ color: data.netDex >= 0 ? CYAN : RED, animationDelay: "2.3s" }} />
        </div>
      </div>

      {/* Each visualization is its own tab — full width, no sibling panels */}
      <TerminalTabs
        layoutId="volatility-master-tab-bg"
        tabs={[
          {
            key: "iv3d",
            label: "IV SURFACE",
            content: (
              <Panel title="IV Surface" subtitle="Strike × DTE × Implied Volatility · drag to rotate">
                <IvSurface3D cells={data.cells} spot={ticker.spot} />
              </Panel>
            ),
          },
          {
            key: "skew",
            label: "P/C SKEW",
            content: (
              <Panel
                title="Put/Call Skew"
                subtitle="Risk Reversal · 1d → 9d · Greed (−10) → Fear (+10)"
                right={
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: skewColor, boxShadow: `0 0 8px ${skewColor}` }} />
                    <span className="text-[10px] font-bold tracking-widest font-jetbrains" style={{ color: skewColor }}>
                      {data.skewLabel} — {data.skewMood}
                    </span>
                  </div>
                }
              >
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.riskReversal} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
                      <XAxis dataKey="dte" tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <YAxis domain={[-10, 10]} tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} ticks={[-10, -5, 0, 5, 10]} />
                      <RTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,229,255,0.05)" }} formatter={(v: number) => [`${v.toFixed(2)} RR`, "Risk Reversal"]} />
                      <ReferenceLine y={0} stroke="#333" />
                      <ReferenceLine y={5} stroke={RED} strokeDasharray="2 3" strokeOpacity={0.4} label={{ value: "FEAR", fill: RED, fontSize: 9, position: "right" }} />
                      <ReferenceLine y={-5} stroke={CYAN} strokeDasharray="2 3" strokeOpacity={0.4} label={{ value: "GREED", fill: CYAN, fontSize: 9, position: "right" }} />
                      <Bar dataKey="rr" radius={[2, 2, 0, 0]} shape={(props: any) => {
                        const v = props.payload.rr;
                        const color = v > 5 ? RED : v > 1.5 ? "#ff7a3d" : v < -5 ? CYAN : v < -1.5 ? "#7dd3fc" : PURPLE;
                        return <rect {...props} fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />;
                      }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-jetbrains">
                  <div className="px-2 py-1.5 rounded border border-[#1a1a1a] bg-[#0d0d0d]">
                    <div className="text-[#666] uppercase tracking-widest">Avg RR</div>
                    <div style={{ color: skewColor }} className="text-sm font-bold">{data.avgRR >= 0 ? "+" : ""}{data.avgRR.toFixed(2)}</div>
                  </div>
                  <div className="px-2 py-1.5 rounded border border-[#1a1a1a] bg-[#0d0d0d]">
                    <div className="text-[#666] uppercase tracking-widest">Skew Bias</div>
                    <div style={{ color: data.skewBias > 0 ? RED : CYAN }} className="text-sm font-bold">{data.skewBias >= 0 ? "+" : ""}{data.skewBias.toFixed(2)}pp</div>
                  </div>
                  <div className="px-2 py-1.5 rounded border border-[#1a1a1a] bg-[#0d0d0d]">
                    <div className="text-[#666] uppercase tracking-widest">Sentiment</div>
                    <div style={{ color: data.skewMood === "FEAR" ? RED : data.skewMood === "GREED" ? CYAN : PURPLE }} className="text-sm font-bold">{data.skewMood}</div>
                  </div>
                </div>
              </Panel>
            ),
          },
          {
            key: "realized",
            label: "REALIZED VOL",
            content: (
              <Panel
                title="Realized Volatility"
                subtitle="HV10 / HV20 / HV30 vs IV · last 30 sessions"
                right={
                  <span className="text-[10px] font-jetbrains tracking-widest" style={{ color: data.ivPremium > 0 ? RED : CYAN }}>
                    IV {data.ivPremium > 0 ? "PREMIUM" : "DISCOUNT"} {data.ivPremium >= 0 ? "+" : ""}{data.ivPremium.toFixed(2)}pp
                  </span>
                }
              >
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.hvSeries}
                      margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                      onMouseMove={(s: any) => { if (s?.activeTooltipIndex != null) setCrosshairIdx(s.activeTooltipIndex); }}
                      onMouseLeave={() => setCrosshairIdx(null)}
                    >
                      <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
                      <XAxis dataKey="day" tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(d) => `−${d}d`} reversed />
                      <YAxis tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} unit="%" />
                      <RTooltip
                        contentStyle={tooltipStyle}
                        cursor={{ stroke: CYAN, strokeWidth: 1, strokeDasharray: "3 3" }}
                        labelFormatter={(d) => `T −${d} sessions`}
                        formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name.toUpperCase()]}
                      />
                      {crosshairIdx != null && data.hvSeries[crosshairIdx] && (
                        <ReferenceLine x={data.hvSeries[crosshairIdx].day} stroke={CYAN} strokeDasharray="3 3" strokeOpacity={0.6} />
                      )}
                      <Line type="monotone" dataKey="hv10" stroke={CYAN} strokeWidth={2} dot={false} name="HV10" style={{ filter: `drop-shadow(0 0 2px ${CYAN})` }} />
                      <Line type="monotone" dataKey="hv20" stroke={YELLOW} strokeWidth={1.8} dot={false} name="HV20" style={{ filter: `drop-shadow(0 0 2px ${YELLOW})` }} />
                      <Line type="monotone" dataKey="hv30" stroke={PURPLE} strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="HV30" />
                      <Line type="monotone" dataKey="iv" stroke={WHITE} strokeWidth={2.2} dot={false} name="IV" style={{ filter: `drop-shadow(0 0 3px ${WHITE})` }} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            ),
          },
          {
            key: "term",
            label: "TERM STRUCTURE",
            content: (
              <Panel
                title="IV Term Structure"
                subtitle={data.structure === "Contango" ? "Forward IV > spot IV · normal regime" : "Inverted · stress regime"}
                right={
                  <span className="text-[10px] font-jetbrains tracking-widest font-bold" style={{ color: data.structure === "Contango" ? CYAN : RED }}>
                    {data.structure.toUpperCase()} {data.structureSpread >= 0 ? "+" : ""}{data.structureSpread.toFixed(2)}pp
                  </span>
                }
              >
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.term} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
                      <XAxis dataKey="label" tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <YAxis tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} unit="%" />
                      <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`, "ATM IV"]} cursor={{ stroke: CYAN, strokeDasharray: "3 3" }} />
                      <ReferenceLine y={data.atmIv} stroke={WHITE} strokeDasharray="2 3" strokeOpacity={0.4} label={{ value: "Spot IV", fill: WHITE, fontSize: 9, position: "right" }} />
                      <Line
                        type="monotone"
                        dataKey="iv"
                        stroke={data.structure === "Contango" ? CYAN : RED}
                        strokeWidth={2.5}
                        dot={{ fill: data.structure === "Contango" ? CYAN : RED, r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        style={{ filter: `drop-shadow(0 0 3px ${data.structure === "Contango" ? CYAN : RED})` }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            ),
          },
          {
            key: "cone",
            label: "VOL CONE",
            content: (
              <Panel title="Volatility Cone" subtitle="Historical percentiles per window · current vs envelope">
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.cone} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
                      <XAxis dataKey="window" tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <YAxis tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} unit="%" />
                      <RTooltip contentStyle={tooltipStyle} cursor={{ stroke: CYAN, strokeDasharray: "3 3" }} formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n.toUpperCase()]} />
                      <Line type="monotone" dataKey="p90" stroke={RED} strokeWidth={1} strokeDasharray="3 3" dot={false} name="90th" />
                      <Line type="monotone" dataKey="p75" stroke="#ff7a3d" strokeWidth={1.2} dot={false} name="75th" />
                      <Line type="monotone" dataKey="median" stroke={WHITE} strokeWidth={2} dot={{ fill: WHITE, r: 3 }} name="Median" style={{ filter: `drop-shadow(0 0 2px ${WHITE})` }} />
                      <Line type="monotone" dataKey="p25" stroke="#7dd3fc" strokeWidth={1.2} dot={false} name="25th" />
                      <Line type="monotone" dataKey="p10" stroke={CYAN} strokeWidth={1} strokeDasharray="3 3" dot={false} name="10th" />
                      <Line type="monotone" dataKey="current" stroke={YELLOW} strokeWidth={2.5} dot={{ fill: YELLOW, r: 4 }} name="Current IV" style={{ filter: `drop-shadow(0 0 4px ${YELLOW})` }} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            ),
          },
          {
            key: "smile",
            label: "VOL SMILE",
            content: (
              <Panel title="Volatility Smile" subtitle={`Calls vs Puts · ${data.nearExp}DTE`}>
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.skew} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
                      <XAxis dataKey="moneyness" tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} unit="%" />
                      <YAxis tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} unit="%" />
                      <RTooltip contentStyle={tooltipStyle} labelFormatter={(v) => `Moneyness ${v}%`} formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n]} />
                      <ReferenceLine x={0} stroke={WHITE} strokeDasharray="3 3" label={{ value: "ATM", fill: WHITE, fontSize: 10, position: "top" }} />
                      <Line type="monotone" dataKey="putIv" stroke={RED} strokeWidth={2} dot={false} name="Puts IV" style={{ filter: `drop-shadow(0 0 2px ${RED})` }} />
                      <Line type="monotone" dataKey="callIv" stroke={CYAN} strokeWidth={2} dot={false} name="Calls IV" style={{ filter: `drop-shadow(0 0 2px ${CYAN})` }} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            ),
          },
          { key: "hill", label: "HILL 3D", content: <GexHillSurfaceForVolatility ticker={ticker} contracts={contracts} /> },
          { key: "gexheat", label: "GEX HEATMAP", content: <GexHeatmapForVolatility ticker={ticker} contracts={contracts} /> },
        ]}
      />
    </div>
  );
}

// ─────── REGIME ───────
export function RegimeView({ ticker, levels, exposures }: Ctx) {
  const aboveFlip = levels.gammaFlip ? ticker.spot > levels.gammaFlip : levels.totalGex >= 0;
  const regime = aboveFlip ? "POSITIVE GAMMA" : "NEGATIVE GAMMA";
  const desc = aboveFlip
    ? "Dealers are long gamma. Volatility is suppressed; intraday moves get faded back to spot. Mean-reverting environment."
    : "Dealers are short gamma. Volatility is amplified; trends extend. Breakout / momentum environment.";
  const distFlip = levels.gammaFlip ? ((ticker.spot - levels.gammaFlip) / levels.gammaFlip) * 100 : 0;

  return (
    <TerminalTabs
      layoutId="regime-master-tab-bg"
      tabs={[
        {
          key: "regime",
          label: "REGIME",
          content: (
            <Panel title="Market Regime">
              <div className="text-center py-6">
                <div className={`inline-block px-4 py-2 rounded font-bold tracking-wider text-lg ${aboveFlip ? "bg-call/20 text-call border border-call/40" : "bg-put/20 text-put border border-put/40"}`}>
                  {regime}
                </div>
                <p className="mt-4 text-sm text-muted-foreground max-w-xl mx-auto">{desc}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <StatBlock label="Total GEX" value={formatNumber(levels.totalGex)} tone={levels.totalGex >= 0 ? "call" : "put"} />
                <StatBlock label="Gamma Flip" value={levels.gammaFlip ? `$${levels.gammaFlip}` : "—"} tone="warning" />
                <StatBlock label="Spot vs Flip" value={`${distFlip >= 0 ? "+" : ""}${distFlip.toFixed(2)}%`} tone={distFlip >= 0 ? "call" : "put"} />
              </div>
            </Panel>
          ),
        },
        {
          key: "cumgex",
          label: "CUM GEX",
          content: (
            <Panel title="Cumulative GEX curve">
              <CumGexChart exposures={exposures} spot={ticker.spot} flip={levels.gammaFlip} />
            </Panel>
          ),
        },
      ]}
    />
  );
}

function CumGexChart({ exposures, spot, flip }: { exposures: ExposurePoint[]; spot: number; flip: number | null }) {
  const sorted = [...exposures].sort((a, b) => a.strike - b.strike);
  let cum = 0;
  const pts = sorted.map((p) => { cum += p.netGex; return { k: p.strike, v: cum }; });
  const max = Math.max(...pts.map((p) => p.v));
  const min = Math.min(...pts.map((p) => p.v));
  const range = max - min || 1;
  const zeroY = 240 - ((0 - min) / range) * 220 - 10;
  return (
    <div className="h-64 w-full">
      <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="w-full h-full">
        <line x1="0" y1={zeroY} x2="600" y2={zeroY} stroke="hsl(38 92% 55%)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        {flip && (() => {
          const fx = ((flip - pts[0].k) / (pts[pts.length - 1].k - pts[0].k)) * 600;
          return <line x1={fx} y1="0" x2={fx} y2="240" stroke="hsl(38 92% 55%)" strokeWidth="1" />;
        })()}
        {(() => {
          const sx = ((spot - pts[0].k) / (pts[pts.length - 1].k - pts[0].k)) * 600;
          return <line x1={sx} y1="0" x2={sx} y2="240" stroke="hsl(180 100% 50%)" strokeWidth="1" strokeDasharray="3 3" />;
        })()}
        <path
          d={pts.map((p, i) => {
            const x = (i / (pts.length - 1)) * 600;
            const y = 240 - ((p.v - min) / range) * 220 - 10;
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          }).join(" ")}
          fill="none"
          stroke="hsl(180 100% 50%)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

// ─────── Strike table (used by GEX/DEX) ───────
function StrikeTable({ exposures, ticker }: { exposures: ExposurePoint[]; ticker: DemoTicker }) {
  return (
    <Panel title="Strike Detail" noPad>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead className="bg-secondary/40 sticky top-0">
            <tr className="text-left text-muted-foreground">
              <Th>Strike</Th><Th r>Call OI</Th><Th r>Put OI</Th><Th r>Call GEX</Th><Th r>Put GEX</Th><Th r>Net GEX</Th><Th r>DEX</Th>
            </tr>
          </thead>
          <tbody>
            {exposures.map((p) => {
              const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
              return (
                <tr key={p.strike} className={`border-b border-border/30 ${isSpot ? "bg-primary/10" : "hover:bg-secondary/30"}`}>
                  <Td bold>{p.strike}{isSpot && <span className="ml-1 text-[10px] text-primary">●</span>}</Td>
                  <Td r>{formatNumber(p.callOI, 0)}</Td>
                  <Td r>{formatNumber(p.putOI, 0)}</Td>
                  <Td r tone="call">{formatNumber(p.callGex)}</Td>
                  <Td r tone="put">{formatNumber(p.putGex)}</Td>
                  <Td r tone={p.netGex >= 0 ? "call" : "put"}>{formatNumber(p.netGex)}</Td>
                  <Td r>{formatNumber(p.dex)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─────── OI ANALYTICS (horizontal bars + Max Pain + DEX Bias) ───────
export function OiAnalyticsView({ ticker, exposures, contracts }: Ctx) {
  const [metric, setMetric] = useState<"netGex" | "dex">("netGex");
  const maxPain = useMemo(() => computeMaxPain(exposures), [exposures]);
  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);
  const callWall = exposures.reduce((b, p) => (p.callGex > b.callGex ? p : b), exposures[0]).strike;
  const putWall = exposures.reduce((b, p) => (p.putGex < b.putGex ? p : b), exposures[0]).strike;
  const atmContracts = contracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
  const atmIv = atmContracts.length ? (atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length) * 100 : ticker.baseIV * 100;

  const biasRatio = netDex / Math.max(Math.abs(totalCallOI - totalPutOI) * ticker.spot, 1);
  let bias: { label: string; tone: "call" | "put" | "warning" };
  const absDex = Math.abs(netDex);
  if (absDex < 1e6) bias = { label: "NEUTRAL", tone: "warning" };
  else if (netDex > 0) bias = { label: biasRatio > 0.5 ? "CALL HEAVY" : "CALL LEAN", tone: "call" };
  else bias = { label: biasRatio < -0.5 ? "PUT HEAVY" : "PUT LEAN", tone: "put" };

  const max = Math.max(...exposures.map((p) => Math.abs(p[metric])));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatBlock label="Spot" value={`$${ticker.spot.toLocaleString()}`} tone="primary" />
        <StatBlock label="Call Wall" value={`$${callWall}`} tone="call" />
        <StatBlock label="Put Wall" value={`$${putWall}`} tone="put" />
        <StatBlock label="Max Pain" value={`$${maxPain}`} tone="warning" sub={`${(((maxPain - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
        <StatBlock label="ATM IV" value={`${atmIv.toFixed(2)}%`} tone="primary" />
        <StatBlock label="DEX Bias" value={bias.label} tone={bias.tone} sub={formatNumber(netDex)} />
      </div>

      <Panel
        title="Net Exposure by Strike"
        subtitle="Notional ($) per strike — green = positive, red = negative"
        right={
          <Tabs value={metric} onValueChange={(v) => setMetric(v as any)}>
            <TabsList className="h-7">
              <TabsTrigger value="netGex" className="text-xs h-5 px-2">Net GEX</TabsTrigger>
              <TabsTrigger value="dex" className="text-xs h-5 px-2">Net DEX</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <HorizontalBars exposures={exposures} metric={metric} max={max} spot={ticker.spot} maxPain={maxPain} />
      </Panel>
    </div>
  );
}

function HorizontalBars({ exposures, metric, max, spot, maxPain }: {
  exposures: ExposurePoint[]; metric: "netGex" | "dex"; max: number; spot: number; maxPain: number;
}) {
  const sorted = [...exposures].sort((a, b) => b.strike - a.strike);
  const [hover, setHover] = useState<{ strike: number; v: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative space-y-0.5 max-h-[380px] overflow-y-auto pr-1"
      onMouseLeave={() => setHover(null)}
    >
      {sorted.map((p) => {
        const v = p[metric];
        const pct = (Math.abs(v) / max) * 50;
        const isSpot = Math.abs(p.strike - spot) < (spot * 0.001);
        const isMaxPain = p.strike === maxPain;
        const isHover = hover?.strike === p.strike;
        return (
          <div
            key={p.strike}
            className={`grid grid-cols-[60px_1fr] items-center gap-2 text-[11px] font-mono py-0.5 transition-colors ${isSpot ? "bg-primary/15" : isMaxPain ? "bg-warning/10" : ""} ${isHover ? "bg-primary/10" : ""}`}
            onMouseMove={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              setHover({
                strike: p.strike,
                v,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }}
          >
            <span className={`text-right pr-2 ${isSpot ? "text-primary font-bold" : isMaxPain ? "text-warning font-semibold" : ""}`}>
              {p.strike}
              {isSpot && <span className="ml-1">●</span>}
              {isMaxPain && !isSpot && <span className="ml-1 text-[9px]">MP</span>}
            </span>
            <div className="relative h-4 bg-secondary/30 rounded-sm">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {v >= 0 ? (
                <div
                  className="absolute inset-y-0 left-1/2 bg-call/70 rounded-r-sm transition-all"
                  style={{ width: `${pct}%`, boxShadow: isHover ? "0 0 10px hsl(var(--call) / 0.6)" : undefined }}
                />
              ) : (
                <div
                  className="absolute inset-y-0 right-1/2 bg-put/70 rounded-l-sm transition-all"
                  style={{ width: `${pct}%`, boxShadow: isHover ? "0 0 10px hsl(var(--put) / 0.6)" : undefined }}
                />
              )}
            </div>
          </div>
        );
      })}

      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-30 px-2.5 py-1.5 rounded-md border border-border bg-popover/95 backdrop-blur-sm shadow-lg font-mono text-[11px] whitespace-nowrap"
            style={{
              left: Math.min(hover.x + 14, (containerRef.current?.clientWidth ?? 0) - 160),
              top: hover.y + 14,
            }}
          >
            <div className="text-primary font-semibold">Strike ${hover.strike.toLocaleString()}</div>
            <div className={hover.v >= 0 ? "text-call" : "text-put"}>
              {metric === "netGex" ? "Γ " : "Δ "}
              {hover.v >= 0 ? "+" : ""}{formatNumber(hover.v)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─────── HEATMAP IV + 3D Surface ───────
export function HeatmapView({ ticker, contracts }: Ctx) {
  const grid = buildIvGrid(contracts);
  const expiries = Array.from(new Set(grid.map((c) => c.expiry))).sort((a, b) => a - b);
  const strikes = Array.from(new Set(grid.map((c) => c.strike))).sort((a, b) => b - a);
  const cellMap = new Map(grid.map((c) => [`${c.strike}|${c.expiry}`, c.iv]));
  const ivs = grid.map((c) => c.iv);
  const min = Math.min(...ivs), max = Math.max(...ivs);

  const colorFor = (iv: number) => {
    const t = (iv - min) / (max - min || 1);
    if (t < 0.33) return `hsl(220 80% ${30 + t * 60}%)`;
    if (t < 0.66) return `hsl(${180 - (t - 0.33) * 240} 80% 50%)`;
    return `hsl(${40 - (t - 0.66) * 120} 90% 55%)`;
  };

  const heatmapContent = (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid" style={{ gridTemplateColumns: `60px repeat(${expiries.length}, minmax(50px, 1fr))` }}>
          <div />
          {expiries.map((e) => (
            <div key={`h-${e}`} className="text-[10px] font-mono text-muted-foreground text-center pb-1 border-b border-border">{e}d</div>
          ))}
          {strikes.map((s) => (
            <div key={`row-${s}`} className="contents">
              <div className={`text-[10px] font-mono py-0.5 pr-2 text-right ${Math.abs(s - ticker.spot) < ticker.strikeStep ? "text-primary font-bold" : "text-muted-foreground"}`}>{s}</div>
              {expiries.map((e) => {
                const iv = cellMap.get(`${s}|${e}`);
                return (
                  <div
                    key={`${s}-${e}`}
                    className="h-6 border border-background flex items-center justify-center text-[9px] font-mono text-foreground/90"
                    style={{ background: iv != null ? colorFor(iv) : "transparent" }}
                    title={iv != null ? `IV ${(iv * 100).toFixed(1)}%` : ""}
                  >
                    {iv != null ? (iv * 100).toFixed(0) : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
        <span>Low {(min * 100).toFixed(1)}%</span>
        <div className="flex-1 h-2 rounded" style={{ background: "linear-gradient(90deg, hsl(220 80% 30%), hsl(180 80% 50%), hsl(60 80% 50%), hsl(0 90% 55%))" }} />
        <span>High {(max * 100).toFixed(1)}%</span>
      </div>
    </div>
  );

  return (
    <Panel title="IV Heatmap & Surface" subtitle={`${ticker.symbol} · Implied Volatility · Strike × DTE`} noPad>
      <div className="p-3">
        <TerminalTabs
          layoutId="iv-heatmap-tab-bg"
          tabs={[
            { key: "heatmap", label: "HEATMAP", content: heatmapContent },
            {
              key: "surface",
              label: "3D SURFACE",
              content: <SurfaceChart strikes={strikes.slice().reverse()} expiries={expiries} cellMap={cellMap} min={min} max={max} colorFor={colorFor} />,
            },
          ]}
        />
      </div>
    </Panel>
  );
}

function SurfaceChart({ strikes, expiries, cellMap, min, max, colorFor }: {
  strikes: number[]; expiries: number[]; cellMap: Map<string, number>; min: number; max: number; colorFor: (n: number) => string;
}) {
  const W = 700, H = 380;
  const cellW = 24, cellD = 14, hMax = 130;
  const ox = 80, oy = 280;
  const range = max - min || 1;

  type Q = { d: string; fill: string; depth: number };
  const quads: Q[] = [];

  for (let i = 0; i < strikes.length - 1; i++) {
    for (let j = 0; j < expiries.length - 1; j++) {
      const corners = [
        { si: i, ei: j }, { si: i + 1, ei: j }, { si: i + 1, ei: j + 1 }, { si: i, ei: j + 1 },
      ].map(({ si, ei }) => {
        const iv = cellMap.get(`${strikes[si]}|${expiries[ei]}`) ?? min;
        const h = ((iv - min) / range) * hMax;
        const x = ox + ei * cellW + si * cellD;
        const y = oy - h - si * cellD * 0.6;
        return { x, y, iv };
      });
      const avgIv = corners.reduce((s, c) => s + c.iv, 0) / 4;
      const d = `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`;
      quads.push({ d, fill: colorFor(avgIv), depth: i + j });
    }
  }
  quads.sort((a, b) => a.depth - b.depth);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minHeight: 380 }}>
        <line x1={ox} y1={oy} x2={ox + expiries.length * cellW} y2={oy} stroke="hsl(222 25% 25%)" />
        <line x1={ox} y1={oy} x2={ox - 10 + strikes.length * cellD} y2={oy - strikes.length * cellD * 0.6} stroke="hsl(222 25% 25%)" />
        <line x1={ox} y1={oy} x2={ox} y2={oy - hMax - 20} stroke="hsl(222 25% 25%)" />
        {quads.map((q, i) => (
          <path key={i} d={q.d} fill={q.fill} fillOpacity={0.85} stroke="hsl(222 47% 5%)" strokeWidth="0.5" />
        ))}
        <text x={ox + (expiries.length * cellW) / 2} y={H - 10} textAnchor="middle" fill="hsl(215 20% 60%)" fontSize="10" fontFamily="monospace">DTE (days)</text>
        <text x={20} y={oy - hMax / 2} textAnchor="middle" fill="hsl(215 20% 60%)" fontSize="10" fontFamily="monospace" transform={`rotate(-90 20 ${oy - hMax / 2})`}>IV (%)</text>
        <text x={ox - 5 + strikes.length * cellD * 0.7} y={oy - strikes.length * cellD * 0.4} fill="hsl(215 20% 60%)" fontSize="10" fontFamily="monospace">STRIKE</text>
      </svg>
    </div>
  );
}

// ─────── RISK ───────
export function RiskView({ ticker, exposures, levels, contracts }: Ctx) {
  const totalGamma = exposures.reduce((s, p) => s + Math.abs(p.netGex), 0);
  const concentration = exposures.reduce((s, p) => s + (p.netGex / Math.max(totalGamma, 1)) ** 2, 0);
  const tailPuts = exposures.filter((p) => p.strike < ticker.spot * 0.95).reduce((s, p) => s + p.putOI, 0);
  const tailCalls = exposures.filter((p) => p.strike > ticker.spot * 1.05).reduce((s, p) => s + p.callOI, 0);
  const totalOI = exposures.reduce((s, p) => s + p.callOI + p.putOI, 0);
  const tailRisk = ((tailPuts + tailCalls) / Math.max(totalOI, 1)) * 100;
  const dayWeighted = contracts.reduce((s, c) => s + c.oi / Math.max(c.expiry, 1), 0);
  const distToFlip = levels.gammaFlip ? Math.abs((ticker.spot - levels.gammaFlip) / ticker.spot) * 100 : 100;

  const riskScore = Math.min(100, Math.round(
    concentration * 30 +
    (tailRisk / 50) * 30 +
    (1 / Math.max(distToFlip, 0.1)) * 5 +
    (levels.totalGex < 0 ? 20 : 0)
  ));
  const tone = riskScore > 60 ? "put" : riskScore > 35 ? "warning" : "call";

  return (
    <TerminalTabs
      layoutId="risk-master-tab-bg"
      tabs={[
        {
          key: "score",
          label: "RISK SCORE",
          content: (
            <Panel title="Risk Score" subtitle="Composite measure of structural fragility (0–100)">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className={`text-5xl font-bold font-mono ${tone === "put" ? "text-put" : tone === "warning" ? "text-warning" : "text-call"}`}>{riskScore}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{riskScore > 60 ? "HIGH RISK" : riskScore > 35 ? "ELEVATED" : "STABLE"}</div>
                </div>
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full ${tone === "put" ? "bg-put" : tone === "warning" ? "bg-warning" : "bg-call"}`} style={{ width: `${riskScore}%` }} />
                </div>
              </div>
            </Panel>
          ),
        },
        {
          key: "metrics",
          label: "METRICS",
          content: (
            <Panel title="Risk Metrics">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatBlock label="Concentration" value={(concentration * 100).toFixed(1) + "%"} sub="HHI of GEX" tone={concentration > 0.15 ? "put" : "default"} />
                <StatBlock label="Tail OI" value={tailRisk.toFixed(1) + "%"} sub="strikes ±5%" tone={tailRisk > 30 ? "warning" : "default"} />
                <StatBlock label="Dist to flip" value={distToFlip.toFixed(2) + "%"} sub="closer = fragile" tone={distToFlip < 1 ? "put" : "default"} />
                <StatBlock label="Day-weighted OI" value={formatNumber(dayWeighted, 0)} sub="short-dated load" />
              </div>
            </Panel>
          ),
        },
        {
          key: "scenario",
          label: "SCENARIO",
          content: (
            <Panel title="Scenario — spot ±5%">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[-5, 0, 5].map((pct) => {
                  const newSpot = ticker.spot * (1 + pct / 100);
                  const closest = exposures.reduce((b, p) => Math.abs(p.strike - newSpot) < Math.abs(b.strike - newSpot) ? p : b, exposures[0]);
                  const Icon = pct < 0 ? TrendingDown : pct > 0 ? TrendingUp : Activity;
                  const localTone = pct < 0 ? "text-put" : pct > 0 ? "text-call" : "text-primary";
                  return (
                    <div key={pct} className="rounded border border-border bg-card/60 p-3">
                      <div className={`flex items-center justify-center gap-1 text-xs ${localTone}`}>
                        <Icon className="h-3 w-3" />
                        {pct >= 0 ? "+" : ""}{pct}%
                      </div>
                      <div className="text-base font-mono font-semibold mt-1">${newSpot.toFixed(0)}</div>
                      <div className={`text-xs font-mono mt-1 ${closest.netGex >= 0 ? "text-call" : "text-put"}`}>{formatNumber(closest.netGex)}</div>
                      <div className="text-[10px] text-muted-foreground">net GEX @ K</div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ),
        },
      ]}
    />
  );
}

// ─────── ANOMALY DETECTION ───────
// ─────── ANOMALY DETECTION (Bloomberg-style) ───────
interface AlertItem {
  id: string;
  ts: number;
  kind: "Gamma Spike" | "Delta Flip" | "IV Explosion" | "Volume Surge" | "OI Cluster";
  z: number;
  symbol: string;
  strike: number;
  detail: string;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function AnomalyView({ ticker, exposures, contracts }: Ctx) {
  // ── Static stats from exposures (rolling-mu/sigma proxy) ──
  const gexes = exposures.map((p) => p.netGex);
  const meanG = gexes.reduce((s, x) => s + x, 0) / gexes.length;
  const sdG = Math.sqrt(gexes.reduce((s, x) => s + (x - meanG) ** 2, 0) / gexes.length) || 1;
  const ois = exposures.map((p) => p.callOI + p.putOI);
  const meanO = ois.reduce((s, x) => s + x, 0) / ois.length;
  const sdO = Math.sqrt(ois.reduce((s, x) => s + (x - meanO) ** 2, 0) / ois.length) || 1;
  const ivs = contracts.map((c) => c.iv);
  const meanIv = ivs.reduce((s, x) => s + x, 0) / ivs.length;
  const sdIv = Math.sqrt(ivs.reduce((s, x) => s + (x - meanIv) ** 2, 0) / ivs.length) || 1;

  // Pre-compute candidate anomalies (>2σ in any dimension)
  const candidates = useMemo(() => {
    const out: { kind: AlertItem["kind"]; z: number; strike: number; detail: string }[] = [];
    exposures.forEach((p) => {
      const zG = (p.netGex - meanG) / sdG;
      const zO = (p.callOI + p.putOI - meanO) / sdO;
      if (Math.abs(zG) > 2.09) out.push({ kind: "Gamma Spike", z: zG, strike: p.strike, detail: `Net GEX ${formatNumber(p.netGex)}` });
      if (Math.abs(zO) > 2.09) out.push({ kind: "OI Cluster", z: zO, strike: p.strike, detail: `OI ${formatNumber(p.callOI + p.putOI, 0)}` });
      if (Math.sign(p.dex) !== Math.sign(meanG) && Math.abs(p.dex) > sdG * 1.5) {
        out.push({ kind: "Delta Flip", z: p.dex / sdG, strike: p.strike, detail: `Δ ${formatNumber(p.dex)}` });
      }
    });
    contracts.forEach((c) => {
      const z = (c.iv - meanIv) / sdIv;
      if (Math.abs(z) > 2.5) out.push({ kind: "IV Explosion", z, strike: c.strike, detail: `${c.type.toUpperCase()} ${c.expiry}d · IV ${(c.iv * 100).toFixed(1)}%` });
    });
    return out;
  }, [exposures, contracts, meanG, sdG, meanO, sdO, meanIv, sdIv]);

  // ── Live alert feed (animated) ──
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  useEffect(() => {
    setAlerts([]);
    if (candidates.length === 0) return;
    // Seed with top 4 immediately
    const seed = [...candidates]
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 4)
      .map((c, i) => ({
        id: `${Date.now()}-${i}`,
        ts: Date.now() - i * 12000,
        kind: c.kind, z: c.z, symbol: ticker.symbol, strike: c.strike, detail: c.detail,
      }));
    setAlerts(seed);
    const id = setInterval(() => {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const jitter = (Math.random() - 0.5) * 0.6;
      const newAlert: AlertItem = {
        id: `${Date.now()}-${Math.random()}`,
        ts: Date.now(),
        kind: pick.kind, z: pick.z + jitter, symbol: ticker.symbol, strike: pick.strike, detail: pick.detail,
      };
      setAlerts((prev) => [newAlert, ...prev].slice(0, 18));
    }, 4500);
    return () => clearInterval(id);
  }, [candidates, ticker.symbol]);

  // ── Z-Distance from VWAP (synthetic intraday walk) ──
  const vwapSeries = useMemo(() => {
    const n = 60;
    let p = ticker.spot;
    let sumPV = 0, sumV = 0;
    const data: { i: number; price: number; vwap: number; z: number; anomaly: number | null; buy: number | null; sell: number | null; side: "BUY" | "SELL" | null; sigma: number }[] = [];
    const prices: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = 1 + Math.random();
      p += (Math.random() - 0.5) * ticker.spot * 0.0015 + Math.sin(i / 7) * ticker.spot * 0.0008;
      sumPV += p * v; sumV += v;
      const vwap = sumPV / sumV;
      prices.push(p);
      const recent = prices.slice(-20);
      const m = recent.reduce((s, x) => s + x, 0) / recent.length;
      const sd = Math.sqrt(recent.reduce((s, x) => s + (x - m) ** 2, 0) / recent.length) || 1;
      const z = (p - vwap) / sd;
      const isAnom = Math.abs(z) > 2;
      const side: "BUY" | "SELL" | null = isAnom ? (z < 0 ? "BUY" : "SELL") : null;
      data.push({
        i,
        price: Number(p.toFixed(2)),
        vwap: Number(vwap.toFixed(2)),
        z: Number(z.toFixed(2)),
        sigma: Number(Math.abs(z).toFixed(2)),
        anomaly: isAnom ? z : null,
        buy: side === "BUY" ? z : null,
        sell: side === "SELL" ? z : null,
        side,
      });
    }
    return data;
  }, [ticker.spot, ticker.symbol]);
  const lastZ = vwapSeries[vwapSeries.length - 1]?.z ?? 0;

  // ── Entropy (flow stability) ──
  const entropy = useMemo(() => {
    if (vwapSeries.length < 2) return 0;
    let changes = 0;
    for (let i = 1; i < vwapSeries.length; i++) {
      changes += Math.abs(vwapSeries[i].z - vwapSeries[i - 1].z);
    }
    return Math.min(1, changes / vwapSeries.length / 1.2);
  }, [vwapSeries]);
  const entropyPct = Math.round(entropy * 100);
  const systemStatus = entropy < 0.35 ? "STABLE FLOW" : entropy < 0.65 ? "ELEVATED" : "CHAOS";
  const entropyColor = entropy < 0.35 ? "hsl(180 100% 50%)" : entropy < 0.65 ? "hsl(35 100% 55%)" : "hsl(0 90% 60%)";

  // ── Toast on each NEW alert with strike + BUY/SELL signal ──
  const lastAlertId = useRef<string | null>(null);
  useEffect(() => {
    if (alerts.length === 0) return;
    const top = alerts[0];
    if (lastAlertId.current === top.id) return;
    if (lastAlertId.current === null) { lastAlertId.current = top.id; return; } // skip seed batch
    lastAlertId.current = top.id;
    const side: "BUY" | "SELL" = top.z < 0 ? "BUY" : "SELL";
    const sev = Math.abs(top.z);
    const sigmaTxt = `${top.z >= 0 ? "+" : ""}${top.z.toFixed(2)}σ`;
    const fn = side === "BUY" ? toast.success : toast.error;
    fn(`${side} signal · ${top.kind}`, {
      description: `${top.symbol} @ $${top.strike} · ${sigmaTxt} · ${top.detail}`,
      duration: sev > 2.8 ? 7000 : 4500,
    });
  }, [alerts]);

  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatBlock label="Sigma Threshold" value="2.09σ" tone="warning" sub="5m candle" />
        <StatBlock label="Live Alerts" value={alerts.length} tone="primary" sub="last 18" />
        <StatBlock label="Z (Spot/VWAP)" value={`${lastZ >= 0 ? "+" : ""}${lastZ.toFixed(2)}σ`} tone={Math.abs(lastZ) > 2 ? "warning" : "default"} />
        <StatBlock label="Entropy" value={`${entropyPct}%`} tone={entropy < 0.35 ? "call" : entropy < 0.65 ? "warning" : "put"} sub={systemStatus} />
        <StatBlock label="Symbol" value={ticker.symbol} tone="primary" sub={`spot $${ticker.spot}`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        {/* Live alert feed */}
        <Panel
          title="Anomaly Feed"
          subtitle="Z-Score > 2.09 | 5m"
          className="lg:col-span-2"
          right={<span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" /> LIVE</span>}
        >
          {alerts.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center font-mono">[ awaiting signal · no anomalies above 2.09σ ]</div>
          ) : (
            <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {alerts.map((a) => {
                  const sev = Math.abs(a.z);
                  const color = sev > 3 ? "text-[#ff00ff]" : sev > 2.5 ? "text-warning" : "text-[#facc15]";
                  return (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, x: -16, backgroundColor: "hsl(var(--warning) / 0.18)" }}
                      animate={{ opacity: 1, x: 0, backgroundColor: "hsl(var(--card) / 0)" }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ duration: 0.4 }}
                      className="grid grid-cols-[68px_98px_60px_1fr_70px] gap-2 items-center text-[11px] font-mono py-1.5 px-2 border-b border-border/30 rounded"
                    >
                      <span className="text-muted-foreground">{fmtTime(a.ts)}</span>
                      <span className={`font-semibold flex items-center gap-1 ${color}`}>
                        <Zap className="h-3 w-3" />{a.kind}
                      </span>
                      <span className="text-foreground">{a.symbol}</span>
                      <span className="text-muted-foreground truncate">${a.strike} · {a.detail}</span>
                      <span className={`text-right font-bold ${color}`}>{a.z >= 0 ? "+" : ""}{a.z.toFixed(2)}σ</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </Panel>

        {/* Entropy + System Status */}
        <Panel title="Entropy Manifold" subtitle="Flow stability index">
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-2 font-mono">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">σ-velocity</span>
                <span className="text-2xl font-bold" style={{ color: entropyColor }}>{entropyPct}%</span>
              </div>
              <div className="h-3 rounded-full bg-secondary/60 overflow-hidden border border-border">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${entropyPct}%`, backgroundColor: entropyColor }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{ boxShadow: `0 0 12px ${entropyColor}` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-1">
                <span>STABLE</span><span>NEUTRAL</span><span>CHAOS</span>
              </div>
            </div>

            <div className="rounded border border-border bg-secondary/30 p-3 font-mono text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">SYSTEM STATUS</span>
                <span className="font-bold" style={{ color: entropyColor }}>{systemStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SIGNAL/NOISE</span>
                <span className="text-foreground">{(1 / Math.max(0.05, entropy)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DETECTOR</span>
                <span className="text-call">ONLINE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CANDIDATES</span>
                <span className="text-foreground">{candidates.length}</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Z-Distance from VWAP — anomalías marcadas con BUY/SELL */}
      <Panel
        title="Anomaly Tracker · Z-Distance"
        subtitle="Standard deviations from VWAP · BUY (z < −2σ) / SELL (z > +2σ)"
        right={
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-call" style={{ boxShadow: "0 0 6px hsl(140 100% 50%)" }} /> BUY</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-put" style={{ boxShadow: "0 0 6px hsl(0 100% 55%)" }} /> SELL</span>
            <span className="text-muted-foreground">{vwapSeries.filter((d) => d.side).length} hits</span>
          </div>
        }
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vwapSeries} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis dataKey="i" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={(v) => `t-${60 - Number(v)}`} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} domain={[-3.5, 3.5]} tickFormatter={(v) => `${v}σ`} />
              <RTooltip
                cursor={{ stroke: "hsl(var(--primary))", strokeDasharray: "3 3" }}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border rounded px-3 py-2 font-mono text-[11px] shadow-xl">
                      <div className="text-muted-foreground text-[9px] uppercase tracking-widest mb-1">t-{60 - d.i}</div>
                      <div>Price <span className="text-foreground">${d.price}</span></div>
                      <div>VWAP  <span className="text-muted-foreground">${d.vwap}</span></div>
                      <div>Z     <span style={{ color: d.side === "BUY" ? "hsl(140 100% 50%)" : d.side === "SELL" ? "hsl(0 100% 60%)" : "hsl(var(--foreground))" }}>{d.z >= 0 ? "+" : ""}{d.z}σ</span></div>
                      {d.side && (
                        <div className="mt-1 pt-1 border-t border-border font-bold" style={{ color: d.side === "BUY" ? "hsl(140 100% 50%)" : "hsl(0 100% 60%)" }}>
                          ▶ {d.side} signal · {d.sigma}σ
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={3} stroke="hsl(0 90% 60%)" strokeDasharray="3 3" label={{ value: "+3σ", fill: "hsl(0 90% 60%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={2} stroke="hsl(0 100% 55%)" strokeDasharray="3 3" label={{ value: "+2σ SELL", fill: "hsl(0 100% 55%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
              <ReferenceLine y={-2} stroke="hsl(140 100% 50%)" strokeDasharray="3 3" label={{ value: "-2σ BUY", fill: "hsl(140 100% 50%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={-3} stroke="hsl(0 90% 60%)" strokeDasharray="3 3" label={{ value: "-3σ", fill: "hsl(0 90% 60%)", fontSize: 9, position: "right" }} />
              <Line
                type="monotone"
                dataKey="z"
                stroke="hsl(var(--primary))"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                style={{ filter: "drop-shadow(0 0 2px hsl(var(--primary)))" }}
              />
              <Line
                type="monotone"
                dataKey="buy"
                stroke="transparent"
                isAnimationActive={false}
                dot={(p: any) => {
                  if (p.payload.buy == null) return <g />;
                  return (
                    <g key={`b-${p.payload.i}`}>
                      <circle cx={p.cx} cy={p.cy} r={6} fill="hsl(140 100% 50%)" stroke="#000" strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 5px hsl(140 100% 50%))" }} />
                      <text x={p.cx} y={p.cy + 18} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight="bold" fill="hsl(140 100% 50%)">BUY</text>
                    </g>
                  );
                }}
                activeDot={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="sell"
                stroke="transparent"
                isAnimationActive={false}
                dot={(p: any) => {
                  if (p.payload.sell == null) return <g />;
                  return (
                    <g key={`s-${p.payload.i}`}>
                      <circle cx={p.cx} cy={p.cy} r={6} fill="hsl(0 100% 60%)" stroke="#000" strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 5px hsl(0 100% 60%))" }} />
                      <text x={p.cx} y={p.cy - 12} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight="bold" fill="hsl(0 100% 60%)">SELL</text>
                    </g>
                  );
                }}
                activeDot={false}
                legendType="none"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">
          <div className="rounded border border-call/40 bg-call/5 px-2 py-1.5">
            <span className="text-muted-foreground">OVERSOLD → BUY</span>
            <div className="text-call font-bold">z &lt; -2σ · {vwapSeries.filter((d) => d.side === "BUY").length} hits</div>
          </div>
          <div className="rounded border border-border bg-secondary/30 px-2 py-1.5">
            <span className="text-muted-foreground">NEUTRAL</span>
            <div className="text-foreground font-bold">|z| &lt; 2σ · fair value</div>
          </div>
          <div className="rounded border border-put/40 bg-put/5 px-2 py-1.5">
            <span className="text-muted-foreground">OVERBOUGHT → SELL</span>
            <div className="text-put font-bold">z &gt; +2σ · {vwapSeries.filter((d) => d.side === "SELL").length} hits</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

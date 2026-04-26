import { ExposurePoint, KeyLevels, formatNumber, DemoTicker, OptionContract, computeMaxPain, buildIvGrid, computeExposures, computeKeyLevels } from "@/lib/gex";
import { Panel, StatBlock } from "./Panel";
import { ExposureChart } from "@/components/ExposureChart";
import { GexDexBars } from "./GexDexBars";
import { GexExposureTabs, GexHeatmapPanel, GexSurfacePanel } from "./GexExposureTabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Zap, Shield, Target } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, Legend } from "recharts";
import { IvSurface3D } from "./IvSurface3D";
import { motion, AnimatePresence } from "framer-motion";

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
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatBlock label="ATM IV" value={`${atmIv.toFixed(1)}%`} tone="primary" />
        <StatBlock label="P/C Ratio" value={pcr.toFixed(2)} tone={pcr > 1 ? "put" : "call"} />
        <StatBlock label="Net DEX" value={formatNumber(netDex)} tone={netDex >= 0 ? "call" : "put"} sub="dollar delta" />
        <StatBlock label="Total GEX" value={formatNumber(levels.totalGex)} tone={levels.totalGex >= 0 ? "call" : "put"} sub={levels.totalGex >= 0 ? "Positive regime" : "Negative regime"} />
        <StatBlock label="Call Wall" value={levels.callWall} tone="call" sub="resistance" />
        <StatBlock label="Put Wall" value={levels.putWall} tone="put" sub="support" />
      </div>

      <Panel title="GEX Surface" subtitle={`${ticker.symbol} · spot $${ticker.spot}`}>
        <ExposureChart data={exposures} spot={ticker.spot} callWall={levels.callWall} putWall={levels.putWall} flip={levels.gammaFlip} metric="netGex" />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-3">
        <Panel title="Key Levels">
          <div className="space-y-2 text-sm font-mono">
            <KV k="Call Wall" v={`$${levels.callWall}`} tone="call" />
            <KV k="Put Wall" v={`$${levels.putWall}`} tone="put" />
            <KV k="Gamma Flip" v={levels.gammaFlip ? `$${levels.gammaFlip}` : "—"} tone="warning" />
            <KV k="Spot vs Flip" v={levels.gammaFlip ? `${(((ticker.spot - levels.gammaFlip) / levels.gammaFlip) * 100).toFixed(2)}%` : "—"} />
            <KV k="Distance to Call Wall" v={`${(((levels.callWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
            <KV k="Distance to Put Wall" v={`${(((levels.putWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
          </div>
        </Panel>
        <Panel title="Open Interest">
          <div className="space-y-2 text-sm font-mono">
            <KV k="Call OI" v={formatNumber(totalCallOI, 0)} tone="call" />
            <KV k="Put OI" v={formatNumber(totalPutOI, 0)} tone="put" />
            <KV k="P/C OI Ratio" v={pcr.toFixed(2)} />
            <KV k="Strikes" v={String(exposures.length)} />
            <KV k="Contracts" v={formatNumber(contracts.length, 0)} />
            <KV k="Expiries loaded" v={String(ticker.expiries.length)} />
          </div>
        </Panel>
      </div>
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

  return (
    <div className="space-y-3">
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

      <GexExposureTabs ticker={ticker} contracts={filtered} metric={m} />

      {/* Two dedicated cells: numeric heatmap + 3D surface side-by-side */}
      <div className="grid xl:grid-cols-2 gap-3">
        <GexHeatmapPanel ticker={ticker} contracts={filtered} metric={m} />
        <GexSurfacePanel ticker={ticker} contracts={filtered} metric={m} />
      </div>

      {/* Live tape + bias breakdown */}
      <div className="grid lg:grid-cols-3 gap-3">
        <Panel title="Live Net GEX Tape" subtitle="Updates every 2s" className="lg:col-span-2">
          <div className="h-44">
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
        <Panel title="DEX Bias Breakdown">
          <div className="space-y-2 text-xs font-mono">
            <KV k="Total Call Δ" v={formatNumber(bias.callDex)} tone="call" />
            <KV k="Total Put Δ" v={formatNumber(bias.putDex)} tone="put" />
            <KV k="Net Δ (C − P)" v={formatNumber(bias.net)} tone={bias.net >= 0 ? "call" : "put"} />
            <KV k="Call/Put Ratio" v={bias.ratio.toFixed(2)} />
            <div className="mt-3 p-2 rounded bg-secondary/40 text-[11px] leading-relaxed">
              <div className="font-semibold text-foreground mb-0.5 flex items-center gap-1.5">
                {bias.label === "Call Heavy" ? <TrendingUp className="h-3 w-3 text-call" /> : bias.label === "Put Heavy" ? <TrendingDown className="h-3 w-3 text-put" /> : <Activity className="h-3 w-3 text-warning" />}
                {bias.label}
              </div>
              <p className="text-muted-foreground">
                {bias.label === "Call Heavy" ? "Dealers net short calls — hedging skews bullish into rallies." : bias.label === "Put Heavy" ? "Dealers net long puts — selling pressure on declines amplifies downside." : "Symmetric positioning — directional bias is muted."}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <StrikeTable exposures={exposures} ticker={ticker} />
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
    <Panel title="Order Book Depth" subtitle="Open Interest per strike (calls vs puts)">
      <div className="space-y-1">
        {exposures.slice().reverse().map((p) => {
          const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
          return (
            <div key={p.strike} className={`grid grid-cols-[1fr_60px_1fr] items-center gap-2 text-xs font-mono ${isSpot ? "bg-primary/10 rounded" : ""}`}>
              <div className="flex justify-end items-center h-5">
                <span className="text-put mr-2 w-16 text-right">{formatNumber(p.putOI, 0)}</span>
                <div className="bg-put/30 h-3 rounded-l" style={{ width: `${(p.putOI / max) * 100}%` }} />
              </div>
              <div className={`text-center font-semibold ${isSpot ? "text-primary" : ""}`}>{p.strike}</div>
              <div className="flex items-center h-5">
                <div className="bg-call/30 h-3 rounded-r" style={{ width: `${(p.callOI / max) * 100}%` }} />
                <span className="text-call ml-2 w-16">{formatNumber(p.callOI, 0)}</span>
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
    <div className="grid lg:grid-cols-2 gap-3">
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
    </div>
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
    <div className="space-y-3">
      <Panel title="Vanna Exposure" subtitle="Delta change per IV move">
        <ExposureChart data={exposures} spot={ticker.spot} metric="vanna" />
      </Panel>
      <Panel title="Charm Exposure" subtitle="Delta decay per day">
        <ExposureChart data={exposures} spot={ticker.spot} metric="charm" />
      </Panel>
    </div>
  );
}

// ─────── VEGA / THETA ───────
export function VegaThetaView({ ticker, exposures }: Ctx) {
  const netVex = exposures.reduce((s, p) => s + p.vex, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBlock label="Net VEX" value={formatNumber(netVex)} tone={netVex >= 0 ? "call" : "put"} />
        <StatBlock label="Vol sensitivity" value={`${(netVex / ticker.spot * 100).toFixed(2)}%`} sub="per 1 vol pt" />
        <StatBlock label="Strikes" value={exposures.length} />
        <StatBlock label="ATM" value={`$${ticker.spot}`} tone="primary" />
      </div>
      <Panel title="VEX per strike">
        <ExposureChart data={exposures} spot={ticker.spot} metric="vex" />
      </Panel>
    </div>
  );
}

// ─────── VOLATILITY ───────
export function VolatilityView({ ticker, contracts }: Ctx) {
  const data = useMemo(() => {
    // Skew per side (calls vs puts) at the nearest expiry
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

    // ATM IV
    const atmCells = nearContracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
    const atmIv = (atmCells.reduce((s, c) => s + c.iv, 0) / Math.max(1, atmCells.length)) * 100;

    // Term structure: avg ATM IV per expiry
    const term = expiries.map((e) => {
      const slice = contracts.filter((c) => c.expiry === e && Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 2);
      const iv = (slice.reduce((s, c) => s + c.iv, 0) / Math.max(1, slice.length)) * 100;
      return { dte: e, label: e === 1 ? "0DTE" : `${e}d`, iv: Number(iv.toFixed(2)) };
    });

    // IV Rank / Percentile (simulated 52w range from baseIV)
    const lo = ticker.baseIV * 0.55 * 100;
    const hi = ticker.baseIV * 1.55 * 100;
    const rank = Math.max(0, Math.min(100, ((atmIv - lo) / (hi - lo)) * 100));
    const percentile = Math.max(0, Math.min(100, rank * 0.92 + 5));

    // Term structure shape
    const shortTerm = term[0]?.iv ?? atmIv;
    const longTerm = term[term.length - 1]?.iv ?? atmIv;
    const structure = longTerm > shortTerm ? "Contango" : "Backwardation";
    const structureSpread = longTerm - shortTerm;

    // 3D Surface cells
    const cells = buildIvGrid(contracts);

    // Put/Call skew bias
    const otmPuts = skew.filter((s) => s.moneyness < -3 && s.putIv).map((s) => s.putIv!);
    const otmCalls = skew.filter((s) => s.moneyness > 3 && s.callIv).map((s) => s.callIv!);
    const putAvg = otmPuts.reduce((a, b) => a + b, 0) / Math.max(1, otmPuts.length);
    const callAvg = otmCalls.reduce((a, b) => a + b, 0) / Math.max(1, otmCalls.length);
    const skewBias = putAvg - callAvg;
    const sentiment = skewBias > 1.5 ? "Fear" : skewBias < -1.5 ? "Greed" : "Neutral";

    return { skew, atmIv, rank, percentile, term, structure, structureSpread, cells, sentiment, skewBias, nearExp };
  }, [contracts, ticker]);

  return (
    <div className="space-y-3">
      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatBlock label="ATM IV" value={`${data.atmIv.toFixed(2)}%`} tone="primary" sub={`${data.nearExp}DTE`} />
        <StatBlock label="IV Rank" value={`${data.rank.toFixed(0)}`} tone={data.rank > 50 ? "warning" : "call"} sub="52w range" />
        <StatBlock label="IV Percentile" value={`${data.percentile.toFixed(0)}%`} tone={data.percentile > 70 ? "put" : "call"} />
        <StatBlock label="Term Structure" value={data.structure} tone={data.structure === "Contango" ? "call" : "put"} sub={`${data.structureSpread >= 0 ? "+" : ""}${data.structureSpread.toFixed(2)}pp`} />
        <StatBlock label="Skew Bias" value={`${data.skewBias >= 0 ? "+" : ""}${data.skewBias.toFixed(2)}pp`} tone={data.skewBias > 0 ? "put" : "call"} sub="put − call" />
        <StatBlock label="Sentiment" value={data.sentiment} tone={data.sentiment === "Fear" ? "put" : data.sentiment === "Greed" ? "call" : "warning"} />
      </div>

      {/* 3D Surface */}
      <Panel title="IV 3D Surface" subtitle="Strike × DTE × Implied Volatility · arrastra para rotar">
        <IvSurface3D cells={data.cells} spot={ticker.spot} />
      </Panel>

      {/* Skew + Term Structure */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Panel title="Volatility Smile" subtitle={`Calls vs Puts · ${data.nearExp}DTE`}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.skew} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="moneyness" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} unit="%" />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} unit="%" />
                <RTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  labelFormatter={(v) => `Moneyness ${v}%`}
                />
                <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "ATM", fill: "hsl(var(--primary))", fontSize: 10, position: "top" }} />
                <Line type="monotone" dataKey="putIv" stroke="hsl(var(--put))" strokeWidth={2} dot={false} name="Puts IV" />
                <Line type="monotone" dataKey="callIv" stroke="hsl(var(--call))" strokeWidth={2} dot={false} name="Calls IV" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Term Structure" subtitle={data.structure === "Contango" ? "Largo > corto · normal" : "Corto > largo · estrés"}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.term} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} unit="%" />
                <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Line type="monotone" dataKey="iv" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: "hsl(var(--primary))", r: 4 }} name="ATM IV" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
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
    <div className="space-y-3">
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
      <Panel title="Cumulative GEX curve">
        <CumGexChart exposures={exposures} spot={ticker.spot} flip={levels.gammaFlip} />
      </Panel>
    </div>
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
  return (
    <div className="space-y-0.5 max-h-[600px] overflow-y-auto pr-1">
      {sorted.map((p) => {
        const v = p[metric];
        const pct = (Math.abs(v) / max) * 50;
        const isSpot = Math.abs(p.strike - spot) < (spot * 0.001);
        const isMaxPain = p.strike === maxPain;
        return (
          <div key={p.strike} className={`grid grid-cols-[60px_1fr_60px] items-center gap-2 text-[11px] font-mono py-0.5 ${isSpot ? "bg-primary/15" : isMaxPain ? "bg-warning/10" : ""}`}>
            <span className={`text-right pr-2 ${isSpot ? "text-primary font-bold" : isMaxPain ? "text-warning font-semibold" : ""}`}>
              {p.strike}
              {isSpot && <span className="ml-1">●</span>}
              {isMaxPain && !isSpot && <span className="ml-1 text-[9px]">MP</span>}
            </span>
            <div className="relative h-4 bg-secondary/30 rounded-sm">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {v >= 0 ? (
                <div className="absolute inset-y-0 left-1/2 bg-call/70 rounded-r-sm" style={{ width: `${pct}%` }} />
              ) : (
                <div className="absolute inset-y-0 right-1/2 bg-put/70 rounded-l-sm" style={{ width: `${pct}%` }} />
              )}
            </div>
            <span className={`text-left pl-1 ${v >= 0 ? "text-call" : "text-put"}`}>{formatNumber(v)}</span>
          </div>
        );
      })}
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

  return (
    <div className="space-y-3">
      <Panel title="IV Heatmap" subtitle={`${ticker.symbol} · Implied Volatility · Strike × DTE`}>
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
      </Panel>

      <Panel title="3D IV Surface" subtitle="Isometric projection · Strike × DTE × IV">
        <SurfaceChart strikes={strikes.slice().reverse()} expiries={expiries} cellMap={cellMap} min={min} max={max} colorFor={colorFor} />
      </Panel>
    </div>
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
    <div className="space-y-3">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBlock label="Concentration" value={(concentration * 100).toFixed(1) + "%"} sub="HHI of GEX" tone={concentration > 0.15 ? "put" : "default"} />
        <StatBlock label="Tail OI" value={tailRisk.toFixed(1) + "%"} sub="strikes ±5%" tone={tailRisk > 30 ? "warning" : "default"} />
        <StatBlock label="Dist to flip" value={distToFlip.toFixed(2) + "%"} sub="closer = fragile" tone={distToFlip < 1 ? "put" : "default"} />
        <StatBlock label="Day-weighted OI" value={formatNumber(dayWeighted, 0)} sub="short-dated load" />
      </div>
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
    </div>
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
    const data: { i: number; price: number; vwap: number; z: number }[] = [];
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
      data.push({ i, price: p, vwap, z });
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

      {/* Z-Distance from VWAP */}
      <Panel title="Z-Distance from VWAP" subtitle="Statistical stretch · ±1σ ±2σ ±3σ bands">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vwapSeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis dataKey="i" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} domain={[-3.5, 3.5]} tickFormatter={(v) => `${v}σ`} />
              <RTooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11, fontFamily: "monospace" }}
                formatter={(v: number) => [`${v.toFixed(2)}σ`, "Z"]}
                labelFormatter={(l) => `t-${60 - Number(l)}`}
              />
              <ReferenceLine y={3} stroke="hsl(0 90% 60%)" strokeDasharray="3 3" label={{ value: "+3σ", fill: "hsl(0 90% 60%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={2} stroke="hsl(35 100% 55%)" strokeDasharray="3 3" label={{ value: "+2σ", fill: "hsl(35 100% 55%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" opacity={0.5} />
              <ReferenceLine y={0} stroke="hsl(var(--foreground))" />
              <ReferenceLine y={-1} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" opacity={0.5} />
              <ReferenceLine y={-2} stroke="hsl(35 100% 55%)" strokeDasharray="3 3" label={{ value: "-2σ", fill: "hsl(35 100% 55%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={-3} stroke="hsl(0 90% 60%)" strokeDasharray="3 3" label={{ value: "-3σ", fill: "hsl(0 90% 60%)", fontSize: 9, position: "right" }} />
              <Line type="monotone" dataKey="z" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">
          <div className="rounded border border-border bg-secondary/30 px-2 py-1.5">
            <span className="text-muted-foreground">OVERSOLD ZONE</span>
            <div className="text-call font-bold">z &lt; -2σ → mean reversion long</div>
          </div>
          <div className="rounded border border-border bg-secondary/30 px-2 py-1.5">
            <span className="text-muted-foreground">NEUTRAL</span>
            <div className="text-foreground font-bold">|z| &lt; 1σ → fair value</div>
          </div>
          <div className="rounded border border-border bg-secondary/30 px-2 py-1.5">
            <span className="text-muted-foreground">OVERBOUGHT ZONE</span>
            <div className="text-put font-bold">z &gt; +2σ → mean reversion short</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

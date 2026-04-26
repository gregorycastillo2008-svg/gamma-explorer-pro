import { ExposurePoint, KeyLevels, formatNumber, DemoTicker, OptionContract, computeMaxPain, buildIvGrid } from "@/lib/gex";
import { Panel, StatBlock } from "./Panel";
import { ExposureChart } from "@/components/ExposureChart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";

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
export function GexDexView({ ticker, exposures, levels }: Ctx) {
  const [m, setM] = useState<"netGex" | "dex">("netGex");
  return (
    <div className="space-y-3">
      <Panel
        title="Exposure"
        right={
          <Tabs value={m} onValueChange={(v) => setM(v as any)}>
            <TabsList className="h-7">
              <TabsTrigger value="netGex" className="text-xs h-5 px-2">GEX</TabsTrigger>
              <TabsTrigger value="dex" className="text-xs h-5 px-2">DEX</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <ExposureChart data={exposures} spot={ticker.spot} callWall={levels.callWall} putWall={levels.putWall} flip={levels.gammaFlip} metric={m} />
      </Panel>
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
  // Build IV smile
  const byStrike = new Map<number, number[]>();
  for (const c of contracts) {
    if (!byStrike.has(c.strike)) byStrike.set(c.strike, []);
    byStrike.get(c.strike)!.push(c.iv);
  }
  const smile = Array.from(byStrike.entries())
    .map(([k, ivs]) => ({ k, iv: (ivs.reduce((a, b) => a + b, 0) / ivs.length) * 100 }))
    .sort((a, b) => a.k - b.k);
  const max = Math.max(...smile.map((s) => s.iv));
  const min = Math.min(...smile.map((s) => s.iv));
  const range = max - min || 1;
  const atmIv = smile.find((s) => Math.abs(s.k - ticker.spot) < ticker.strikeStep)?.iv ?? ticker.baseIV * 100;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBlock label="ATM IV" value={`${atmIv.toFixed(2)}%`} tone="primary" />
        <StatBlock label="Max IV" value={`${max.toFixed(2)}%`} tone="put" />
        <StatBlock label="Min IV" value={`${min.toFixed(2)}%`} tone="call" />
        <StatBlock label="Skew range" value={`${range.toFixed(2)}pp`} tone="warning" />
      </div>
      <Panel title="Volatility Smile" subtitle={`IV by strike · ${ticker.symbol}`}>
        <div className="h-64 w-full relative">
          <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="smileGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(180 100% 50%)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="hsl(180 100% 50%)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* grid */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1="0" y1={i * 60} x2="600" y2={i * 60} stroke="hsl(222 25% 16%)" strokeWidth="1" />
            ))}
            {/* spot line */}
            {(() => {
              const spotX = ((ticker.spot - smile[0].k) / (smile[smile.length - 1].k - smile[0].k)) * 600;
              return <line x1={spotX} y1="0" x2={spotX} y2="240" stroke="hsl(180 100% 50%)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />;
            })()}
            {/* area */}
            <path
              d={
                "M 0 240 " +
                smile.map((s, i) => {
                  const x = (i / (smile.length - 1)) * 600;
                  const y = 240 - ((s.iv - min) / range) * 220 - 10;
                  return `L ${x} ${y}`;
                }).join(" ") +
                " L 600 240 Z"
              }
              fill="url(#smileGrad)"
            />
            {/* line */}
            <path
              d={smile.map((s, i) => {
                const x = (i / (smile.length - 1)) * 600;
                const y = 240 - ((s.iv - min) / range) * 220 - 10;
                return `${i === 0 ? "M" : "L"} ${x} ${y}`;
              }).join(" ")}
              fill="none"
              stroke="hsl(180 100% 50%)"
              strokeWidth="2"
            />
          </svg>
        </div>
      </Panel>
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

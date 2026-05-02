import { useEffect, useMemo, useRef, useState } from "react";
import { DemoTicker, ExposurePoint, KeyLevels, OptionContract, formatNumber } from "@/lib/gex";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell,
  ComposedChart, Line, Area, AreaChart, ReferenceLine,
  Tooltip as RTooltip, CartesianGrid,
} from "recharts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

/* ─────────────────────────── Helpers ─────────────────────────── */

const InfoTip = ({ children }: { children: React.ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Info className="h-3 w-3 text-white/30 hover:text-white/70 cursor-help inline-block ml-1" />
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed bg-[#0f1124] border-white/10 text-white/90">
      {children}
    </TooltipContent>
  </Tooltip>
);

const Card = ({ children, className = "", dark = false }: { children: React.ReactNode; className?: string; dark?: boolean }) => (
  <div className={`rounded-lg border border-white/5 ${dark ? "bg-[#0a0c1a]" : "bg-[#0f1124]"} ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ label, info, right }: { label: string; info?: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-4 pt-3 pb-1">
    <div className="flex items-center text-[10px] tracking-[0.18em] uppercase text-white/40 font-mono font-bold">
      {label}
      {info && <TooltipProvider delayDuration={120}><InfoTip>{info}</InfoTip></TooltipProvider>}
    </div>
    {right}
  </div>
);

const StatusPill = ({ tone, text }: { tone: "up" | "down" | "neutral" | "stable"; text: string }) => {
  const map = {
    up:      "bg-rose-500/15 text-rose-300 border border-rose-500/30",
    down:    "bg-sky-500/15 text-sky-300 border border-sky-500/30",
    neutral: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    stable:  "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider ${map[tone]}`}>
      {text}
    </span>
  );
};

/* ─────────────────────────── Main Panel ─────────────────────────── */

export function HedgePressurePanel({ ticker, exposures, levels, contracts }: Props) {
  /* ── ATM IV (real, OI-weighted, nearest expiry) ── */
  const atmIvNow = useMemo(() => {
    const nearest = contracts.reduce((m, c) => (c.expiry < m ? c.expiry : m), Number.POSITIVE_INFINITY);
    const atm = contracts.filter(
      (c) => c.expiry === nearest && Math.abs(c.strike - ticker.spot) <= ticker.strikeStep * 1.5,
    );
    const oiSum = atm.reduce((s, c) => s + c.oi, 0);
    if (oiSum > 0) return (atm.reduce((s, c) => s + c.iv * c.oi, 0) / oiSum) * 100;
    if (atm.length) return (atm.reduce((s, c) => s + c.iv, 0) / atm.length) * 100;
    return ticker.baseIV * 100;
  }, [contracts, ticker]);

  /* ── Session IV history (in-memory tick buffer, reset per symbol) ── */
  const [ivHist, setIvHist] = useState<{ t: number; v: number }[]>([]);
  const lastSymbolRef = useRef(ticker.symbol);
  useEffect(() => {
    if (lastSymbolRef.current !== ticker.symbol) {
      setIvHist([]);
      lastSymbolRef.current = ticker.symbol;
    }
  }, [ticker.symbol]);
  useEffect(() => {
    if (!Number.isFinite(atmIvNow)) return;
    setIvHist((h) => {
      const next = [...h, { t: Date.now(), v: atmIvNow }];
      return next.slice(-180); // keep ~180 ticks
    });
  }, [atmIvNow]);

  const ivMin = ivHist.length ? Math.min(...ivHist.map((p) => p.v)) : atmIvNow;
  const ivMax = ivHist.length ? Math.max(...ivHist.map((p) => p.v)) : atmIvNow;
  const ivOpen = ivHist[0]?.v ?? atmIvNow;
  const ivDelta = atmIvNow - ivOpen;
  const ivTrend: "up" | "down" | "stable" =
    Math.abs(ivDelta) < 0.15 ? "stable" : ivDelta > 0 ? "up" : "down";

  /* ── VANNA FLOW (real ∂Δ/∂σ from chain) ─────────────────────────
     Vanna(BS) ≈ -φ(d1) · d2 / σ. We use it from greeks if present;
     otherwise approximate vega·(1-d1²)/(spot·σ). Net Vanna sums per
     contract = vanna · oi · 100 · spot² (dealer-perspective).        */
  const vannaPerStrike = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of contracts) {
      const sigma = Math.max(c.iv, 0.01);
      const T = Math.max(c.expiry / 365, 1 / 365);
      const ln = Math.log(ticker.spot / Math.max(c.strike, 0.01));
      const d1 = (ln + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
      const phi = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
      const d2 = d1 - sigma * Math.sqrt(T);
      const vanna = -phi * d2 / sigma; // ∂Δ/∂σ per 1.00 vol
      const sign = c.type === "call" ? 1 : -1; // dealer short calls, long puts proxy
      const exposure = sign * vanna * c.oi * 100 * ticker.spot;
      map.set(c.strike, (map.get(c.strike) ?? 0) + exposure);
    }
    return Array.from(map.entries())
      .map(([strike, vanna]) => ({ strike, vanna }))
      .sort((a, b) => a.strike - b.strike);
  }, [contracts, ticker.spot]);

  const netVanna = vannaPerStrike.reduce((s, p) => s + p.vanna, 0);
  const vannaCalls = vannaPerStrike.filter((p) => p.vanna > 0).reduce((s, p) => s + p.vanna, 0);
  const vannaPuts  = vannaPerStrike.filter((p) => p.vanna < 0).reduce((s, p) => s + p.vanna, 0);

  /* ── DEX / GEX bands (used by lower panels) ── */
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);
  const netGex = exposures.reduce((s, p) => s + p.netGex, 0);
  const totalOI = contracts.reduce((s, c) => s + c.oi, 0);

  /* ── Charm (∂Δ/∂t) per strike — daily delta decay ── */
  const charmPerStrike = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of contracts) {
      const sigma = Math.max(c.iv, 0.01);
      const T = Math.max(c.expiry / 365, 1 / 365);
      const ln = Math.log(ticker.spot / Math.max(c.strike, 0.01));
      const d1 = (ln + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      const phi = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
      const charm = -phi * d2 / (2 * T * 365);
      const sign = c.type === "call" ? 1 : -1;
      map.set(c.strike, (map.get(c.strike) ?? 0) + sign * charm * c.oi * 100 * ticker.spot);
    }
    return Array.from(map.entries())
      .map(([strike, charm]) => ({ strike, charm }))
      .sort((a, b) => a.strike - b.strike);
  }, [contracts, ticker.spot]);
  const netCharm = charmPerStrike.reduce((s, p) => s + p.charm, 0);

  /* ── Hedge Pressure index = directional bias of dealer hedging ── */
  const hedgePressure = exposures.reduce(
    (s, p) => s + p.dex * (p.strike - ticker.spot) / ticker.spot, 0,
  );
  const hpiNorm = Math.tanh(hedgePressure / Math.max(Math.abs(netDex), 1)) * 100;

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className="bg-[#0a0c1a] text-white/90 space-y-3 p-3 overflow-y-auto"
        style={{
          height: "100%",
          maxHeight: "100%",
          scrollbarWidth: "thin",
          scrollbarColor: "#2a2d4a transparent",
        }}
      >

        {/* ROW 1 ─ ATM IV / VANNA FLOW / NET DEX SUMMARY */}
        <div className="grid grid-cols-12 gap-3">

          {/* ─── CARD 1: ATM IV ─── */}
          <Card className="col-span-12 lg:col-span-5">
            <CardHeader
              label="ATM IV"
              info="Implied Volatility At-The-Money. OI-weighted across nearest expiry, ±1.5 strike steps from spot. Updates live with the chain."
              right={<StatusPill tone={ivTrend} text={ivTrend === "up" ? "RISING" : ivTrend === "down" ? "FALLING" : "STABLE"} />}
            />
            <div className="px-4">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-bold text-4xl text-white tabular-nums">
                  {atmIvNow.toFixed(2)}%
                </span>
                <span className={`font-mono font-bold text-sm tabular-nums ${ivDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {ivDelta >= 0 ? "+" : ""}{ivDelta.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="h-24 px-2 mt-1 relative">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ivHist.length ? ivHist : [{ t: 0, v: atmIvNow }]} barCategoryGap={0} barGap={0}>
                  <YAxis hide domain={[ivMin * 0.97, ivMax * 1.02]} />
                  <Bar dataKey="v" fill="#ff6b6b" isAnimationActive={false}>
                    {(ivHist.length ? ivHist : [{ t: 0, v: atmIvNow }]).map((_, i, arr) => (
                      <Cell key={i} fill={i === arr.length - 1 ? "#ff9655" : "#ff6b6b"} />
                    ))}
                  </Bar>
                  <ReferenceLine y={ivMax} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 px-4 py-2 text-[10px] font-mono">
              <span className="text-white/50 tabular-nums">{ivMin.toFixed(2)}%</span>
              <span className="text-white/30 text-center tracking-widest">SESSION RANGE</span>
              <span className="text-white/50 text-right tabular-nums">{ivMax.toFixed(2)}%</span>
            </div>
          </Card>

          {/* ─── CARD 2: VANNA FLOW ─── */}
          <Card dark className="col-span-12 lg:col-span-4">
            <CardHeader
              label="Vanna Flow"
              info="Net Vanna = ∂Δ/∂σ aggregated across the chain (dealer perspective). Positive = dealers buy futures when IV rises; negative = dealers sell."
              right={<StatusPill tone={netVanna >= 0 ? "stable" : "up"} text={netVanna >= 0 ? "LONG VANNA" : "SHORT VANNA"} />}
            />
            <div className="px-4">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-bold text-3xl text-white tabular-nums">
                  {netVanna >= 0 ? "+" : ""}{formatNumber(netVanna)}
                </span>
                <span className="text-[10px] text-white/40 font-mono">$/vol-pt</span>
              </div>
            </div>
            <div className="h-24 px-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vannaPerStrike}>
                  <XAxis dataKey="strike" hide />
                  <YAxis hide />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <ReferenceLine x={ticker.spot} stroke="#7c5af7" strokeDasharray="2 2" />
                  <Bar dataKey="vanna" isAnimationActive={false}>
                    {vannaPerStrike.map((p, i) => (
                      <Cell key={i} fill={p.vanna >= 0 ? "#00ff88" : "#ff4466"} />
                    ))}
                  </Bar>
                  <RTooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{ background: "#0f1124", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                    formatter={(v: any) => formatNumber(v as number)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 px-4 py-2 text-[10px] font-mono">
              <span className="text-emerald-400/70 tabular-nums">+{formatNumber(vannaCalls)}</span>
              <span className="text-rose-400/70 text-right tabular-nums">{formatNumber(vannaPuts)}</span>
            </div>
          </Card>

          {/* ─── CARD 3: NET DEX SUMMARY ─── */}
          <Card className="col-span-12 lg:col-span-3">
            <CardHeader
              label="Net DEX"
              info="Dealer dollar-delta exposure across the entire chain. Positive = dealers long delta (sell futures on rallies)."
              right={<StatusPill tone={netDex >= 0 ? "stable" : "up"} text={netDex >= 0 ? "LONG" : "SHORT"} />}
            />
            <div className="px-4 pt-1">
              <div className={`font-mono font-bold text-3xl tabular-nums ${netDex >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {netDex >= 0 ? "+" : ""}{formatNumber(netDex)}
              </div>
              <div className="mt-3 space-y-1.5 text-[11px] font-mono">
                <Row k="Net GEX"   v={`${netGex >= 0 ? "+" : ""}${formatNumber(netGex)}`} tone={netGex >= 0 ? "pos" : "neg"} />
                <Row k="Net Charm" v={`${netCharm >= 0 ? "+" : ""}${formatNumber(netCharm)}`} tone={netCharm >= 0 ? "pos" : "neg"} />
                <Row k="HPI"       v={`${hpiNorm.toFixed(1)}`} tone={hpiNorm >= 0 ? "pos" : "neg"} />
                <Row k="Total OI"  v={formatNumber(totalOI)} />
              </div>
            </div>
          </Card>
        </div>

        {/* ROW 2 ─ HEDGE PRESSURE FLOW (combo chart) */}
        <Card className="p-3">
          <CardHeader
            label="Hedge Pressure Flow · DEX × Distance"
            info="Bars = signed DEX per strike. Line = cumulative dealer dollar-delta. Crossing zero marks the point where dealer hedging flips direction."
          />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={buildHedgeFlow(exposures, ticker.spot)}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="strike" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={(v) => formatNumber(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "rgba(124,90,247,0.7)", fontSize: 10 }} tickFormatter={(v) => formatNumber(v)} />
                <RTooltip
                  contentStyle={{ background: "#0f1124", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                  formatter={(v: any) => formatNumber(v as number)}
                />
                <ReferenceLine yAxisId="left" y={0} stroke="rgba(255,255,255,0.2)" />
                <ReferenceLine yAxisId="left" x={ticker.spot} stroke="#7c5af7" strokeDasharray="3 3" label={{ value: `Spot ${ticker.spot.toFixed(2)}`, fill: "#7c5af7", fontSize: 10, position: "top" }} />
                <Bar yAxisId="left" dataKey="signed" isAnimationActive={false}>
                  {buildHedgeFlow(exposures, ticker.spot).map((p, i) => (
                    <Cell key={i} fill={p.signed >= 0 ? "#00ff88" : "#ff4466"} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="cum" stroke="#7c5af7" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ROW 3 ─ STACKED BARS BY MONEYNESS + CHARM */}
        <div className="grid grid-cols-12 gap-3">
          <Card className="col-span-12 lg:col-span-7 p-3">
            <CardHeader
              label="Dealer Hedge Stack · Calls vs Puts"
              info="Stacked dealer DEX per strike. Green = call delta dealers must hedge; red = put delta. The taller the bar, the higher the hedging flow concentration."
            />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buildStackedDex(exposures)} stackOffset="sign">
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="strike" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={(v) => formatNumber(v)} />
                  <RTooltip
                    contentStyle={{ background: "#0f1124", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                    formatter={(v: any) => formatNumber(v as number)}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <ReferenceLine x={ticker.spot} stroke="#7c5af7" strokeDasharray="2 2" />
                  <Bar dataKey="callDex" stackId="a" fill="#00ff88" isAnimationActive={false} />
                  <Bar dataKey="putDex"  stackId="a" fill="#ff4466" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="col-span-12 lg:col-span-5 p-3">
            <CardHeader
              label="Charm Decay · ∂Δ/∂t"
              info="Daily delta drift from time decay, per strike. Indicates which strikes will mechanically pull dealer hedging tomorrow even with no spot move."
            />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charmPerStrike}>
                  <defs>
                    <linearGradient id="charmFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#7c5af7" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#7c5af7" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="strike" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={(v) => formatNumber(v)} />
                  <RTooltip
                    contentStyle={{ background: "#0f1124", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                    formatter={(v: any) => formatNumber(v as number)}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <ReferenceLine x={ticker.spot} stroke="#7c5af7" strokeDasharray="2 2" />
                  <Area type="monotone" dataKey="charm" stroke="#7c5af7" fill="url(#charmFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

      </div>
    </TooltipProvider>
  );
}

/* ─────────────────────────── Subcomponents ─────────────────────────── */

const Row = ({ k, v, tone }: { k: string; v: string; tone?: "pos" | "neg" }) => (
  <div className="flex items-center justify-between border-b border-white/5 pb-1">
    <span className="text-white/40">{k}</span>
    <span className={`tabular-nums ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-white/80"}`}>{v}</span>
  </div>
);

/* ─────────────────────────── Data builders ─────────────────────────── */

function buildHedgeFlow(exposures: ExposurePoint[], spot: number) {
  const sorted = [...exposures].sort((a, b) => a.strike - b.strike);
  let cum = 0;
  return sorted.map((p) => {
    const signed = p.dex * Math.sign(p.strike - spot);
    cum += p.dex;
    return { strike: p.strike, signed, cum };
  });
}

function buildStackedDex(exposures: ExposurePoint[]) {
  return [...exposures]
    .sort((a, b) => a.strike - b.strike)
    .map((p) => {
      // Approximate split: positive p.dex weighted as calls; negative as puts.
      // exposures already encode signed dealer-perspective per strike.
      const callDex = Math.max(p.dex, 0);
      const putDex  = Math.min(p.dex, 0);
      return { strike: p.strike, callDex, putDex };
    });
}

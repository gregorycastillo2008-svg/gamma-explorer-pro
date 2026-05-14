import React, { useMemo } from "react";
import { formatNumber, DemoTicker, ExposurePoint, KeyLevels, OptionContract } from "@/lib/gex";
import { Panel } from "./Panel";
import { Info } from "lucide-react";
import { VolRegimeSurface } from "./VolRegimeSurface";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

// ── Tooltip component ──────────────────────────────────────────────────────────
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip w-full">
      {children}
      <div className="absolute z-[99] bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 hidden group-hover/tip:block pointer-events-none">
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 text-[10px] text-slate-300 shadow-2xl leading-relaxed font-mono">
          {text}
        </div>
        <div className="w-2 h-2 bg-[#0d1117] border-r border-b border-[#30363d] rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
      </div>
    </div>
  );
}

// ── Signal bar ──────────────────────────────────────────────────────────────────
function SignalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.abs(value) / Math.abs(max) * 100);
  return (
    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ── Metric card with tooltip ────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, color, tip, info,
}: {
  label: string; value: string; sub?: string; color?: string; tip: string; info?: string;
}) {
  return (
    <Tip text={tip}>
      <div className="bg-[#0d111a] border border-white/8 rounded-lg p-3 cursor-help hover:border-white/20 transition-colors">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{label}</span>
          {info && <Info size={9} className="text-slate-600" />}
        </div>
        <div className="text-base font-bold font-mono" style={{ color: color ?? "#e2e8f0" }}>{value}</div>
        {sub && <div className="text-[9px] text-slate-600 mt-0.5">{sub}</div>}
      </div>
    </Tip>
  );
}

// ── Signal row with bar + tooltip ───────────────────────────────────────────────
function SignalRow({
  label, value, signal, barColor, tip,
}: {
  label: string; value: string; signal: number; barColor: string; tip: string;
}) {
  return (
    <Tip text={tip}>
      <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/4 cursor-help transition-colors group/row">
        <div className="w-[110px] shrink-0 text-[10px] text-slate-400 font-medium">{label}</div>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.abs(signal))}%`, background: barColor }}
            />
          </div>
        </div>
        <div className="w-20 text-right text-[10px] font-mono font-semibold" style={{ color: barColor }}>{value}</div>
      </div>
    </Tip>
  );
}

// ── Distance pill ───────────────────────────────────────────────────────────────
function DistancePill({
  label, strike, spot, color, tip,
}: {
  label: string; strike: number | null; spot: number; color: string; tip: string;
}) {
  if (!strike) return null;
  const dist = ((strike - spot) / spot) * 100;
  const sign = dist >= 0 ? "+" : "";
  return (
    <Tip text={tip}>
      <div className="flex items-center justify-between bg-[#0d111a] border border-white/8 rounded-lg px-3 py-2.5 hover:border-white/20 cursor-help transition-colors">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
          <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">${strike.toLocaleString()}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono font-bold" style={{ color }}>{sign}{dist.toFixed(2)}%</div>
          <div className="text-[9px] text-slate-600 mt-0.5">{dist >= 0 ? "above" : "below"} spot</div>
        </div>
      </div>
    </Tip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
export function VolatilityRegimeIndicator({ ticker, exposures, levels, contracts }: Props) {

  const data = useMemo(() => {
    const spot = ticker.spot;

    // ── ATM IV ──────────────────────────────────────────────────────────────────
    const atmContracts = contracts.filter(
      (c) => Math.abs(c.strike - spot) <= ticker.strikeStep * 1.5
    );
    const atmIV = atmContracts.length
      ? (atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length) * 100
      : ticker.baseIV * 100;

    // ── OTM Put / Call IV for skew ──────────────────────────────────────────────
    const otmPuts = contracts.filter(
      (c) => c.type === "put" && c.strike >= spot * 0.90 && c.strike < spot * 0.98 && c.iv > 0
    );
    const otmCalls = contracts.filter(
      (c) => c.type === "call" && c.strike > spot * 1.02 && c.strike <= spot * 1.10 && c.iv > 0
    );
    const putSkewIV = otmPuts.length
      ? (otmPuts.reduce((s, c) => s + c.iv, 0) / otmPuts.length) * 100
      : atmIV + 2;
    const callSkewIV = otmCalls.length
      ? (otmCalls.reduce((s, c) => s + c.iv, 0) / otmCalls.length) * 100
      : atmIV - 1;
    const skew = putSkewIV - callSkewIV; // positive = bearish put skew

    // ── Put/Call Ratio ──────────────────────────────────────────────────────────
    const totalPutOI = contracts.filter((c) => c.type === "put").reduce((s, c) => s + c.oi, 0);
    const totalCallOI = contracts.filter((c) => c.type === "call").reduce((s, c) => s + c.oi, 0);
    const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

    // ── Term Structure slope ────────────────────────────────────────────────────
    const nearContracts = contracts.filter((c) => c.expiry <= 14 && c.iv > 0);
    const farContracts = contracts.filter((c) => c.expiry >= 30 && c.iv > 0);
    const nearIV = nearContracts.length
      ? (nearContracts.reduce((s, c) => s + c.iv, 0) / nearContracts.length) * 100
      : atmIV;
    const farIV = farContracts.length
      ? (farContracts.reduce((s, c) => s + c.iv, 0) / farContracts.length) * 100
      : atmIV * 0.9;
    const termSlope = farIV - nearIV; // negative = inverted (fear)

    // ── Aggregate exposure metrics ──────────────────────────────────────────────
    const netGEX = levels.totalGex;
    const totalVEX = exposures.reduce((s, e) => s + Math.abs(e.vex), 0);
    const netDEX = exposures.reduce((s, e) => s + e.dex, 0);
    const totalCharm = exposures.reduce((s, e) => s + Math.abs(e.charm), 0);
    const totalVanna = exposures.reduce((s, e) => s + Math.abs(e.vanna), 0);

    // ── IV Rank (0-100) — simulated from atm IV vs typical range ───────────────
    const ivLow = ticker.baseIV * 100 * 0.55;
    const ivHigh = ticker.baseIV * 100 * 2.1;
    const ivRank = Math.max(0, Math.min(100, ((atmIV - ivLow) / (ivHigh - ivLow)) * 100));

    // ── Composite Volatility Score (0-100, 100 = maximum stress) ───────────────
    // Signal 1: GEX (0-25 pts): more negative = more stress
    const gexScore = netGEX < 0
      ? Math.min(25, Math.abs(netGEX) / 2e9 * 25)
      : Math.max(0, 25 - (netGEX / 2e9) * 25);

    // Signal 2: IV level (0-25 pts)
    const ivScore = Math.min(25, ((atmIV - 12) / 25) * 25);

    // Signal 3: Put skew (0-20 pts)
    const skewScore = Math.min(20, Math.max(0, (skew / 8) * 20));

    // Signal 4: P/C Ratio (0-15 pts)
    const pcScore = Math.min(15, Math.max(0, (pcRatio - 0.7) / 1.0 * 15));

    // Signal 5: Term structure inversion (0-15 pts)
    const termScore = termSlope < 0
      ? Math.min(15, Math.abs(termSlope) / 6 * 15)
      : 0;

    const compositeScore = Math.round(
      Math.max(0, Math.min(100, gexScore + ivScore + skewScore + pcScore + termScore))
    );

    // ── Regime ─────────────────────────────────────────────────────────────────
    let regime: "LOW" | "TRANSITION" | "HIGH";
    if (compositeScore < 30) regime = "LOW";
    else if (compositeScore > 60) regime = "HIGH";
    else regime = "TRANSITION";

    // ── Dealer positioning label ────────────────────────────────────────────────
    const dealerGamma = netGEX >= 0 ? "LONG GAMMA" : "SHORT GAMMA";
    const dealerPct = Math.min(100, Math.abs(netGEX) / 2e9 * 100);

    return {
      atmIV, skew, putSkewIV, callSkewIV,
      pcRatio, termSlope, nearIV, farIV,
      netGEX, totalVEX, netDEX, totalCharm, totalVanna,
      ivRank, compositeScore, regime,
      dealerGamma, dealerPct,
      gexScore, ivScore, skewScore, pcScore, termScore,
    };
  }, [levels, contracts, exposures, ticker]);

  const COLORS = {
    LOW: { main: "#22c55e", dim: "#22c55e30", pulse: "2.5s" },
    TRANSITION: { main: "#facc15", dim: "#facc1530", pulse: "1.5s" },
    HIGH: { main: "#ef4444", dim: "#ef444430", pulse: "0.8s" },
  };
  const C = COLORS[data.regime];

  const scoreColor = data.compositeScore > 60 ? "#ef4444"
    : data.compositeScore > 35 ? "#facc15" : "#22c55e";

  return (
    <div className="h-full overflow-y-auto space-y-3 p-4 terminal-scrollbar" style={{ background: "#07090f" }}>

      {/* ── REGIME HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 bg-[#0d111a] border border-white/8 rounded-xl p-4">
        {/* Regime badge */}
        <div className="w-[72px] shrink-0 flex flex-col items-center justify-center gap-1.5 py-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: C.main }} />
          <div className="text-[8px] font-black tracking-widest text-center font-mono text-white">
            {data.regime}
          </div>
        </div>

        {/* Score + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Vol Stress Score</span>
          </div>
          {/* Score gauge */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${data.compositeScore}%`,
                  background: `linear-gradient(90deg, #22c55e, #facc15, #ef4444)`,
                }}
              />
            </div>
            <span className="text-xl font-black font-mono" style={{ color: scoreColor }}>
              {data.compositeScore}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 leading-snug">
            {data.regime === "HIGH"
              ? "Dealers SHORT gamma · amplified moves · hedging flows active"
              : data.regime === "LOW"
              ? "Dealers LONG gamma · market pinned · range-bound conditions"
              : "Gamma flip proximity · expanding IV · directional bias unclear"}
          </div>
        </div>
      </div>

      {/* ── CORE METRICS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          label="ATM IV"
          value={`${data.atmIV.toFixed(1)}%`}
          sub={data.atmIV > 25 ? "Elevated" : data.atmIV < 15 ? "Compressed" : "Normal"}
          color={data.atmIV > 25 ? "#ef4444" : data.atmIV < 15 ? "#22c55e" : "#94a3b8"}
          tip="At-the-money Implied Volatility. Calculated as the average IV of options within 1.5 strike steps of the current spot price. High IV = expensive options, more fear in the market."
          info
        />
        <MetricCard
          label="IV Rank"
          value={`${data.ivRank.toFixed(0)}/100`}
          sub={data.ivRank > 70 ? "High — sell premium" : data.ivRank < 30 ? "Low — buy premium" : "Neutral"}
          color={data.ivRank > 70 ? "#ef4444" : data.ivRank < 30 ? "#22c55e" : "#facc15"}
          tip="IV Rank: where current ATM IV sits relative to the symbol's estimated IV range. Above 70 = IV historically elevated (favor selling). Below 30 = IV compressed (favor buying)."
          info
        />
        <MetricCard
          label="Net GEX"
          value={formatNumber(data.netGEX)}
          sub={data.netGEX >= 0 ? "Long gamma" : "Short gamma"}
          color={data.netGEX >= 0 ? "#22c55e" : "#ef4444"}
          tip="Net Gamma Exposure of all dealers in aggregate (calls – puts). Positive = dealers are long gamma (stabilizing force, sells into rallies/buys dips). Negative = dealers are short gamma (amplifies moves)."
          info
        />
        <MetricCard
          label="Put/Call Ratio"
          value={data.pcRatio.toFixed(2)}
          sub={data.pcRatio > 1.2 ? "Bearish hedge" : data.pcRatio < 0.8 ? "Bullish tilt" : "Balanced"}
          color={data.pcRatio > 1.2 ? "#ef4444" : data.pcRatio < 0.8 ? "#22c55e" : "#94a3b8"}
          tip="Total Put OI ÷ Total Call OI across all strikes and expirations. Values above 1.2 signal defensive positioning / fear. Below 0.8 signals bullish sentiment or complacency."
          info
        />
        <MetricCard
          label="25Δ Put Skew"
          value={`${data.skew.toFixed(2)}%`}
          sub={data.skew > 4 ? "Fear premium" : data.skew < 1 ? "Flat skew" : "Normal skew"}
          color={data.skew > 4 ? "#ef4444" : data.skew < 1 ? "#22c55e" : "#facc15"}
          tip={`OTM Put IV (${data.putSkewIV.toFixed(1)}%) minus OTM Call IV (${data.callSkewIV.toFixed(1)}%). Positive skew = puts trade richer than calls = crash/tail hedging demand. Common in equity markets.`}
          info
        />
        <MetricCard
          label="Term Structure"
          value={`${data.termSlope > 0 ? "+" : ""}${data.termSlope.toFixed(1)}%`}
          sub={data.termSlope < -1 ? "⚠ Inverted" : data.termSlope > 2 ? "Steep" : "Normal"}
          color={data.termSlope < -1 ? "#ef4444" : data.termSlope > 3 ? "#22c55e" : "#94a3b8"}
          tip={`Far IV (${data.farIV.toFixed(1)}%) minus Near IV (${data.nearIV.toFixed(1)}%). Negative = inverted term structure = near-term fear spike. Normal = gently upward sloping.`}
          info
        />
      </div>

      {/* ── REGIME SIGNAL BREAKDOWN ────────────────────────────────────────────── */}
      <Panel title="Regime Signals" subtitle="5-factor composite score" noPad>
        <div className="py-1">
          <SignalRow
            label="GEX Position"
            value={`${data.gexScore.toFixed(0)}/25 pts`}
            signal={data.gexScore / 25 * 100}
            barColor={data.gexScore > 15 ? "#ef4444" : data.gexScore > 8 ? "#facc15" : "#22c55e"}
            tip={`GEX signal contribution: ${data.gexScore.toFixed(1)} / 25 pts. Negative Net GEX (${formatNumber(data.netGEX)}) means dealers are short gamma → market-amplifying → high stress signal.`}
          />
          <SignalRow
            label="IV Level"
            value={`${data.ivScore.toFixed(0)}/25 pts`}
            signal={data.ivScore / 25 * 100}
            barColor={data.ivScore > 15 ? "#ef4444" : data.ivScore > 8 ? "#facc15" : "#22c55e"}
            tip={`ATM IV (${data.atmIV.toFixed(1)}%) signal: ${data.ivScore.toFixed(1)} / 25 pts. IV above 25% starts adding significant stress to the composite score.`}
          />
          <SignalRow
            label="Put Skew"
            value={`${data.skewScore.toFixed(0)}/20 pts`}
            signal={data.skewScore / 20 * 100}
            barColor={data.skewScore > 12 ? "#ef4444" : data.skewScore > 6 ? "#facc15" : "#22c55e"}
            tip={`Put skew (${data.skew.toFixed(2)}%) signal: ${data.skewScore.toFixed(1)} / 20 pts. Elevated put skew indicates institutional demand for tail protection, historically precedes higher realized vol.`}
          />
          <SignalRow
            label="P/C Ratio"
            value={`${data.pcScore.toFixed(0)}/15 pts`}
            signal={data.pcScore / 15 * 100}
            barColor={data.pcScore > 9 ? "#ef4444" : data.pcScore > 5 ? "#facc15" : "#22c55e"}
            tip={`Put/Call OI ratio (${data.pcRatio.toFixed(2)}) signal: ${data.pcScore.toFixed(1)} / 15 pts. Ratio above 1.3 indicates significant defensive positioning across the option chain.`}
          />
          <SignalRow
            label="Term Structure"
            value={`${data.termScore.toFixed(0)}/15 pts`}
            signal={data.termScore / 15 * 100}
            barColor={data.termScore > 9 ? "#ef4444" : data.termScore > 5 ? "#facc15" : "#22c55e"}
            tip={`Term structure slope (${data.termSlope.toFixed(2)}%) signal: ${data.termScore.toFixed(1)} / 15 pts. An inverted curve (near IV > far IV) is a classic panic signal — traders paying up for short-dated protection.`}
          />
        </div>
      </Panel>

      {/* ── KEY LEVELS ─────────────────────────────────────────────────────────── */}
      <Panel title="Key Levels" subtitle="Distance from spot" noPad>
        <div className="grid grid-cols-2 gap-2 p-3">
          <DistancePill
            label="Call Wall"
            strike={levels.callWall}
            spot={ticker.spot}
            color="#22c55e"
            tip={`Call Wall at $${levels.callWall.toLocaleString()}: strike with the highest Call GEX accumulation. Acts as a strong resistance ceiling — dealers sell into rallies as spot approaches this level.`}
          />
          <DistancePill
            label="Put Wall"
            strike={levels.putWall}
            spot={ticker.spot}
            color="#ef4444"
            tip={`Put Wall at $${levels.putWall.toLocaleString()}: strike with the highest Put GEX accumulation. Acts as a support floor — dealers buy dips as spot approaches this level (in positive gamma regime).`}
          />
          <DistancePill
            label="Max Pain"
            strike={levels.maxPain}
            spot={ticker.spot}
            color="#a78bfa"
            tip={`Max Pain at $${levels.maxPain.toLocaleString()}: the strike where total option holder losses are maximized (i.e., dealers pay out least). Price has a gravitational tendency toward this level near expiration.`}
          />
          <DistancePill
            label="Gamma Flip"
            strike={levels.gammaFlip}
            spot={ticker.spot}
            color="#facc15"
            tip={`Gamma Flip at $${levels.gammaFlip?.toLocaleString() ?? "N/A"}: the strike where cumulative Net GEX crosses zero. Above = dealers long gamma (stabilizing). Below = dealers short gamma (amplifying). A critical volatility trigger level.`}
          />
        </div>
      </Panel>

      {/* ── DEALER POSITIONING ─────────────────────────────────────────────────── */}
      <Tip text={`Dealer Gamma Positioning: ${data.dealerGamma}. Net GEX of ${formatNumber(data.netGEX)}. ${data.netGEX >= 0 ? "Dealers are net long gamma — they sell into strength and buy weakness, suppressing realized volatility." : "Dealers are net short gamma — they must buy into strength and sell weakness, amplifying realized volatility."}`}>
        <div className="bg-[#0d111a] border border-white/8 rounded-lg p-4 hover:border-white/20 cursor-help transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-1">
              Dealer Gamma Positioning <Info size={9} className="text-slate-600" />
            </span>
            <span className="text-[10px] font-bold font-mono" style={{ color: data.netGEX >= 0 ? "#22c55e" : "#ef4444" }}>
              {data.dealerGamma}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-red-400 w-20 text-right font-mono">SHORT γ</span>
            <div className="flex-1 relative h-3 bg-white/5 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
              {data.netGEX >= 0 ? (
                <div
                  className="absolute inset-y-0 left-1/2 rounded-r-full transition-all duration-700"
                  style={{ width: `${data.dealerPct / 2}%`, background: "#22c55e80" }}
                />
              ) : (
                <div
                  className="absolute inset-y-0 right-1/2 rounded-l-full transition-all duration-700"
                  style={{ width: `${data.dealerPct / 2}%`, background: "#ef444480" }}
                />
              )}
            </div>
            <span className="text-[9px] text-green-400 w-20 font-mono">LONG γ</span>
          </div>
          <div className="flex justify-between text-[8px] text-slate-700 mt-1 px-20">
            <span>Amplifying</span><span>Neutral</span><span>Stabilizing</span>
          </div>
        </div>
      </Tip>

      {/* ── SECONDARY EXPOSURE METRICS ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          label="Vega Exposure"
          value={formatNumber(data.totalVEX)}
          sub="VEX total"
          color="#818cf8"
          tip={`Total Vega Exposure (VEX): ${formatNumber(data.totalVEX)}. Sum of all dealers' aggregate vega positions. High VEX = dealers very sensitive to IV changes. A +1% IV move shifts dealer P&L by the VEX amount.`}
          info
        />
        <MetricCard
          label="Charm Pressure"
          value={formatNumber(data.totalCharm)}
          sub="Δ decay/day"
          color="#f472b6"
          tip={`Total Charm Exposure: ${formatNumber(data.totalCharm)}. Charm measures how much dealer delta exposure decays per calendar day (time decay of delta). High charm near expiry creates time-driven flow.`}
          info
        />
        <MetricCard
          label="Vanna Exposure"
          value={formatNumber(data.totalVanna)}
          sub="Δ per 1% IV"
          color="#38bdf8"
          tip={`Total Vanna Exposure: ${formatNumber(data.totalVanna)}. Vanna is the sensitivity of dealer delta to IV changes. High vanna means IV spikes force dealers to significantly re-hedge delta, creating secondary volatility feedback.`}
          info
        />
      </div>

      {/* ── GEX BY STRIKE CHART ────────────────────────────────────────────────── */}
      <Panel title="GEX by Strike" subtitle="Hover bars for detail" noPad>
        <div className="overflow-x-auto">
          <div className="flex items-end justify-center gap-0.5 px-4 pt-3 pb-1 h-36 min-w-0">
            {exposures.slice(-20).map((exp) => {
              const maxGex = Math.max(...exposures.map((e) => Math.abs(e.netGex))) || 1;
              const height = Math.max(2, (Math.abs(exp.netGex) / maxGex) * 100);
              const isPos = exp.netGex >= 0;
              const isSpot = Math.abs(exp.strike - ticker.spot) < ticker.strikeStep / 2;
              const isFlip = levels.gammaFlip !== null && Math.abs(exp.strike - levels.gammaFlip) < ticker.strikeStep / 2;

              return (
                <div
                  key={exp.strike}
                  className="flex-1 flex flex-col items-center group/bar relative"
                  style={{ minWidth: "12px" }}
                >
                  {/* Hover tooltip for bar */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-50 hidden group-hover/bar:flex flex-col bg-[#0d1117] border border-[#30363d] rounded-md p-2 text-[9px] font-mono text-slate-300 shadow-xl whitespace-nowrap pointer-events-none">
                    <span className="text-slate-500">K: <span className="text-white">${exp.strike}</span></span>
                    <span style={{ color: isPos ? "#22c55e" : "#ef4444" }}>GEX: {formatNumber(exp.netGex)}</span>
                    <span className="text-blue-400">CallOI: {exp.callOI.toLocaleString()}</span>
                    <span className="text-red-400">PutOI: {exp.putOI.toLocaleString()}</span>
                    <span className="text-purple-400">DEX: {formatNumber(exp.dex)}</span>
                    {isSpot && <span className="text-amber-400 font-bold">◄ SPOT</span>}
                    {isFlip && <span className="text-yellow-300 font-bold">⚡ FLIP</span>}
                  </div>
                  <div
                    className="w-full rounded-t transition-all duration-200 group-hover/bar:brightness-150"
                    style={{
                      height: `${height}%`,
                      background: isPos ? "#22c55e" : "#ef4444",
                      border: isSpot ? "1px solid #fbbf24" : isFlip ? "1px solid #facc15" : "none",
                      boxShadow: isSpot ? "0 0 8px #fbbf2480" : isFlip ? "0 0 6px #facc1580" : "none",
                      opacity: 0.85,
                    }}
                  />
                  <span className="text-[7px] text-slate-700 mt-0.5 rotate-0 truncate w-full text-center">
                    {exp.strike >= 1000 ? (exp.strike / 1000).toFixed(1) + "k" : exp.strike}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-4 pb-2 text-[8px] text-slate-600">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-sm inline-block" />Call GEX (bullish)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-sm inline-block" />Put GEX (bearish)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-sm inline-block" />Spot</span>
          </div>
        </div>
      </Panel>

      {/* ── GEX POSITION GAUGE ─────────────────────────────────────────────────── */}
      <Tip text={`Net GEX Gauge: ${formatNumber(data.netGEX)} on a scale of -1T to +1T. The needle position shows where aggregate dealer gamma sits. Center = neutral. Right = strong positive gamma (stabilizing). Left = strong negative gamma (amplifying).`}>
        <div className="bg-[#0d111a] border border-white/8 rounded-lg p-4 hover:border-white/20 cursor-help transition-colors">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center gap-1">
            GEX Position Gauge <Info size={9} className="text-slate-600" />
          </div>
          <div className="relative h-6 bg-gradient-to-r from-red-900/60 via-yellow-900/40 to-green-900/60 rounded-full border border-white/8 overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white transition-all duration-700 shadow-lg"
              style={{
                left: `${Math.max(5, Math.min(95, 50 + (data.netGEX / 2e9) * 45))}%`,
                marginLeft: "-6px",
                background: C.main,
                boxShadow: `0 0 10px ${C.main}`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[8px] text-slate-600 font-mono px-1">
            <span>-1T</span><span>-500B</span><span className="text-slate-400">0</span><span>+500B</span><span>+1T</span>
          </div>
        </div>
      </Tip>

      {/* ── REGIME ANALYSIS ────────────────────────────────────────────────────── */}
      <div className="bg-[#0d111a] border rounded-lg p-4" style={{ borderColor: `${C.main}40` }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full" style={{ background: C.main }} />
          <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.main }}>
            {data.regime === "HIGH" ? "High Volatility Regime" : data.regime === "LOW" ? "Low Volatility Regime" : "Transition Zone"}
          </span>
        </div>
        <div className="space-y-1.5 text-[11px] font-mono leading-relaxed">
          {data.regime === "HIGH" ? (
            <>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Dealers are net short gamma — moves become self-reinforcing</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Realized vol likely to spike; mean-reversion strategies at risk</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Options expensive — buying premium is costly; consider spreads</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Watch Gamma Flip ({levels.gammaFlip ? `$${levels.gammaFlip.toLocaleString()}` : "N/A"}) as key pivot level</div>
            </>
          ) : data.regime === "LOW" ? (
            <>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Dealers long gamma — selling into strength, buying weakness</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Market range-bound between Call Wall (${levels.callWall.toLocaleString()}) & Put Wall (${levels.putWall.toLocaleString()})</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Low IV environment — favorable for premium selling strategies</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Max Pain gravitational pull toward ${levels.maxPain.toLocaleString()} near expiry</div>
            </>
          ) : (
            <>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>GEX near flip zone — dealer hedging direction could reverse</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>IV expanding — option buyers gaining edge vs sellers</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Key pivot: Gamma Flip at {levels.gammaFlip ? `$${levels.gammaFlip.toLocaleString()}` : "N/A"}</div>
              <div className="flex gap-2 text-slate-400"><span style={{ color: C.main }}>▸</span>Reduce position size; wait for regime confirmation</div>
            </>
          )}
        </div>
      </div>

      {/* ── VOL REGIME SURFACE ───────────────────────────────────────────────── */}
      <VolRegimeSurface
        contracts={contracts}
        spot={ticker.spot}
        symbol={ticker.symbol}
        regime={data.regime}
        compositeScore={data.compositeScore}
      />

      {/* Footer */}
      <div className="text-[8px] text-slate-700 text-center font-mono pt-1">
        CBOE Gamma Exposure · {ticker.symbol} · Vol Score {data.compositeScore}/100 · Hover metrics for definitions
      </div>
    </div>
  );
}

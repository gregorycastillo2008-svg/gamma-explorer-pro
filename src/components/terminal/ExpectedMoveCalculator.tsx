import React, { useMemo, useState, useRef } from "react";
import { formatNumber, DemoTicker, ExposurePoint, KeyLevels, OptionContract } from "@/lib/gex";
import { Panel } from "./Panel";
import { ArrowUp, ArrowDown, Minus, Target, Zap, Info, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tip({ text, children, wide }: { text: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className={`absolute z-[99] bottom-full left-1/2 -translate-x-1/2 mb-2 ${wide ? "w-72" : "w-56"} hidden group-hover/tip:block pointer-events-none`}>
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 text-[10px] text-slate-300 shadow-2xl leading-relaxed font-mono">
          {text}
        </div>
        <div className="w-2 h-2 bg-[#0d1117] border-r border-b border-[#30363d] rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
      </div>
    </div>
  );
}

// ── Scenario card ──────────────────────────────────────────────────────────────
function ScenarioCard({
  type, prob, target, entry, stop, tip,
}: {
  type: "BULL" | "BEAR" | "NEUTRAL";
  prob: number; target: number; entry: number; stop: number; tip: string;
}) {
  const cfg = {
    BULL: { color: "#22c55e", bg: "#22c55e10", border: "#22c55e30", Icon: TrendingUp, label: "BULLISH" },
    BEAR: { color: "#ef4444", bg: "#ef444410", border: "#ef444430", Icon: TrendingDown, label: "BEARISH" },
    NEUTRAL: { color: "#a78bfa", bg: "#a78bfa10", border: "#a78bfa30", Icon: Minus, label: "NEUTRAL / PIN" },
  }[type];

  return (
    <Tip text={tip} wide>
      <div
        className="rounded-xl p-3 cursor-help hover:brightness-110 transition-all"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <cfg.Icon size={12} style={{ color: cfg.color }} />
            <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          </div>
          <span className="text-[11px] font-black font-mono" style={{ color: cfg.color }}>{prob}%</span>
        </div>
        <div className="space-y-1 text-[9px] font-mono">
          <div className="flex justify-between">
            <span className="text-slate-600">Target</span>
            <span style={{ color: cfg.color }}>${target.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Entry zone</span>
            <span className="text-slate-300">${entry.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Invalidation</span>
            <span className="text-red-400">${stop.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Tip>
  );
}

// ── Sigma range row ────────────────────────────────────────────────────────────
function SigmaRow({
  sigma, prob, low, high, spot, maxDev, color, tip,
}: {
  sigma: string; prob: number; low: number; high: number; spot: number;
  maxDev: number; color: string; tip: string;
}) {
  const leftW = ((spot - low) / maxDev) * 50;
  const rightW = ((high - spot) / maxDev) * 50;

  return (
    <Tip text={tip} wide>
      <div className="grid grid-cols-[40px_1fr_32px] items-center gap-3 py-2 px-3 hover:bg-white/3 rounded-lg cursor-help transition-colors">
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{sigma}</span>
        <div className="relative h-5 flex items-center">
          {/* Track */}
          <div className="absolute inset-0 bg-white/4 rounded-full" />
          {/* Left bar */}
          <div
            className="absolute right-1/2 top-1/2 -translate-y-1/2 h-3 rounded-l-full"
            style={{ width: `${leftW}%`, background: `${color}80` }}
          />
          {/* Right bar */}
          <div
            className="absolute left-1/2 top-1/2 -translate-y-1/2 h-3 rounded-r-full"
            style={{ width: `${rightW}%`, background: `${color}80` }}
          />
          {/* Spot pin */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-5 bg-amber-400 rounded-full z-10" style={{ boxShadow: "0 0 6px #fbbf24" }} />
          {/* Labels */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 text-[7px] font-mono" style={{ color }}>
            ${low.toLocaleString()}
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 text-[7px] font-mono" style={{ color }}>
            ${high.toLocaleString()}
          </div>
        </div>
        <span className="text-[9px] text-slate-500 text-right">{prob}%</span>
      </div>
    </Tip>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
export function ExpectedMoveCalculator({ ticker, exposures, levels, contracts }: Props) {
  const [selectedDTE, setSelectedDTE] = useState("1");
  const spot = ticker.spot;

  const calc = useMemo(() => {
    // ── ATM IV for selected DTE ────────────────────────────────────────────────
    const dteN = parseInt(selectedDTE) || 1;
    const near = contracts.filter(c => {
      const diff = Math.abs(c.expiry - dteN);
      return diff <= Math.max(2, dteN * 0.4);
    });
    const atmNear = near.filter(c => Math.abs(c.strike - spot) <= ticker.strikeStep * 1.5);
    const atmIV = atmNear.length
      ? (atmNear.reduce((s, c) => s + c.iv, 0) / atmNear.length)
      : ticker.baseIV;

    // ── Expected Move ─────────────────────────────────────────────────────────
    const dteCalc = Math.max(dteN, 0.25);
    const em = spot * atmIV * Math.sqrt(dteCalc / 365);
    const emPct = (em / spot) * 100;

    // ── Sigma levels ──────────────────────────────────────────────────────────
    const s1 = { low: Math.round(spot - em), high: Math.round(spot + em) };
    const s2 = { low: Math.round(spot - em * 2), high: Math.round(spot + em * 2) };
    const s3 = { low: Math.round(spot - em * 3), high: Math.round(spot + em * 3) };

    // ── GEX-adjusted pin zone ─────────────────────────────────────────────────
    const netGEX = levels.totalGex;
    const gexAdj = netGEX > 0 ? em * 0.7 : em * 1.3; // positive GEX suppresses range
    const pinLow = Math.round(spot - gexAdj);
    const pinHigh = Math.round(spot + gexAdj);

    // ── Scenarios ─────────────────────────────────────────────────────────────
    const gammaFlip = levels.gammaFlip ?? spot;
    const bullProb = netGEX >= 0
      ? Math.round(40 + (spot > gammaFlip ? 12 : 0))
      : Math.round(35 + (spot > gammaFlip ? 8 : 0));
    const bearProb = netGEX < 0
      ? Math.round(40 + (spot < gammaFlip ? 12 : 0))
      : Math.round(28 + (spot < gammaFlip ? 8 : 0));
    const neutralProb = Math.max(5, 100 - bullProb - bearProb);

    const bullTarget = Math.min(levels.callWall, Math.round(spot + em * 1.5));
    const bearTarget = Math.max(levels.putWall, Math.round(spot - em * 1.5));

    // ── All expiries table ────────────────────────────────────────────────────
    const rows = [
      { label: "0D",      dte: 0.25, tag: "HOY · Intraday"         },
      { label: "1D",      dte: 1,    tag: "MAÑANA · Overnight"     },
      { label: "2D",      dte: 2,    tag: "PASADO MAÑANA"          },
      { label: "Weekly",  dte: 7,    tag: "7 días"                 },
      { label: "2-Week",  dte: 14,   tag: "14 días"                },
      { label: "Monthly", dte: 30,   tag: "30 días"                },
    ].map(({ label, dte, tag }) => {
      const ivForDte = contracts.filter(c => Math.abs(c.expiry - dte) <= Math.max(1, dte * 0.3));
      const atmForDte = ivForDte.filter(c => Math.abs(c.strike - spot) <= ticker.strikeStep * 2);
      const iv = atmForDte.length
        ? atmForDte.reduce((s, c) => s + c.iv, 0) / atmForDte.length
        : ticker.baseIV;
      const move = spot * iv * Math.sqrt(Math.max(dte, 0.25) / 365);
      return { label, dte, tag, iv: iv * 100, move, movePct: (move / spot) * 100, low: Math.round(spot - move), high: Math.round(spot + move) };
    });

    // ── IV Surface data for mini SVG chart ────────────────────────────────────
    const surfaceStrikes = [];
    for (let k = spot * 0.88; k <= spot * 1.12; k += spot * 0.025) {
      surfaceStrikes.push(Math.round(k));
    }
    const surfaceExpiries = [1, 7, 14, 30, 60];
    const surface = surfaceStrikes.map(k => ({
      k,
      ivs: surfaceExpiries.map(exp => {
        const m = Math.log(k / spot);
        const skew = -0.32 * m;
        const smile = 0.55 * m * m * (1 + 1.8 * Math.abs(m));
        const term = 0.025 * Math.sqrt(30 / exp);
        return Math.max(5, Math.min(80, (atmIV + skew + term + smile) * 100));
      }),
    }));

    return { atmIV: atmIV * 100, dteCalc, em, emPct, s1, s2, s3, pinLow, pinHigh, netGEX, gexAdj, bullProb, bearProb, neutralProb, bullTarget, bearTarget, gammaFlip, rows, surface, surfaceStrikes, surfaceExpiries };
  }, [selectedDTE, contracts, ticker, levels, spot]);

  const maxDev = calc.s3.high - spot;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [hoveredLine, setHoveredLine] = useState<{
    k: number; moneyness: number; ivs: number[]; x: number; y: number;
  } | null>(null);

  return (
    <div className="h-full overflow-y-auto terminal-scrollbar space-y-3 p-4" style={{ background: "#07090f" }}>

      {/* ── DTE SELECTOR ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold mr-1">Horizon</span>
        {[
          { v: "0",  l: "0D",      sub: "HOY"            },
          { v: "1",  l: "1D",      sub: "MAÑANA"         },
          { v: "2",  l: "2D",      sub: "PASADO MAÑANA"  },
          { v: "7",  l: "WEEKLY",  sub: "7 días"         },
          { v: "14", l: "2-WEEK",  sub: "14 días"        },
          { v: "30", l: "MONTHLY", sub: "30 días"        },
        ].map(({ v, l, sub }) => (
          <button
            key={v}
            onClick={() => setSelectedDTE(v)}
            className={`flex flex-col items-center px-3 py-1.5 text-[10px] font-mono rounded-lg transition-all ${
              selectedDTE === v
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold"
                : "bg-white/4 text-slate-500 border border-white/8 hover:text-slate-300"
            }`}
          >
            <span>{l}</span>
            <span className="text-[7px] tracking-wide opacity-70">{sub}</span>
          </button>
        ))}
      </div>

      {/* ── MAIN EM HERO ──────────────────────────────────────────────────────── */}
      <Tip text={`Expected Move formula: EM = Spot (${spot.toLocaleString()}) × ATM IV (${calc.atmIV.toFixed(1)}%) × √(${calc.dteCalc}/365). GEX-adjusted pin zone shrinks the range by ${calc.netGEX >= 0 ? "30%" : "0%"} due to ${calc.netGEX >= 0 ? "positive" : "negative"} gamma environment.`} wide>
        <div className="bg-[#0d111a] border border-blue-500/20 rounded-xl p-5 cursor-help hover:border-blue-500/40 transition-colors">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold mb-1">{ticker.symbol} Expected Move · {calc.dteCalc === 0.25 ? "0DTE" : `${calc.dteCalc}DTE`}</div>
              <div className="text-4xl font-black font-mono text-blue-300">±${Math.round(calc.em).toLocaleString()}</div>
              <div className="text-lg font-mono text-slate-400 mt-1">±{calc.emPct.toFixed(2)}%</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">ATM IV</div>
              <div className="text-2xl font-black font-mono text-slate-200">{calc.atmIV.toFixed(1)}%</div>
              <div className="text-[9px] text-slate-600 mt-1">Spot: ${spot.toLocaleString()}</div>
            </div>
          </div>

          {/* 1σ range visual tape */}
          <div className="relative h-8 bg-white/4 rounded-lg overflow-hidden border border-white/8">
            <div className="absolute inset-y-0" style={{ left: "15%", right: "15%", background: "#3b82f620" }} />
            <div
              className="absolute inset-y-2 rounded"
              style={{
                left: `${Math.max(5, 50 - (calc.em / spot) * 50 * 3.5)}%`,
                right: `${Math.max(5, 50 - (calc.em / spot) * 50 * 3.5)}%`,
                background: "linear-gradient(90deg, #ef444440, #3b82f640, #22c55e40, #3b82f640, #ef444440)",
              }}
            />
            {/* Spot pin */}
            <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-amber-400" style={{ boxShadow: "0 0 8px #fbbf24" }} />
            {/* Labels */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-red-400">${calc.s1.low.toLocaleString()}</div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-green-400">${calc.s1.high.toLocaleString()}</div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[7px] font-mono text-amber-400">SPOT</div>
          </div>

          {/* GEX pin zone */}
          <div className="flex items-center justify-between mt-2 text-[9px] font-mono">
            <span className="text-slate-600">GEX Pin Zone:</span>
            <span className="text-purple-400">${calc.pinLow.toLocaleString()} – ${calc.pinHigh.toLocaleString()}</span>
            <span className={`text-[8px] ${calc.netGEX >= 0 ? "text-green-600" : "text-red-600"}`}>
              {calc.netGEX >= 0 ? "↓ suppressed by +GEX" : "↑ expanded by -GEX"}
            </span>
          </div>
        </div>
      </Tip>

      {/* ── SCENARIOS ─────────────────────────────────────────────────────────── */}
      <Panel title="Scenario Analysis" subtitle="Based on GEX regime + gamma flip" noPad>
        <div className="grid grid-cols-3 gap-2 p-3">
          <ScenarioCard
            type="BULL" prob={calc.bullProb}
            target={calc.bullTarget}
            entry={Math.round(spot + (calc.bullTarget - spot) * 0.2)}
            stop={calc.gammaFlip}
            tip={`Bull scenario (${calc.bullProb}%): Spot holds above Gamma Flip ($${calc.gammaFlip.toLocaleString()}) and rallies toward Call Wall ($${levels.callWall.toLocaleString()}). Dealers must buy as spot rises (positive GEX = stabilizing). Target = min(Call Wall, Spot + 1.5σ). Invalidation = Gamma Flip break.`}
          />
          <ScenarioCard
            type="BEAR" prob={calc.bearProb}
            target={calc.bearTarget}
            entry={Math.round(spot - (spot - calc.bearTarget) * 0.2)}
            stop={calc.gammaFlip}
            tip={`Bear scenario (${calc.bearProb}%): Spot breaks below Gamma Flip ($${calc.gammaFlip.toLocaleString()}). Negative gamma forces dealers to sell → accelerated decline. Target = max(Put Wall $${levels.putWall.toLocaleString()}, Spot − 1.5σ). Invalidation = reclaim of flip level.`}
          />
          <ScenarioCard
            type="NEUTRAL" prob={calc.neutralProb}
            target={levels.maxPain}
            entry={spot}
            stop={Math.round(spot + calc.em * 1.2)}
            tip={`Neutral/Pin scenario (${calc.neutralProb}%): Market gravitates toward Max Pain ($${levels.maxPain.toLocaleString()}) as expiry approaches. Dealers long gamma suppress moves. Pin probability increases within 2 DTE. Range: $${calc.pinLow.toLocaleString()}–$${calc.pinHigh.toLocaleString()}.`}
          />
        </div>
      </Panel>

      {/* ── SIGMA PROBABILITY RANGES ──────────────────────────────────────────── */}
      <Panel title="Probability Ranges" subtitle="Statistical move distribution" noPad>
        <div className="p-3 space-y-1">
          <SigmaRow sigma="1σ" prob={68.2} low={calc.s1.low} high={calc.s1.high} spot={spot} maxDev={maxDev} color="#22c55e"
            tip={`1 standard deviation range (68.2% probability). EM = ±$${Math.round(calc.em).toLocaleString()} (±${calc.emPct.toFixed(2)}%). Based on ATM IV ${calc.atmIV.toFixed(1)}% for ${calc.dteCalc} day(s).`}
          />
          <SigmaRow sigma="2σ" prob={95.4} low={calc.s2.low} high={calc.s2.high} spot={spot} maxDev={maxDev} color="#facc15"
            tip={`2 standard deviations (95.4% probability). EM = ±$${Math.round(calc.em * 2).toLocaleString()} (±${(calc.emPct * 2).toFixed(2)}%). Large moves expected only 4.6% of the time.`}
          />
          <SigmaRow sigma="3σ" prob={99.7} low={calc.s3.low} high={calc.s3.high} spot={spot} maxDev={maxDev} color="#ef4444"
            tip={`3 standard deviations (99.7% probability). EM = ±$${Math.round(calc.em * 3).toLocaleString()} (±${(calc.emPct * 3).toFixed(2)}%). Only ~0.3% of sessions breach this zone. Often aligned with major macro events.`}
          />
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5 text-[8px] text-slate-600 font-mono">
            <div className="w-0.5 h-3 bg-amber-400 rounded" />
            <span>▲ Amber line = Spot price (${spot.toLocaleString()})</span>
          </div>
        </div>
      </Panel>

      {/* ── KEY LEVELS ────────────────────────────────────────────────────────── */}
      <Panel title="Key Gamma Levels" subtitle="Bounce & target zones" noPad>
        <div className="grid grid-cols-2 gap-2 p-3">
          {[
            { l: "Call Wall", v: levels.callWall, c: "#22c55e", desc: "Resistance ceiling", tip: `Call Wall $${levels.callWall.toLocaleString()} (${(((levels.callWall - spot) / spot) * 100).toFixed(2)}% above spot). Peak call GEX strike — dealers sell into rallies reaching this. Strong resistance in positive gamma regime.` },
            { l: "Put Wall", v: levels.putWall, c: "#ef4444", desc: "Support floor", tip: `Put Wall $${levels.putWall.toLocaleString()} (${(((spot - levels.putWall) / spot) * 100).toFixed(2)}% below spot). Peak put GEX strike — key bounce level. Dealers buy dips near this level. In negative GEX, this becomes a trap.` },
            { l: "Gamma Flip", v: calc.gammaFlip, c: "#facc15", desc: "Vol trigger", tip: `Gamma Flip $${calc.gammaFlip.toLocaleString()} (${(Math.abs((calc.gammaFlip - spot) / spot) * 100).toFixed(2)}% ${calc.gammaFlip > spot ? "above" : "below"} spot). Where cumulative Net GEX = 0. Above = dealers long gamma (suppressing vol). Below = dealers short gamma (amplifying vol). Critical pivot.` },
            { l: "Max Pain", v: levels.maxPain, c: "#a78bfa", desc: "Gravity level", tip: `Max Pain $${levels.maxPain.toLocaleString()} (${(Math.abs((levels.maxPain - spot) / spot) * 100).toFixed(2)}% ${levels.maxPain >= spot ? "above" : "below"} spot). Strike where total option holder losses are maximized. Price gravitates here near expiry as dealers offset hedges.` },
          ].map(({ l, v, c, desc, tip }) => (
            <Tip key={l} text={tip} wide>
              <div className="bg-[#0d111a] border border-white/8 rounded-xl p-3 hover:border-white/18 cursor-help transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{l}</span>
                  <span className="text-[8px] text-slate-700">{desc}</span>
                </div>
                <div className="text-lg font-black font-mono" style={{ color: c }}>${v.toLocaleString()}</div>
                <div className="text-[8px] font-mono mt-1" style={{ color: c }}>
                  {((v - spot) / spot * 100) >= 0 ? "+" : ""}{((v - spot) / spot * 100).toFixed(2)}% from spot
                </div>
              </div>
            </Tip>
          ))}
        </div>
      </Panel>

      {/* ── EXPIRY TABLE ──────────────────────────────────────────────────────── */}
      <Panel title="Expected Move by Expiry" subtitle="All horizons" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="border-b border-white/8">
                {["EXPIRY", "DTE", "ATM IV", "EM ($)", "EM (%)", "RANGE"].map(h => (
                  <th key={h} className={`py-2 px-3 text-slate-600 font-semibold uppercase tracking-wider text-[9px] ${h === "EXPIRY" || h === "RANGE" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.rows.map((row, i) => (
                <tr
                  key={row.label}
                  className={`border-b border-white/5 hover:bg-white/3 transition-colors ${selectedDTE === String(Math.round(row.dte)) ? "bg-blue-500/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-bold text-slate-200">{row.label}</div>
                    <div className="text-[8px] text-slate-600">{row.tag}</div>
                  </td>
                  <td className="text-right px-3 py-2 text-slate-500">{row.dte}</td>
                  <td className="text-right px-3 py-2 text-slate-300">{row.iv.toFixed(1)}%</td>
                  <td className="text-right px-3 py-2 text-blue-400 font-bold">${Math.round(row.move).toLocaleString()}</td>
                  <td className="text-right px-3 py-2 text-blue-400">{row.movePct.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-slate-400">
                    <span className="text-red-400">${row.low.toLocaleString()}</span>
                    <span className="text-slate-600"> – </span>
                    <span className="text-green-400">${row.high.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── IV SURFACE (SVG improved) ──────────────────────────────────────────── */}
      <Panel title="Implied Volatility Surface" subtitle="Strike × Expiry skew & term structure — hover a line for details" noPad>
        <div className="p-4 relative" ref={surfaceRef} onMouseLeave={() => setHoveredLine(null)}>
          <svg viewBox="0 0 580 260" className="w-full h-auto" style={{ background: "#07090f" }}>
            {/* Axes */}
            <line x1="55" y1="15" x2="55" y2="220" stroke="#1e293b" strokeWidth="1.5" />
            <line x1="55" y1="220" x2="575" y2="220" stroke="#1e293b" strokeWidth="1.5" />

            {/* Y-axis labels */}
            {[20, 30, 40, 50, 60].map(iv => {
              const y = 220 - ((iv - 10) / 60) * 205;
              return (
                <g key={iv}>
                  <line x1="50" y1={y} x2="575" y2={y} stroke="#0f172a" strokeWidth="1" />
                  <text x="48" y={y + 4} textAnchor="end" fill="#334155" fontSize="8" fontFamily="monospace">{iv}%</text>
                </g>
              );
            })}

            {/* X-axis labels (expiries) */}
            {calc.surfaceExpiries.map((exp, i) => {
              const x = 55 + (i / (calc.surfaceExpiries.length - 1)) * 520;
              return (
                <text key={exp} x={x} y="232" textAnchor="middle" fill="#334155" fontSize="8" fontFamily="monospace">
                  {exp}d
                </text>
              );
            })}

            {/* Surface lines: one line per strike */}
            {calc.surface.map((s, si) => {
              const moneyness = (s.k - spot) / spot;
              const isHovered = hoveredLine?.k === s.k;
              const hue = moneyness > 0 ? 120 : 0;
              const alpha = isHovered ? 1 : 0.3 + Math.min(0.5, Math.abs(moneyness) * 6);
              const color = isHovered
                ? (moneyness > 0 ? "#4ade80" : moneyness < 0 ? "#f87171" : "#fbbf24")
                : `hsla(${hue}, 70%, 55%, ${alpha})`;

              const points = calc.surfaceExpiries.map((exp, i) => {
                const x = 55 + (i / (calc.surfaceExpiries.length - 1)) * 520;
                const iv = s.ivs[i];
                const y = 220 - ((iv - 10) / 60) * 205;
                return `${x},${y}`;
              }).join(" ");

              return (
                <g key={si}>
                  {/* Invisible wide hit area */}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="10"
                    style={{ cursor: "crosshair" }}
                    onMouseEnter={(e) => {
                      const rect = surfaceRef.current?.getBoundingClientRect();
                      if (rect) setHoveredLine({ k: s.k, moneyness: moneyness * 100, ivs: s.ivs, x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                    onMouseMove={(e) => {
                      const rect = surfaceRef.current?.getBoundingClientRect();
                      if (rect) setHoveredLine(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
                    }}
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth={isHovered ? 2.5 : Math.abs(moneyness) < 0.01 ? 2.5 : 1}
                    style={{ pointerEvents: "none" }}
                  />
                </g>
              );
            })}

            {/* ATM highlight */}
            <text x="285" y="12" textAnchor="middle" fill="#fbbf24" fontSize="9" fontFamily="monospace">ATM</text>

            {/* Axis labels */}
            <text x="315" y="248" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">EXPIRY (Days to Expiry)</text>
            <text x="12" y="120" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace" transform="rotate(-90 12 120)">IV (%)</text>
          </svg>

          {/* Hover Tooltip */}
          {hoveredLine && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: hoveredLine.x + 14,
                top: Math.max(4, hoveredLine.y - 20),
              }}
            >
              <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3 shadow-2xl min-w-[190px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/8">
                  <span className="text-[11px] font-black font-mono text-slate-100">
                    Strike ${hoveredLine.k.toLocaleString()}
                  </span>
                  <span
                    className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                    style={{
                      color: Math.abs(hoveredLine.moneyness) < 0.3 ? "#fbbf24" : hoveredLine.moneyness > 0 ? "#4ade80" : "#f87171",
                      background: Math.abs(hoveredLine.moneyness) < 0.3 ? "#fbbf2415" : hoveredLine.moneyness > 0 ? "#4ade8015" : "#f8717115",
                    }}
                  >
                    {hoveredLine.moneyness >= 0 ? "+" : ""}{hoveredLine.moneyness.toFixed(2)}%
                  </span>
                </div>
                {/* Type label */}
                <div className="text-[9px] font-mono mb-2" style={{ color: Math.abs(hoveredLine.moneyness) < 0.3 ? "#fbbf24" : hoveredLine.moneyness > 0 ? "#4ade80" : "#f87171" }}>
                  {Math.abs(hoveredLine.moneyness) < 0.3 ? "ATM" : hoveredLine.moneyness > 0 ? "OTM Call" : "OTM Put"}
                </div>
                {/* IV per expiry */}
                <div className="space-y-1">
                  {calc.surfaceExpiries.map((exp, i) => (
                    <div key={exp} className="flex items-center justify-between gap-4">
                      <span className="text-[9px] font-mono text-slate-500">{exp === 1 ? "1d (overnight)" : exp === 7 ? "7d (weekly)" : exp === 14 ? "14d (2-week)" : exp === 30 ? "30d (monthly)" : exp === 60 ? "60d (2-month)" : `${exp}d`}</span>
                      <span className="text-[10px] font-black font-mono text-blue-300">{hoveredLine.ivs[i].toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                {/* Term structure slope */}
                <div className="mt-2 pt-2 border-t border-white/8 text-[8px] font-mono text-slate-600">
                  {hoveredLine.ivs[hoveredLine.ivs.length - 1] > hoveredLine.ivs[0]
                    ? "↗ Normal term structure (backwardation)"
                    : "↘ Inverted term structure (contango)"}
                </div>
              </div>
              <div className="w-2 h-2 bg-[#0d1117] border-l border-t border-[#30363d] -rotate-45 absolute -left-1 top-5" />
            </div>
          )}

          <div className="flex justify-center gap-4 mt-1 text-[8px] font-mono text-slate-600">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-green-500 inline-block" /> OTM Call strikes</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-500 inline-block" /> OTM Put strikes</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-400 inline-block" style={{ height: 2 }} /> ATM (${spot.toLocaleString()})</span>
          </div>
        </div>
      </Panel>

      {/* Footer */}
      <div className="text-[8px] text-slate-700 text-center font-mono pb-2">
        EM = Spot × ATM IV × √(DTE/365) · GEX Pin Zone uses dealer hedging adjustment · {ticker.symbol} · CBOE data
      </div>
    </div>
  );
}

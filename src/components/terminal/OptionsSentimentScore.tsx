import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus, Info, Target, ArrowUp, ArrowDown, Zap, Activity } from "lucide-react";
import { DemoTicker, ExposurePoint, KeyLevels, OptionContract, formatNumber } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

// ── Inline tooltip ─────────────────────────────────────────────────────────────
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

// ── Signal bar row ─────────────────────────────────────────────────────────────
function GreekRow({
  symbol, label, value, barPct, direction, weight, tip,
}: {
  symbol: string; label: string; value: string;
  barPct: number; direction: "bull" | "bear" | "neutral"; weight: number; tip: string;
}) {
  const color = direction === "bull" ? "#22c55e" : direction === "bear" ? "#ef4444" : "#64748b";
  const Icon = direction === "bull" ? TrendingUp : direction === "bear" ? TrendingDown : Minus;
  return (
    <Tip text={tip} wide>
      <div className="grid grid-cols-[28px_1fr_2.5fr_90px_40px] items-center gap-2 py-2 px-3 hover:bg-white/3 rounded-md cursor-help transition-colors">
        <span className="text-sm font-bold text-center" style={{ color }}>{symbol}</span>
        <span className="text-[10px] text-slate-400 font-medium truncate">{label}</span>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, barPct)}%`, background: color }} />
          </div>
          <Icon size={10} style={{ color }} className="shrink-0" />
        </div>
        <span className="text-[10px] font-mono font-semibold text-right" style={{ color }}>{value}</span>
        <span className="text-[9px] text-slate-600 text-right">{weight}%</span>
      </div>
    </Tip>
  );
}

// ── Prediction card ────────────────────────────────────────────────────────────
function PredCard({
  horizon, direction, confidence, range, target, bounce, tip,
}: {
  horizon: string; direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number; range: [number, number];
  target: number; bounce: number; tip: string;
}) {
  const dColor = direction === "BULLISH" ? "#22c55e" : direction === "BEARISH" ? "#ef4444" : "#facc15";
  const DIcon = direction === "BULLISH" ? ArrowUp : direction === "BEARISH" ? ArrowDown : Minus;
  return (
    <Tip text={tip} wide>
      <div className="bg-[#0d111a] border border-white/8 rounded-xl p-4 hover:border-white/18 cursor-help transition-colors">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] uppercase tracking-widest font-semibold text-slate-500">{horizon}</span>
          <div className="flex items-center gap-1.5">
            <DIcon size={10} style={{ color: dColor }} />
            <span className="text-[10px] font-bold" style={{ color: dColor }}>{direction}</span>
          </div>
        </div>
        {/* Confidence bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${confidence}%`, background: dColor }} />
          </div>
          <span className="text-[9px] font-mono text-slate-400">{confidence}%</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div>
            <div className="text-slate-600 mb-0.5">Range</div>
            <div className="text-slate-300">${range[0].toLocaleString()} – ${range[1].toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-600 mb-0.5">Target</div>
            <div style={{ color: dColor }}>${target.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-emerald-700 mb-0.5">↑ Bounce</div>
            <div className="text-emerald-400">${bounce.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-600 mb-0.5">Pin Zone</div>
            <div className="text-purple-400">${levels_ref.maxPain?.toLocaleString() ?? "—"}</div>
          </div>
        </div>
      </div>
    </Tip>
  );
}

// hack: expose levels_ref for PredCard to access maxPain (passed down via module-level variable)
let levels_ref: KeyLevels = {} as KeyLevels;

// ──────────────────────────────────────────────────────────────────────────────
export function OptionsSentimentScore({ ticker, exposures, levels, contracts }: Props) {
  levels_ref = levels;
  const spot = ticker.spot;

  const data = useMemo(() => {
    // ── ATM IV ────────────────────────────────────────────────────────────────
    const atmC = contracts.filter(c => Math.abs(c.strike - spot) <= ticker.strikeStep * 1.5);
    const atmIV = atmC.length ? (atmC.reduce((s, c) => s + c.iv, 0) / atmC.length) * 100 : ticker.baseIV * 100;

    // ── P/C Ratio ─────────────────────────────────────────────────────────────
    const putOI = contracts.filter(c => c.type === "put").reduce((s, c) => s + c.oi, 0);
    const callOI = contracts.filter(c => c.type === "call").reduce((s, c) => s + c.oi, 0);
    const pcRatio = callOI > 0 ? putOI / callOI : 1;

    // ── Put Skew ──────────────────────────────────────────────────────────────
    const otmPuts = contracts.filter(c => c.type === "put" && c.strike >= spot * 0.90 && c.strike < spot * 0.98 && c.iv > 0);
    const otmCalls = contracts.filter(c => c.type === "call" && c.strike > spot * 1.02 && c.strike <= spot * 1.10 && c.iv > 0);
    const putSkewIV = otmPuts.length ? (otmPuts.reduce((s, c) => s + c.iv, 0) / otmPuts.length) * 100 : atmIV + 2;
    const callSkewIV = otmCalls.length ? (otmCalls.reduce((s, c) => s + c.iv, 0) / otmCalls.length) * 100 : atmIV - 1;
    const skew = putSkewIV - callSkewIV;

    // ── IV Rank ───────────────────────────────────────────────────────────────
    const ivLow = ticker.baseIV * 100 * 0.55;
    const ivHigh = ticker.baseIV * 100 * 2.1;
    const ivRank = Math.max(0, Math.min(100, ((atmIV - ivLow) / (ivHigh - ivLow)) * 100));

    // ── Exposures ─────────────────────────────────────────────────────────────
    const netGEX = levels.totalGex / 1e9; // billions
    const netDEX = exposures.reduce((s, e) => s + e.dex, 0);
    const totalVEX = exposures.reduce((s, e) => s + Math.abs(e.vex), 0);
    const totalCharm = exposures.reduce((s, e) => s + e.charm, 0);
    const totalVanna = exposures.reduce((s, e) => s + Math.abs(e.vanna), 0);

    // ── Composite Score ───────────────────────────────────────────────────────
    // Each signal contributes to bullishness (100 = max bull, 0 = max bear)
    const gexBull = netGEX > 0 ? Math.min(100, 50 + (netGEX / 5) * 50) : Math.max(0, 50 + (netGEX / 5) * 50);
    const dexBull = netDEX > 0 ? Math.min(100, 50 + (netDEX / 1e11) * 50) : Math.max(0, 50 + (netDEX / 1e11) * 50);
    const pcBull = Math.max(0, Math.min(100, 100 - (pcRatio - 0.5) * 70));
    const ivBull = Math.max(0, 100 - ivRank); // low IV = bullish (compressed)
    const skewBull = Math.max(0, Math.min(100, 80 - skew * 8)); // low skew = less fear
    const vannaBull = totalVanna > 0 ? 60 : 40; // vanna positive = typically bullish squeeze
    const charmBull = totalCharm < 0 ? 55 : 45;

    const score = Math.round(
      gexBull * 0.25 + dexBull * 0.20 + pcBull * 0.20 + ivBull * 0.15 +
      skewBull * 0.10 + vannaBull * 0.05 + charmBull * 0.05
    );

    const regime: "COMPRESSED" | "TRANSITIONING" | "EXPLOSIVE" =
      score >= 65 ? "COMPRESSED" : score >= 40 ? "TRANSITIONING" : "EXPLOSIVE";

    // ── Expected Moves ────────────────────────────────────────────────────────
    const ivDec = atmIV / 100;
    const em0dte = spot * ivDec * Math.sqrt(0.5 / 365);  // ~3-4hr intraday
    const em1dte = spot * ivDec * Math.sqrt(1 / 365);

    // ── Direction / confidence ────────────────────────────────────────────────
    const dirScore = score;
    const dirToday: "BULLISH" | "BEARISH" | "NEUTRAL" =
      dirScore >= 60 ? "BULLISH" : dirScore <= 40 ? "BEARISH" : "NEUTRAL";
    const dirTomorrow: "BULLISH" | "BEARISH" | "NEUTRAL" =
      score >= 58 ? "BULLISH" : score <= 42 ? "BEARISH" : "NEUTRAL";

    const confToday = Math.round(Math.abs(dirScore - 50) * 2 + 30);
    const confTomorrow = Math.round(Math.abs(dirScore - 50) * 1.5 + 25);

    // ── Price targets ─────────────────────────────────────────────────────────
    const todayHigh = Math.round(spot + em0dte);
    const todayLow = Math.round(spot - em0dte);
    const tomHigh = Math.round(spot + em1dte);
    const tomLow = Math.round(spot - em1dte);

    const targetToday = dirToday === "BULLISH" ? levels.callWall : dirToday === "BEARISH" ? levels.putWall : levels.maxPain;
    const targetTomorrow = dirTomorrow === "BULLISH"
      ? Math.min(levels.callWall, Math.round(spot + em1dte * 1.3))
      : dirTomorrow === "BEARISH"
      ? Math.max(levels.putWall, Math.round(spot - em1dte * 1.3))
      : levels.maxPain;

    // ── Score history (stable mock based on score) ────────────────────────────
    const hist = [score - 6, score - 4, score - 5, score - 2, score - 1, score - 3, score];

    return {
      atmIV, pcRatio, skew, ivRank,
      netGEX, netDEX, totalVEX, totalCharm, totalVanna,
      gexBull, dexBull, pcBull, ivBull, skewBull, vannaBull, charmBull,
      score, regime,
      em0dte, em1dte,
      dirToday, dirTomorrow, confToday, confTomorrow,
      todayHigh, todayLow, tomHigh, tomLow,
      targetToday, targetTomorrow,
      hist,
    };
  }, [ticker, contracts, exposures, levels, spot]);

  // Animated score counter
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      const t = Math.min(frame / 60, 1);
      setDisp(Math.round(data.score * t));
      if (t === 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [data.score]);

  const scoreColor = disp >= 65 ? "#22c55e" : disp >= 40 ? "#facc15" : "#ef4444";

  const REGIME_CFG = {
    COMPRESSED: { color: "#22c55e", bg: "#22c55e12", border: "#22c55e30", label: "COMPRESSED", desc: "Positive gamma · market stabilizing · premium selling favorable" },
    TRANSITIONING: { color: "#facc15", bg: "#facc1512", border: "#facc1530", label: "TRANSITIONING", desc: "Mixed signals · gamma near flip · direction unclear" },
    EXPLOSIVE: { color: "#ef4444", bg: "#ef444412", border: "#ef444430", label: "EXPLOSIVE", desc: "Negative gamma · dealers amplifying · high realized vol ahead" },
  };
  const reg = REGIME_CFG[data.regime];

  const chartData = data.hist.map(v => ({ v }));

  return (
    <div className="h-full overflow-y-auto terminal-scrollbar" style={{ background: "#07090f" }}>
      <div className="p-4 space-y-3">

        {/* ── TOP: Score + Regime + Predictions ─────────────────────────────── */}
        <div className="grid grid-cols-[auto_1fr] gap-3">

          {/* Score gauge */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative w-36 h-36 shrink-0"
              title="Composite Sentiment Score (0-100). Weighted average of 7 Greek-based signals. Above 65 = bullish gamma environment. Below 40 = bearish/explosive."
            >
              <svg className="w-full h-full absolute" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                <motion.circle
                  cx="80" cy="80" r="68" fill="none" stroke={scoreColor} strokeWidth="10"
                  strokeDasharray={`${(disp / 100) * 427} 427`} strokeLinecap="round"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "80px 80px" }}
                  initial={{ strokeDasharray: "0 427" }}
                  animate={{ strokeDasharray: `${(disp / 100) * 427} 427` }}
                  transition={{ duration: 1.8, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black font-mono" style={{ color: scoreColor }}>{disp}</span>
                <span className="text-[9px] text-slate-500 font-mono">/ 100</span>
                <span className="text-[9px] font-semibold mt-1" style={{ color: scoreColor }}>
                  {data.score >= 65 ? "BULLISH" : data.score >= 40 ? "NEUTRAL" : "BEARISH"}
                </span>
              </div>
            </div>

            {/* Sparkline */}
            <div className="w-36 h-10 bg-white/3 rounded-lg border border-white/8 px-2 py-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <Line type="monotone" dataKey="v" stroke={scoreColor} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Regime badge */}
            <div
              className="w-full rounded-lg px-3 py-2 text-center"
              style={{ background: reg.bg, border: `1px solid ${reg.border}` }}
            >
              <div className="text-[10px] font-bold tracking-wider" style={{ color: reg.color }}>{reg.label}</div>
            </div>
          </div>

          {/* Predictions panel */}
          <div className="flex flex-col gap-2">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold mb-1">
              Market Prediction
            </div>

            <PredCard
              horizon="TODAY  (0DTE / ~6h)"
              direction={data.dirToday}
              confidence={data.confToday}
              range={[data.todayLow, data.todayHigh]}
              target={data.targetToday}
              bounce={levels.putWall}
              tip={`Today's directional outlook based on: Net GEX (${data.netGEX.toFixed(2)}B), DEX (${formatNumber(data.netDEX)}), P/C Ratio (${data.pcRatio.toFixed(2)}), IV Rank (${data.ivRank.toFixed(0)}%), Put Skew (${data.skew.toFixed(2)}%). Confidence = |score−50|×2+30.`}
            />

            <PredCard
              horizon="TOMORROW  (1DTE / 24h)"
              direction={data.dirTomorrow}
              confidence={data.confTomorrow}
              range={[data.tomLow, data.tomHigh]}
              target={data.targetTomorrow}
              bounce={levels.putWall}
              tip={`Tomorrow's outlook extrapolated from 1DTE expected move (IV ${data.atmIV.toFixed(1)}% × √(1/365) × Spot). GEX regime persistence assumed. Gamma Flip level: ${levels.gammaFlip ? "$" + levels.gammaFlip.toLocaleString() : "N/A"} — a break below this triggers higher realized vol.`}
            />

            {/* Key levels strip */}
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {[
                { l: "Call Wall", v: levels.callWall, c: "#22c55e", tip: "Resistance ceiling — max call GEX accumulation. Dealers sell into spot reaching this." },
                { l: "Put Wall", v: levels.putWall, c: "#ef4444", tip: "Support floor — max put GEX. Dealers buy dips near this level (in positive GEX regime)." },
                { l: "Max Pain", v: levels.maxPain, c: "#a78bfa", tip: "Strike where option holders lose the most — gravitational pull near expiration." },
                { l: "γ Flip", v: levels.gammaFlip ?? 0, c: "#facc15", tip: "Gamma Flip: where Net GEX crosses zero. Above = stabilizing (long γ). Below = amplifying (short γ)." },
              ].map(({ l, v, c, tip }) => (
                <Tip key={l} text={tip}>
                  <div className="bg-white/3 border border-white/8 rounded-lg px-2 py-1.5 cursor-help hover:border-white/16 transition-colors">
                    <div className="text-[8px] text-slate-600 uppercase tracking-wider">{l}</div>
                    <div className="text-[10px] font-mono font-bold mt-0.5" style={{ color: c }}>
                      {v ? `$${v.toLocaleString()}` : "N/A"}
                    </div>
                  </div>
                </Tip>
              ))}
            </div>
          </div>
        </div>

        {/* ── DIVIDER ─────────────────────────────────────────────────────────── */}
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${scoreColor}30, transparent)` }} />

        {/* ── GREEK SIGNALS TABLE ──────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2 px-3">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">Greek Signal Breakdown</span>
            <span className="text-[8px] text-slate-600 font-mono">BULL score / weight</span>
          </div>

          <div className="border border-white/8 rounded-xl overflow-hidden">
            <GreekRow
              symbol="Γ" label="Gamma Exposure"
              value={`${data.netGEX > 0 ? "+" : ""}${data.netGEX.toFixed(2)}B`}
              barPct={data.gexBull} direction={data.netGEX >= 0 ? "bull" : "bear"} weight={25}
              tip={`Net GEX = ${data.netGEX.toFixed(2)}B. Positive = dealers long gamma → price stabilizing. Negative = dealers short gamma → moves amplify. Bull score: ${data.gexBull.toFixed(0)}/100. Weight: 25% of composite.`}
            />
            <div className="h-px bg-white/5" />
            <GreekRow
              symbol="Δ" label="Delta Exposure"
              value={formatNumber(data.netDEX)}
              barPct={data.dexBull} direction={data.netDEX >= 0 ? "bull" : "bear"} weight={20}
              tip={`Net DEX (Dollar Delta) = ${formatNumber(data.netDEX)}. Total market directional exposure in $. Positive = net long delta positioning (bullish bias). Dealers must hedge in same direction → flow momentum. Bull score: ${data.dexBull.toFixed(0)}/100. Weight: 20%.`}
            />
            <div className="h-px bg-white/5" />
            <GreekRow
              symbol="÷" label="Put/Call Ratio"
              value={data.pcRatio.toFixed(2)}
              barPct={data.pcBull} direction={data.pcRatio < 0.9 ? "bull" : data.pcRatio > 1.2 ? "bear" : "neutral"} weight={20}
              tip={`P/C OI Ratio = ${data.pcRatio.toFixed(2)}. Below 0.9 = bullish positioning (more call exposure). Above 1.2 = defensive/bearish (heavy put hedging). Bull score: ${data.pcBull.toFixed(0)}/100. Weight: 20%.`}
            />
            <div className="h-px bg-white/5" />
            <GreekRow
              symbol="σ" label="IV Rank"
              value={`${data.ivRank.toFixed(0)}/100`}
              barPct={data.ivBull} direction={data.ivRank < 30 ? "bull" : data.ivRank > 70 ? "bear" : "neutral"} weight={15}
              tip={`IV Rank = ${data.ivRank.toFixed(0)}/100. Shows where ATM IV (${data.atmIV.toFixed(1)}%) sits vs historical range. Low IV = compressed vol, bullish for premium sellers. High IV = elevated fear, bullish for premium buyers. Bull score: ${data.ivBull.toFixed(0)}/100. Weight: 15%.`}
            />
            <div className="h-px bg-white/5" />
            <GreekRow
              symbol="~" label="Put Skew"
              value={`+${data.skew.toFixed(2)}%`}
              barPct={data.skewBull} direction={data.skew < 2 ? "bull" : data.skew > 5 ? "bear" : "neutral"} weight={10}
              tip={`Put Skew = ${data.skew.toFixed(2)}% (OTM Put IV ${(data.atmIV + data.skew * 0.6).toFixed(1)}% vs OTM Call IV ${(data.atmIV - data.skew * 0.4).toFixed(1)}%). Elevated skew = tail hedge demand, bearish signal. Low skew = complacency, bullish. Bull score: ${data.skewBull.toFixed(0)}/100. Weight: 10%.`}
            />
            <div className="h-px bg-white/5" />
            <GreekRow
              symbol="V" label="Vanna Flow"
              value={formatNumber(data.totalVanna)}
              barPct={data.vannaBull} direction="bull" weight={5}
              tip={`Vanna (∂Δ/∂σ) total = ${formatNumber(data.totalVanna)}. Measures how much dealer delta changes when IV moves. High positive vanna = IV drop forces dealers to buy → short squeeze fuel. Weight: 5%.`}
            />
            <div className="h-px bg-white/5" />
            <GreekRow
              symbol="θ" label="Charm Decay"
              value={formatNumber(data.totalCharm)}
              barPct={data.charmBull} direction={data.totalCharm < 0 ? "bear" : "neutral"} weight={5}
              tip={`Charm (∂Δ/∂t) total = ${formatNumber(data.totalCharm)}. Rate of delta decay per calendar day. Negative charm near expiry = dealers must reduce hedges → can suppress movement. Weight: 5%.`}
            />
          </div>
        </div>

        {/* ── DIVIDER ─────────────────────────────────────────────────────────── */}
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${scoreColor}30, transparent)` }} />

        {/* ── REGIME ANALYSIS ──────────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-4"
          style={{ background: reg.bg, border: `1px solid ${reg.border}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: reg.color }} />
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: reg.color }}>{reg.label} REGIME</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-mono">{reg.desc}</p>
          <div className="grid grid-cols-3 gap-2 mt-3 text-[9px] font-mono">
            <div>
              <div className="text-slate-600">Realized Vol</div>
              <div className="text-slate-300">{data.regime === "EXPLOSIVE" ? "Expanding ↑" : data.regime === "COMPRESSED" ? "Suppressed ↓" : "Transitioning →"}</div>
            </div>
            <div>
              <div className="text-slate-600">Premium Selling</div>
              <div className="text-slate-300">{data.ivRank > 60 ? "Favorable" : data.ivRank < 30 ? "Avoid" : "Neutral"}</div>
            </div>
            <div>
              <div className="text-slate-600">Trend Following</div>
              <div className="text-slate-300">{data.regime === "EXPLOSIVE" ? "Favorable" : data.regime === "COMPRESSED" ? "Avoid" : "Selective"}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-[8px] text-slate-700 font-mono pt-1">
          <span>CBOE · {ticker.symbol} · {new Date().toLocaleTimeString()}</span>
          <span>Composite Score: {data.score}/100</span>
        </div>
      </div>
    </div>
  );
}

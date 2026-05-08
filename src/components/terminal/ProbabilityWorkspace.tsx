import { useMemo, useState, useRef } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell, BarChart, Bar,
  ComposedChart, Line, Legend,
} from "recharts";
import { computeExposures, computeKeyLevels, formatNumber, bsGreeks, DemoTicker, OptionContract } from "@/lib/gex";

interface Props { ticker: DemoTicker; contracts: OptionContract[] }

const C = {
  bg: "#080808", panel: "#0c0c0c", card: "#101010", border: "#1a1a1a",
  grid: "#141414", text: "#e5e7eb", muted: "#555", dim: "#333",
  green: "#00ff88", red: "#ff3355", yellow: "#ffd000",
  blue: "#3b82f6", purple: "#a78bfa", orange: "#ff9900", cyan: "#06b6d4",
};
const FONT = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
type Tab = "overview" | "distribution" | "radar" | "regime";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview",     label: "SCORE" },
  { id: "distribution", label: "DISTRIBUCIÓN" },
  { id: "radar",        label: "RISK RADAR" },
  { id: "regime",       label: "RÉGIMEN" },
];

// ── Standard normal CDF (Abramowitz & Stegun) ──────────────────────────────
function Φ(x: number): number {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}

// P(S_T ≥ target) for target > spot, P(S_T ≤ target) for target < spot
function logNormProb(spot: number, target: number, T: number, iv: number, r=0.05): number {
  if (T <= 0 || iv <= 0) return target <= spot ? 1 : 0;
  const d2 = (Math.log(spot / target) + (r - iv*iv/2)*T) / (iv*Math.sqrt(T));
  return target > spot ? Φ(d2) : Φ(-d2);
}

// P(|S_T - target| ≤ halfBand)
function pinProb(spot: number, target: number, halfBand: number, T: number, iv: number, r=0.05): number {
  if (T <= 0 || iv <= 0 || halfBand <= 0) return 0;
  const lo = target - halfBand, hi = target + halfBand;
  if (lo <= 0) return 0;
  const d2_hi = (Math.log(spot / hi) + (r - iv*iv/2)*T) / (iv*Math.sqrt(T));
  const d2_lo = (Math.log(spot / lo) + (r - iv*iv/2)*T) / (iv*Math.sqrt(T));
  return Math.max(0, Φ(-d2_hi) - Φ(-d2_lo));
}

// Seeded pseudo-random (Mulberry32) for reproducible Monte Carlo
function makeRng(seed: number) {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function boxMuller(rng: () => number): number {
  const u1 = rng() || 1e-12, u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// GBM Monte Carlo — returns array of terminal prices
function simulatePaths(spot: number, T: number, iv: number, nPaths=2500, nSteps=30, r=0.05): number[] {
  const rng = makeRng(spot * 1000 | 0);
  const dt = T / nSteps;
  const drift = (r - iv*iv/2)*dt, diff = iv*Math.sqrt(dt);
  const out: number[] = [];
  for (let i=0; i<nPaths; i++) {
    let S = spot;
    for (let j=0; j<nSteps; j++) S *= Math.exp(drift + diff*boxMuller(rng));
    out.push(S);
  }
  return out;
}

// Build histogram buckets from terminal prices
function buildHistogram(prices: number[], nBins=60) {
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const step = (hi - lo) / nBins;
  const bins: { price: number; count: number; pct: number }[] = [];
  for (let i=0; i<nBins; i++) {
    const center = lo + (i+0.5)*step;
    const count = prices.filter(p => p >= lo+i*step && p < lo+(i+1)*step).length;
    bins.push({ price: parseFloat(center.toFixed(2)), count, pct: count/prices.length*100 });
  }
  return bins;
}

// ── Linear regression (slope, intercept, r²) ────────────────────────────────
function linReg(pts: {x:number;y:number}[]): {slope:number;intercept:number;r2:number} {
  if (pts.length < 2) return { slope:0, intercept:0, r2:0 };
  const n=pts.length, sx=pts.reduce((a,p)=>a+p.x,0), sy=pts.reduce((a,p)=>a+p.y,0);
  const sxy=pts.reduce((a,p)=>a+p.x*p.y,0), sx2=pts.reduce((a,p)=>a+p.x*p.x,0);
  const slope=(n*sxy-sx*sy)/(n*sx2-sx*sx+1e-12);
  const intercept=(sy-slope*sx)/n;
  const ybar=sy/n;
  const ss_res=pts.reduce((a,p)=>a+(p.y-(slope*p.x+intercept))**2,0);
  const ss_tot=pts.reduce((a,p)=>a+(p.y-ybar)**2,0);
  const r2=1-ss_res/(ss_tot+1e-12);
  return { slope, intercept, r2: Math.max(0,Math.min(1,r2)) };
}

// ── Main probability computations ────────────────────────────────────────────
function useGammaProbabilities(ticker: DemoTicker, contracts: OptionContract[]) {
  return useMemo(() => {
    const exposures = computeExposures(ticker.spot, contracts);
    const levels = computeKeyLevels(exposures);
    const { callWall, putWall, maxPain, majorWall, gammaFlip, totalGex } = levels;
    const spot = ticker.spot;
    const iv = ticker.baseIV;

    // Use nearest contract expiry for T
    const minDays = contracts.length
      ? Math.min(...contracts.map(c => c.expiry))
      : 30;
    const T = Math.max(minDays, 1) / 365;
    const halfBand = ticker.strikeStep * 0.75;

    // ── Individual probabilities ──
    const pCallWall   = logNormProb(spot, callWall,  T, iv) * 100;
    const pPutWall    = logNormProb(spot, putWall,   T, iv) * 100;
    const pMaxPain    = pinProb(spot, maxPain, halfBand, T, iv) * 100;
    const pMajorWall  = logNormProb(spot, majorWall, T, iv) * 100;
    const pGammaFlip  = gammaFlip != null
      ? logNormProb(spot, gammaFlip, T, iv) * 100 : null;

    // ── 1σ implied move ──
    const sigma1 = spot * iv * Math.sqrt(T);
    const impliedUp   = spot + sigma1;
    const impliedDown = spot - sigma1;

    // ── Composite Gamma Probability Score (0–100) ──
    // Component A: GEX direction × magnitude [0–100 → mapped to 25–75]
    const gexMag  = Math.min(1, Math.abs(totalGex) / 5e8);
    const gexDir  = totalGex > 0 ? 1 : -1;
    const gexComp = 50 + gexDir * gexMag * 25;                   // 25–75

    // Component B: Max Pain pin probability [already 0–100] → rescale to 0–25
    const pinComp = pMaxPain;                                     // 0–100

    // Component C: Wall proximity balance [0–100, 50=neutral]
    const callDist = Math.abs(callWall - spot) / spot;
    const putDist  = Math.abs(spot - putWall) / spot;
    const total    = callDist + putDist + 1e-6;
    const wallComp = 50 + ((putDist - callDist) / total) * 50;   // 0–100

    // Component D: Gamma flip alignment [0–100]
    let flipComp = 50;
    if (gammaFlip != null) {
      const pct = (spot - gammaFlip) / spot;
      flipComp = Math.max(0, Math.min(100, 50 + pct * 600));
    }

    const compositeScore = Math.max(0, Math.min(100,
      gexComp    * 0.35 +
      pinComp    * 0.25 +
      wallComp   * 0.25 +
      flipComp   * 0.15
    ));

    // ── Regime label ──
    const regimeLabel =
      compositeScore >= 72 ? "STRONG PINNING" :
      compositeScore >= 58 ? "BULLISH GAMMA"  :
      compositeScore >= 42 ? "NEUTRAL"         :
      compositeScore >= 28 ? "BEARISH GAMMA"  :
                             "HIGH PRESSURE";

    const regimeColor =
      compositeScore >= 72 ? C.green  :
      compositeScore >= 58 ? C.cyan   :
      compositeScore >= 42 ? C.yellow :
      compositeScore >= 28 ? C.orange :
                             C.red;

    // ── Monte Carlo distribution ──
    const mcPaths = simulatePaths(spot, T, iv);
    const histogram = buildHistogram(mcPaths);

    // ── GEX Regime Scatter (strike vs netGex) ──
    const scatterData = exposures
      .filter(e => Math.abs(e.netGex) > 0)
      .map(e => ({
        distPct: ((e.strike - spot) / spot) * 100,
        gex: e.netGex / 1e6,                        // in millions
        strike: e.strike,
        positive: e.netGex >= 0,
      }));

    // Regression lines by zone
    const posPoints = scatterData.filter(d => d.gex > 0).map(d => ({x:d.distPct, y:d.gex}));
    const negPoints = scatterData.filter(d => d.gex < 0).map(d => ({x:d.distPct, y:d.gex}));
    const regPos = linReg(posPoints);
    const regNeg = linReg(negPoints);

    // ── Risk Radar factors (0–100 each) ──
    const totalCallGex = exposures.reduce((a,e) => a + Math.max(0, e.callGex), 0);
    const totalPutGex  = Math.abs(exposures.reduce((a,e) => a + Math.min(0, e.putGex), 0));
    const totalDex     = Math.abs(exposures.reduce((a,e) => a + e.dex, 0));
    const totalVex     = Math.abs(exposures.reduce((a,e) => a + e.vex, 0));
    const totalVanna   = Math.abs(exposures.reduce((a,e) => a + e.vanna, 0));

    // Herfindahl concentration index of |netGex|
    const gexArr = exposures.map(e => Math.abs(e.netGex));
    const gexSum = gexArr.reduce((a,v)=>a+v,0) || 1;
    const hhi = gexArr.reduce((a,v)=>a+(v/gexSum)**2, 0) * 100; // 0–100

    const radarFactors = [
      { factor: "Gamma\nIntensidad", score: Math.min(100, gexMag * 100),       full: 100 },
      { factor: "Call\nPresión",     score: Math.min(100, (totalCallGex/5e8)*100), full: 100 },
      { factor: "Put\nPresión",      score: Math.min(100, (totalPutGex/5e8)*100),  full: 100 },
      { factor: "Delta\nSkew",       score: Math.min(100, (totalDex/2e9)*100),  full: 100 },
      { factor: "Vanna\nRisk",       score: Math.min(100, (totalVanna/1e7)*100), full: 100 },
      { factor: "IV\nNivel",         score: Math.min(100, iv * 250),            full: 100 },
      { factor: "GEX\nConc.",        score: Math.min(100, hhi),                 full: 100 },
    ];

    // ── Correlation metrics ──
    const corrPos = regPos.r2;
    const corrNeg = regNeg.r2;

    return {
      levels, spot, iv, T, sigma1, impliedUp, impliedDown,
      pCallWall, pPutWall, pMaxPain, pMajorWall, pGammaFlip,
      compositeScore, regimeLabel, regimeColor,
      histogram, mcPaths: mcPaths.length,
      scatterData, regPos, regNeg, corrPos, corrNeg,
      radarFactors,
      callWall, putWall, maxPain, majorWall, gammaFlip, totalGex,
    };
  }, [ticker, contracts]);
}

// ── Score color by value ─────────────────────────────────────────────────────
function scoreColor(v: number) {
  if (v >= 70) return C.green;
  if (v >= 55) return C.cyan;
  if (v >= 40) return C.yellow;
  if (v >= 25) return C.orange;
  return C.red;
}

// ── Probability card ─────────────────────────────────────────────────────────
function ProbCard({ label, pct, color, sub }: { label: string; pct: number; color: string; sub?: string }) {
  return (
    <div className="rounded p-3 flex flex-col gap-2" style={{ background: C.card, border: `1px solid ${color}30` }}>
      <div style={{ color: C.muted, fontSize: 9, letterSpacing: "0.18em" }} className="uppercase font-bold">{label}</div>
      <div style={{ color, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{pct.toFixed(1)}<span style={{fontSize:14,fontWeight:400}}>%</span></div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100,pct)}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
      </div>
      {sub && <div style={{ color: C.muted, fontSize: 9 }}>{sub}</div>}
    </div>
  );
}

// ── Composite gauge ──────────────────────────────────────────────────────────
function CompositeGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const RADIUS = 80, STROKE = 14;
  const circumference = Math.PI * RADIUS;
  const filled = (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={200} height={110} viewBox="0 0 200 110">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={C.red} />
            <stop offset="35%"  stopColor={C.orange} />
            <stop offset="55%"  stopColor={C.yellow} />
            <stop offset="80%"  stopColor={C.cyan} />
            <stop offset="100%" stopColor={C.green} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* track */}
        <path
          d={`M ${200-STROKE/2} 100 A ${RADIUS} ${RADIUS} 0 0 0 ${STROKE/2} 100`}
          fill="none" stroke={C.border} strokeWidth={STROKE} strokeLinecap="round"
        />
        {/* filled */}
        <path
          d={`M ${200-STROKE/2} 100 A ${RADIUS} ${RADIUS} 0 0 0 ${STROKE/2} 100`}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          filter="url(#glow)"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        {/* tick marks */}
        {[0,25,50,75,100].map((pct) => {
          const angle = Math.PI - (pct/100)*Math.PI;
          const r2 = RADIUS + STROKE/2 + 5;
          const x = 100 - r2*Math.cos(angle), y = 100 - r2*Math.sin(angle);
          return (
            <g key={pct}>
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                fill={C.muted} fontSize={8} fontFamily={FONT}>{pct}</text>
            </g>
          );
        })}
        {/* center score */}
        <text x={100} y={82} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={32} fontFamily={FONT} fontWeight={900} filter="url(#glow)">
          {score.toFixed(0)}
        </text>
        <text x={100} y={98} textAnchor="middle" dominantBaseline="middle"
          fill={C.muted} fontSize={9} fontFamily={FONT}>/ 100</text>
      </svg>
      <div className="px-4 py-1.5 rounded text-center" style={{ background: `${color}18`, border: `1px solid ${color}50` }}>
        <span style={{ color, fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>{label}</span>
      </div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHead({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div style={{ height: 1, flex: 1, background: C.border }} />
      <span style={{ color: C.muted, fontSize: 9, letterSpacing: "0.2em" }} className="uppercase font-bold">{label}</span>
      <div style={{ height: 1, flex: 1, background: C.border }} />
    </div>
  );
}

// ── Custom Tooltip for scatter ───────────────────────────────────────────────
function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background:"#000", border:`1px solid ${d.positive?C.green:C.red}`, padding:"8px 12px", borderRadius:4, fontFamily:FONT }}>
      <div style={{ color: d.positive?C.green:C.red, fontSize:10, fontWeight:700 }}>
        STRIKE ${d.strike}
      </div>
      <div style={{ color: C.muted, fontSize:9 }}>Dist: {d.distPct.toFixed(2)}%</div>
      <div style={{ color: d.positive?C.green:C.red, fontSize:10 }}>
        GEX: {d.gex.toFixed(2)}M
      </div>
    </div>
  );
}

// ── Tab: OVERVIEW ────────────────────────────────────────────────────────────
function OverviewTab({ data, ticker }: { data: ReturnType<typeof useGammaProbabilities>; ticker: DemoTicker }) {
  const { compositeScore, regimeLabel, regimeColor, pCallWall, pPutWall, pMaxPain, pMajorWall,
          pGammaFlip, levels, spot, sigma1, impliedUp, impliedDown, totalGex } = data;

  const metricRows = [
    { label: "Spot",         value: `$${spot.toFixed(2)}`,              color: C.yellow },
    { label: "Call Wall",    value: `$${levels.callWall}`,               color: C.green },
    { label: "Put Wall",     value: `$${levels.putWall}`,                color: C.red },
    { label: "Max Pain",     value: `$${levels.maxPain}`,                color: C.purple },
    { label: "Major Wall",   value: `$${levels.majorWall}`,              color: C.orange },
    { label: "Gamma Flip",   value: levels.gammaFlip != null ? `$${levels.gammaFlip}` : "—", color: C.cyan },
    { label: "Total GEX",    value: formatNumber(totalGex),              color: totalGex>=0?C.green:C.red },
    { label: "1σ Move Up",   value: `$${impliedUp.toFixed(2)}`,          color: C.green },
    { label: "1σ Move Down", value: `$${impliedDown.toFixed(2)}`,        color: C.red },
    { label: "1σ Range",     value: `±$${sigma1.toFixed(2)}`,            color: C.muted },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* Composite gauge */}
      <div className="flex flex-col items-center py-4">
        <div style={{ color: C.muted, fontSize: 9, letterSpacing:"0.25em" }} className="uppercase mb-3 font-bold">
          Gamma Probability Score
        </div>
        <CompositeGauge score={compositeScore} label={regimeLabel} color={regimeColor} />
        <div style={{ color: C.muted, fontSize: 9, marginTop: 8, textAlign:"center" }}>
          Índice compuesto: GEX direction · Pin probability · Wall balance · Flip alignment
        </div>
      </div>

      {/* Score components */}
      <SectionHead label="Componentes del score" />
      <div className="grid grid-cols-2 gap-2">
        {[
          { label:"GEX Dirección",    v: totalGex>=0?75:25,      color: totalGex>=0?C.green:C.red },
          { label:"Pin Max Pain",     v: pMaxPain,               color: C.purple },
          { label:"Wall Balance",     v: Math.abs(((levels.callWall+levels.putWall)/2-spot)/spot*500+50), color: C.cyan },
          { label:"Flip Alignment",   v: levels.gammaFlip?Math.max(0,Math.min(100,(spot-levels.gammaFlip)/spot*600+50)):50, color: C.yellow },
        ].map(r => (
          <div key={r.label} className="rounded p-2.5" style={{ background:C.card, border:`1px solid ${C.border}` }}>
            <div style={{ color:C.muted, fontSize:8, letterSpacing:"0.15em" }} className="uppercase mb-1">{r.label}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:C.border }}>
                <div style={{ width:`${Math.min(100,Math.max(0,r.v))}%`, background:r.color, height:"100%", transition:"width 1s" }} className="rounded-full" />
              </div>
              <span style={{ color:r.color, fontSize:10, fontWeight:700, width:32, textAlign:"right" }}>{Math.min(100,Math.max(0,r.v)).toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Key level probabilities */}
      <SectionHead label="Probabilidades por nivel" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ProbCard label="Call Wall" pct={pCallWall} color={C.green}
          sub={`Alcanzar $${levels.callWall}`} />
        <ProbCard label="Put Wall" pct={pPutWall} color={C.red}
          sub={`Alcanzar $${levels.putWall}`} />
        <ProbCard label="Max Pain Pin" pct={pMaxPain} color={C.purple}
          sub={`Dentro ±${ticker.strikeStep*0.75} del $${levels.maxPain}`} />
        <ProbCard label="Major Wall" pct={pMajorWall} color={C.orange}
          sub={`Alcanzar $${levels.majorWall}`} />
        {pGammaFlip != null && (
          <ProbCard label="Gamma Flip" pct={pGammaFlip} color={C.cyan}
            sub={`Cruzar $${levels.gammaFlip}`} />
        )}
      </div>

      {/* Metrics table */}
      <SectionHead label="Métricas clave" />
      <div className="rounded overflow-hidden" style={{ border:`1px solid ${C.border}` }}>
        {metricRows.map((r, i) => (
          <div key={r.label}
            className="flex justify-between items-center px-3 py-1.5"
            style={{ background: i%2===0 ? C.card : C.panel }}>
            <span style={{ color:C.muted, fontSize:10, letterSpacing:"0.1em" }} className="uppercase">{r.label}</span>
            <span style={{ color:r.color, fontSize:11, fontWeight:700 }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: DISTRIBUTION (Monte Carlo) ─────────────────────────────────────────
function DistributionTab({ data, ticker }: { data: ReturnType<typeof useGammaProbabilities>; ticker: DemoTicker }) {
  const { histogram, levels, spot, impliedUp, impliedDown, mcPaths, T, iv } = data;
  const maxCount = Math.max(...histogram.map(b => b.count), 1);

  const keyLevels = [
    { price: spot,               label: "SPOT",       color: C.yellow },
    { price: levels.callWall,    label: "CALL WALL",  color: C.green },
    { price: levels.putWall,     label: "PUT WALL",   color: C.red },
    { price: levels.maxPain,     label: "MAX PAIN",   color: C.purple },
    { price: impliedUp,          label: "+1σ",        color: C.cyan },
    { price: impliedDown,        label: "-1σ",        color: C.orange },
  ];

  const pctBelow = histogram.filter(b => b.price < spot).reduce((a,b)=>a+b.pct,0);

  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Paths simulados", value: mcPaths.toLocaleString(), color: C.muted },
          { label: "IV Usado",        value: `${(iv*100).toFixed(1)}%`,  color: C.yellow },
          { label: "T (años)",        value: T.toFixed(3),               color: C.cyan },
        ].map(r => (
          <div key={r.label} className="rounded p-2 text-center" style={{ background:C.card, border:`1px solid ${C.border}` }}>
            <div style={{ color:C.muted, fontSize:8, letterSpacing:"0.15em" }} className="uppercase">{r.label}</div>
            <div style={{ color:r.color, fontSize:14, fontWeight:700 }}>{r.value}</div>
          </div>
        ))}
      </div>

      {/* Histogram chart */}
      <div style={{ flex:1, minHeight:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={histogram} margin={{ top:10, right:20, left:0, bottom:30 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="price" stroke={C.muted} fontSize={9} tick={{ fontFamily:FONT }}
              tickFormatter={v => `$${Number(v).toFixed(0)}`}
              label={{ value:"Precio terminal (GBM)", position:"insideBottom", offset:-15, fill:C.muted, fontSize:9, fontFamily:FONT }}
              interval={Math.floor(histogram.length/8)} />
            <YAxis stroke={C.muted} fontSize={9} tick={{ fontFamily:FONT }}
              label={{ value:"Freq %", angle:-90, position:"insideLeft", offset:10, fill:C.muted, fontSize:9, fontFamily:FONT }} />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background:"#000", border:`1px solid ${C.border}`, padding:"8px 12px", borderRadius:4, fontFamily:FONT }}>
                    <div style={{ color:C.text, fontSize:10, fontWeight:700 }}>${d.price}</div>
                    <div style={{ color:C.muted, fontSize:9 }}>Freq: {d.pct.toFixed(2)}%</div>
                    <div style={{ color:C.muted, fontSize:9 }}>Count: {d.count}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="pct" radius={[2,2,0,0]}>
              {histogram.map((b, i) => (
                <Cell key={i}
                  fill={b.price >= spot ? C.green : C.red}
                  fillOpacity={0.6 + (b.count/maxCount)*0.35}
                />
              ))}
            </Bar>
            {keyLevels.map(kl => (
              <ReferenceLine key={kl.label} x={kl.price} stroke={kl.color}
                strokeDasharray="6 3" strokeWidth={1.5}
                label={{ position:"top", value:kl.label, fill:kl.color, fontSize:8, fontFamily:FONT, fontWeight:700 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded p-3" style={{ background:C.card, border:`1px solid ${C.red}30` }}>
          <div style={{ color:C.muted, fontSize:9, letterSpacing:"0.15em" }} className="uppercase mb-1">P(S_T &lt; Spot)</div>
          <div style={{ color:C.red, fontSize:22, fontWeight:900 }}>{pctBelow.toFixed(1)}<span style={{fontSize:12}}>%</span></div>
        </div>
        <div className="rounded p-3" style={{ background:C.card, border:`1px solid ${C.green}30` }}>
          <div style={{ color:C.muted, fontSize:9, letterSpacing:"0.15em" }} className="uppercase mb-1">P(S_T &gt; Spot)</div>
          <div style={{ color:C.green, fontSize:22, fontWeight:900 }}>{(100-pctBelow).toFixed(1)}<span style={{fontSize:12}}>%</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: RISK RADAR ──────────────────────────────────────────────────────────
function RadarTab({ data }: { data: ReturnType<typeof useGammaProbabilities> }) {
  const { radarFactors, compositeScore, regimeLabel, regimeColor } = data;

  const radarData = radarFactors.map(f => ({
    factor: f.factor.replace("\n"," "),
    score: f.score,
    full: 100,
  }));

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="grid grid-cols-3 gap-2">
        {radarFactors.map(f => (
          <div key={f.factor} className="rounded p-2" style={{ background:C.card, border:`1px solid ${C.border}` }}>
            <div style={{ color:C.muted, fontSize:8, letterSpacing:"0.12em" }} className="uppercase mb-1">
              {f.factor.replace("\n"," ")}
            </div>
            <div style={{ color:scoreColor(f.score), fontSize:16, fontWeight:700 }}>{f.score.toFixed(0)}<span style={{fontSize:9, color:C.muted}}>/100</span></div>
            <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background:C.border }}>
              <div style={{ width:`${f.score}%`, background:scoreColor(f.score), height:"100%" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Radar chart */}
      <div style={{ flex:1, minHeight:260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top:10, right:40, left:40, bottom:10 }}>
            <PolarGrid stroke={C.border} />
            <PolarAngleAxis
              dataKey="factor"
              tick={{ fill:C.muted, fontSize:10, fontFamily:FONT }}
            />
            <PolarRadiusAxis
              angle={90} domain={[0,100]}
              tick={{ fill:C.dim, fontSize:8, fontFamily:FONT }}
              tickCount={5}
            />
            {/* Full reference (dashed orange = "benchmark") */}
            <Radar name="Benchmark" dataKey="full"
              stroke={C.orange} strokeDasharray="4 4" strokeWidth={1}
              fill={C.orange} fillOpacity={0.04} />
            {/* Actual */}
            <Radar name="Actual" dataKey="score"
              stroke={regimeColor} strokeWidth={2}
              fill={regimeColor} fillOpacity={0.2}
              dot={{ fill:regimeColor, r:3 }} />
            <Legend
              wrapperStyle={{ fontFamily:FONT, fontSize:10, color:C.muted }}
              formatter={(v) => <span style={{ color:C.muted }}>{v}</span>}
            />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background:"#000", border:`1px solid ${C.border}`, padding:"8px 12px", borderRadius:4, fontFamily:FONT }}>
                    {payload.map((p: any) => (
                      <div key={p.name} style={{ color:p.color, fontSize:10 }}>
                        {p.name}: {Number(p.value).toFixed(1)}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Composite badge */}
      <div className="rounded p-3 text-center" style={{ background:`${regimeColor}10`, border:`1px solid ${regimeColor}40` }}>
        <span style={{ color:regimeColor, fontSize:12, fontWeight:700, letterSpacing:"0.2em" }}>
          {regimeLabel} · Score {compositeScore.toFixed(0)}/100
        </span>
      </div>
    </div>
  );
}

// ── Lognormal PDF ─────────────────────────────────────────────────────────────
function lognormalPDF(S: number, K: number, T: number, sigma: number, r = 0.05): number {
  if (T <= 0 || sigma <= 0 || K <= 0 || S <= 0) return 0;
  const mu = (r - sigma * sigma / 2) * T;
  const x = Math.log(K / S) - mu;
  return Math.exp(-x * x / (2 * sigma * sigma * T)) / (K * sigma * Math.sqrt(T * 2 * Math.PI));
}

// ── Color ramp: thermal / fire  (cold=black → red → orange → yellow → white) ─
function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
function heatColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  // Classic thermal "hot" colormap — reddest zone = highest probability
  const stops: [number, [number, number, number]][] = [
    [0.00, [4,   4,  14]],   // near-black
    [0.12, [45,  5,   5]],   // very dark red
    [0.28, [130, 15,  5]],   // dark red
    [0.45, [210, 35,  0]],   // red
    [0.60, [245, 90,  0]],   // orange-red
    [0.75, [255, 170,  0]],  // amber
    [0.88, [255, 235, 55]],  // yellow
    [1.00, [255, 255, 220]], // cream-white
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const p = (t - lo[0]) / (hi[0] - lo[0] + 1e-9);
  return `rgb(${lerp(lo[1][0],hi[1][0],p)},${lerp(lo[1][1],hi[1][1],p)},${lerp(lo[1][2],hi[1][2],p)})`;
}
function heatLabel(norm: number): { label: string; color: string } {
  if (norm > 0.75) return { label: "ZONA CALIENTE", color: "#ff6600" };
  if (norm > 0.45) return { label: "ZONA MEDIA",    color: "#ffd000" };
  if (norm > 0.20) return { label: "ZONA TIBIA",    color: "#ff3355" };
  return                  { label: "ZONA FRÍA",     color: "#555" };
}

// ── Probability Heatmap + GEX sidebar (SVG) ──────────────────────────────────
function GammaProbHeatmap({ spot, iv, contracts, levels }: {
  spot: number; iv: number; contracts: OptionContract[];
  levels: { callWall: number; putWall: number; maxPain: number; majorWall: number; gammaFlip: number | null };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{
    col: number; row: number; K: number; dte: number; T: number; pdf: number; norm: number;
  } | null>(null);
  const [hoverGex, setHoverGex] = useState<{ ri: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const COLS = 100;
  const PAD  = 0.14;
  const sMin = spot * (1 - PAD);
  const sMax = spot * (1 + PAD);
  const sRange = sMax - sMin;

  const dtes = useMemo(() => {
    const set = new Set<number>();
    contracts.forEach(c => set.add(c.expiry));
    const arr = Array.from(set).sort((a, b) => a - b);
    return arr.length > 0 ? arr.slice(0, 20) : [5, 10, 15, 21, 30, 45, 60, 90];
  }, [contracts]);

  const ROWS = dtes.length;

  // ── PDF grid + sigma cones ───────────────────────────────────────────────
  const { cells, maxPdf, sigma1Lines, sigma2Lines } = useMemo(() => {
    let maxPdf = 0;
    const raw: { r: number; c: number; K: number; pdf: number }[] = [];
    for (let ri = 0; ri < ROWS; ri++) {
      const T = dtes[ri] / 365;
      for (let ci = 0; ci < COLS; ci++) {
        const K = sMin + (ci + 0.5) * (sRange / COLS);
        const pdf = lognormalPDF(spot, K, T, iv);
        if (pdf > maxPdf) maxPdf = pdf;
        raw.push({ r: ri, c: ci, K, pdf });
      }
    }
    const sigma1Lines: { x1u: number; x1d: number }[] = [];
    const sigma2Lines: { x2u: number; x2d: number }[] = [];
    for (let ri = 0; ri < ROWS; ri++) {
      const T = dtes[ri] / 365;
      const mu = (0.05 - iv * iv / 2) * T, sv = iv * Math.sqrt(T);
      sigma1Lines.push({
        x1u: (spot * Math.exp(mu + sv)   - sMin) / sRange,
        x1d: (spot * Math.exp(mu - sv)   - sMin) / sRange,
      });
      sigma2Lines.push({
        x2u: (spot * Math.exp(mu + 2*sv) - sMin) / sRange,
        x2d: (spot * Math.exp(mu - 2*sv) - sMin) / sRange,
      });
    }
    return { cells: raw, maxPdf, sigma1Lines, sigma2Lines };
  }, [spot, iv, dtes, sMin, sRange, COLS, ROWS]);

  // ── Net GEX by DTE (for left sidebar bars) ───────────────────────────────
  const gexByDTE = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of contracts) {
      const T = Math.max(c.expiry, 1) / 365;
      const sigma = c.iv || iv;
      // Gamma ≈ lognormal PDF proxy (same formula used in GEX calc)
      const gamma_approx = lognormalPDF(spot, c.strike, T, sigma) * c.strike / spot;
      const sign = c.type === "call" ? 1 : -1;
      const gex = gamma_approx * c.oi * 100 * spot * spot * 0.01 * sign;
      map.set(c.expiry, (map.get(c.expiry) ?? 0) + gex);
    }
    const values = dtes.map(d => map.get(d) ?? 0);
    const maxAbsGex = Math.max(...values.map(Math.abs), 1);
    return values.map(gex => ({
      gex,
      norm: gex / maxAbsGex,        // [-1, 1]
      gexM: gex / 1e6,              // in millions for label
    }));
  }, [contracts, dtes, spot, iv]);

  const maxAbsGexM = Math.max(...gexByDTE.map(d => Math.abs(d.gexM)), 0.01);

  // ── SVG layout ────────────────────────────────────────────────────────────
  // Left GEX panel: x=[GEX_L, GEX_R], center at GEX_CX
  const GEX_L  = 4, GEX_R = 90, GEX_CX = 47, GEX_HW = 40;
  const SEP_X  = 94;    // separator line x
  const ML     = 100;   // heatmap left edge
  const MR     = 72;    // right margin (colorbar)
  const MT     = 24;    // top margin
  const MB     = 44;    // bottom margin
  const VW     = 1000, VH = 350;
  const plotW  = VW - ML - MR;
  const plotH  = VH - MT - MB;
  const cW     = plotW / COLS;
  const cH     = plotH / ROWS;

  const sX    = (k: number) => ML + ((k - sMin) / sRange) * plotW;
  const rowY  = (ri: number) => MT + ri * cH;

  // ── Mouse handler (only fires inside heatmap area) ─────────────────────
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const sp = pt.matrixTransform(ctm.inverse());

    // Inside GEX bar panel?
    if (sp.x >= GEX_L && sp.x <= GEX_R && sp.y >= MT && sp.y <= MT + plotH) {
      const ri = Math.floor((sp.y - MT) / cH);
      if (ri >= 0 && ri < ROWS) { setHoverGex({ ri }); setHover(null); setMousePos({ x: e.clientX, y: e.clientY }); return; }
    }
    setHoverGex(null);

    // Inside heatmap?
    const col = Math.floor((sp.x - ML) / cW);
    const row = Math.floor((sp.y - MT) / cH);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      const K = sMin + (col + 0.5) * (sRange / COLS);
      const T = dtes[row] / 365;
      const pdf = lognormalPDF(spot, K, T, iv);
      const norm = maxPdf > 0 ? pdf / maxPdf : 0;
      setHover({ col, row, K, dte: dtes[row], T, pdf, norm });
      setMousePos({ x: e.clientX, y: e.clientY });
    } else {
      setHover(null);
    }
  }

  const keyLines = [
    { k: spot,            label: "SPOT", color: "#ffd000", w: 2,   dash: "none" },
    { k: levels.callWall, label: "CW",  color: "#00ff88", w: 1.2, dash: "5 3"  },
    { k: levels.putWall,  label: "PW",  color: "#ff3355", w: 1.2, dash: "5 3"  },
    { k: levels.maxPain,  label: "MP",  color: "#a78bfa", w: 1,   dash: "4 2"  },
    ...(levels.gammaFlip != null
      ? [{ k: levels.gammaFlip, label: "GF", color: "#06b6d4", w: 1, dash: "4 2" }]
      : []),
  ].filter(kl => kl.k >= sMin && kl.k <= sMax);

  const xTicks: number[] = [];
  for (let i = 0; i <= 8; i++) xTicks.push(sMin + (i / 8) * sRange);
  const SCALE_STEPS = 32;

  // Hover colors / meta
  const hoverX     = hover ? ML + hover.col * cW : -1;
  const hoverY_sv  = hover ? MT + hover.row * cH : -1;
  const hoverColor = hover ? heatColor(hover.norm) : "#fff";
  const hoverMeta  = hover ? heatLabel(hover.norm) : null;
  const hoverGexDTE = hoverGex ? gexByDTE[hoverGex.ri] : null;

  return (
    <div style={{ background: "#030306", border: `1px solid ${C.border}`, borderRadius: 6, position: "relative" }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: "#ff6600", fontSize: 9, letterSpacing: "0.2em" }} className="uppercase font-bold">
          Heatmap · Prob. Log-Normal
        </span>
        <span style={{ color: C.dim, fontSize: 8 }}>
          PDF(S_T=K | σ={(iv*100).toFixed(1)}%) · GEX panel (izquierda)
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: "#e91e8c" }} />
          <span style={{ color: C.muted, fontSize: 8 }}>GEX+</span>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: "#5b21b6" }} />
          <span style={{ color: C.muted, fontSize: 8 }}>GEX−</span>
          <div style={{ width: 1, height: 12, background: C.border, margin: "0 6px" }} />
          <span style={{ color: C.muted, fontSize: 8 }}>FRÍO</span>
          <div style={{ width: 60, height: 8, borderRadius: 2, background: `linear-gradient(to right,${heatColor(0)},${heatColor(0.5)},${heatColor(1)})` }} />
          <span style={{ color: "#ff6600", fontSize: 8 }}>CALIENTE</span>
        </div>
      </div>

      {/* ── SVG ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", display: "block", cursor: "crosshair" }}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHover(null); setHoverGex(null); }}
      >
        <defs>
          <clipPath id="hClip3">
            <rect x={ML} y={MT} width={plotW} height={plotH} />
          </clipPath>
          <clipPath id="gexClip">
            <rect x={GEX_L} y={MT} width={GEX_R - GEX_L} height={plotH} />
          </clipPath>
          <linearGradient id="barPosGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c2185b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#e91e8c" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="barNegGrad" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#4527a0" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#5b21b6" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* LEFT GEX SIDEBAR                                             */}
        {/* ════════════════════════════════════════════════════════════ */}

        {/* GEX panel background */}
        <rect x={GEX_L} y={MT} width={GEX_R - GEX_L} height={plotH}
          fill="#060612" rx={2} />

        {/* GEX zero axis */}
        <line x1={GEX_CX} y1={MT} x2={GEX_CX} y2={MT + plotH}
          stroke="#2a2a2a" strokeWidth={1} />

        {/* GEX bars */}
        <g clipPath="url(#gexClip)">
          {gexByDTE.map(({ norm, gexM }, ri) => {
            const barH = cH * 0.72;
            const y    = MT + ri * cH + (cH - barH) / 2;
            const isPos = norm >= 0;
            const barW  = Math.abs(norm) * GEX_HW;
            const barX  = isPos ? GEX_CX : GEX_CX - barW;
            const isHov = hoverGex?.ri === ri;
            return (
              <g key={ri}>
                <rect
                  x={barX} y={y} width={Math.max(barW, 0.5)} height={barH}
                  fill={isPos ? "url(#barPosGrad)" : "url(#barNegGrad)"}
                  fillOpacity={isHov ? 1 : 0.82}
                  rx={1.5}
                />
                {/* glow on hover */}
                {isHov && (
                  <rect
                    x={barX - 1} y={y - 1}
                    width={Math.max(barW, 0.5) + 2} height={barH + 2}
                    fill="none"
                    stroke={isPos ? "#e91e8c" : "#7c3aed"}
                    strokeWidth={1} rx={2} opacity={0.8}
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* GEX panel border */}
        <rect x={GEX_L} y={MT} width={GEX_R - GEX_L} height={plotH}
          fill="none" stroke="#1e1e1e" strokeWidth={0.8} rx={2} />

        {/* GEX axis labels (bottom) */}
        <text x={GEX_L + 1} y={MT + plotH + 12} fontSize={6.5} fontFamily={FONT} fill={C.muted} textAnchor="start">
          -{maxAbsGexM.toFixed(0)}M
        </text>
        <text x={GEX_CX} y={MT + plotH + 12} fontSize={6.5} fontFamily={FONT} fill={C.dim} textAnchor="middle">0</text>
        <text x={GEX_R - 1} y={MT + plotH + 12} fontSize={6.5} fontFamily={FONT} fill={C.muted} textAnchor="end">
          +{maxAbsGexM.toFixed(0)}M
        </text>

        {/* GEX panel title (rotated) */}
        <text
          x={GEX_L + 5} y={MT + plotH / 2}
          transform={`rotate(-90, ${GEX_L + 5}, ${MT + plotH / 2})`}
          textAnchor="middle" fill="#555" fontSize={7} fontFamily={FONT} letterSpacing="0.15em">
          GEX × DTE
        </text>

        {/* Separator */}
        <line x1={SEP_X} y1={MT - 4} x2={SEP_X} y2={MT + plotH + 4}
          stroke="#1e1e1e" strokeWidth={1.5} />

        {/* DTE labels (between GEX panel and heatmap) */}
        {dtes.map((dte, ri) => {
          const gd = gexByDTE[ri];
          const isHov = hoverGex?.ri === ri;
          return (
            <text key={dte}
              x={SEP_X + 5}
              y={MT + (ri + 0.5) * cH}
              dominantBaseline="middle"
              fill={isHov ? "#e5e7eb" : hover?.row === ri ? "#aaa" : C.muted}
              fontSize={7.5} fontFamily={FONT}
              fontWeight={isHov || hover?.row === ri ? 700 : 400}>
              {dte}d
            </text>
          );
        })}

        {/* ════════════════════════════════════════════════════════════ */}
        {/* HEATMAP                                                      */}
        {/* ════════════════════════════════════════════════════════════ */}

        <rect x={ML} y={MT} width={plotW} height={plotH} fill="#030306" />

        {/* Heat cells */}
        <g clipPath="url(#hClip3)">
          {cells.map((cell, i) => (
            <rect key={i}
              x={ML + cell.c * cW} y={MT + cell.r * cH}
              width={cW + 0.7} height={cH + 0.7}
              fill={heatColor(maxPdf > 0 ? cell.pdf / maxPdf : 0)}
            />
          ))}
        </g>

        {/* ±2σ cone */}
        <g clipPath="url(#hClip3)" opacity={0.5}>
          <polyline points={sigma2Lines.map((s, ri) => `${ML + s.x2u * plotW},${rowY(ri) + cH/2}`).join(" ")}
            fill="none" stroke="#fff" strokeWidth={1} strokeDasharray="3 5" />
          <polyline points={sigma2Lines.map((s, ri) => `${ML + s.x2d * plotW},${rowY(ri) + cH/2}`).join(" ")}
            fill="none" stroke="#fff" strokeWidth={1} strokeDasharray="3 5" />
        </g>

        {/* ±1σ cone */}
        <g clipPath="url(#hClip3)" opacity={0.9}>
          <polyline points={sigma1Lines.map((s, ri) => `${ML + s.x1u * plotW},${rowY(ri) + cH/2}`).join(" ")}
            fill="none" stroke="#fff" strokeWidth={1.6} />
          <polyline points={sigma1Lines.map((s, ri) => `${ML + s.x1d * plotW},${rowY(ri) + cH/2}`).join(" ")}
            fill="none" stroke="#fff" strokeWidth={1.6} />
        </g>

        {/* Row highlight when hovering GEX bar */}
        {hoverGex && (
          <rect x={ML} y={MT + hoverGex.ri * cH}
            width={plotW} height={cH}
            fill="#ffffff" fillOpacity={0.04}
            stroke="#ffffff" strokeWidth={0.5} strokeOpacity={0.15} />
        )}

        {/* Heatmap crosshair */}
        {hover && (
          <g clipPath="url(#hClip3)" opacity={0.75}>
            <line x1={hoverX} y1={MT} x2={hoverX} y2={MT + plotH}
              stroke={hoverColor} strokeWidth={1} />
            <line x1={ML} y1={hoverY_sv} x2={ML + plotW} y2={hoverY_sv}
              stroke={hoverColor} strokeWidth={0.8} />
            <rect x={hoverX} y={hoverY_sv} width={cW} height={cH}
              fill="none" stroke={hoverColor} strokeWidth={1.5} rx={1} />
          </g>
        )}

        {/* Key level lines */}
        {keyLines.map(kl => {
          const x = sX(kl.k);
          return (
            <g key={kl.label}>
              <line x1={x} y1={MT} x2={x} y2={MT + plotH}
                stroke={kl.color} strokeWidth={kl.w}
                strokeDasharray={kl.dash === "none" ? undefined : kl.dash}
                opacity={0.95} />
              <text x={x} y={MT - 6} textAnchor="middle"
                fill={kl.color} fontSize={8.5} fontFamily={FONT} fontWeight={700}>{kl.label}</text>
            </g>
          );
        })}

        {/* X axis */}
        {xTicks.map((k, i) => (
          <text key={i} x={sX(k)} y={MT + plotH + 14}
            textAnchor="middle" fill={C.muted} fontSize={8} fontFamily={FONT}>
            ${k.toFixed(0)}
          </text>
        ))}
        <text x={ML + plotW / 2} y={VH - 4}
          textAnchor="middle" fill={C.muted} fontSize={8} fontFamily={FONT}>Strike Price</text>

        {/* Heatmap border */}
        <rect x={ML} y={MT} width={plotW} height={plotH}
          fill="none" stroke={C.border} strokeWidth={1} />

        {/* ════════════════════════════════════════════════════════════ */}
        {/* COLOR SCALE BAR (right)                                      */}
        {/* ════════════════════════════════════════════════════════════ */}
        {Array.from({ length: SCALE_STEPS }, (_, i) => {
          const t = 1 - i / SCALE_STEPS;
          const y = MT + (i / SCALE_STEPS) * plotH;
          return (
            <rect key={i} x={VW - MR + 12} y={y}
              width={14} height={plotH / SCALE_STEPS + 0.5}
              fill={heatColor(t)} />
          );
        })}
        <text x={VW - MR + 19} y={MT - 4} textAnchor="middle"
          fill="#ff9900" fontSize={7.5} fontFamily={FONT} fontWeight={700}>HI</text>
        <text x={VW - MR + 19} y={MT + plotH + 11} textAnchor="middle"
          fill={C.muted} fontSize={7.5} fontFamily={FONT}>LO</text>
        <text x={VW - MR + 19} y={MT + plotH / 2}
          transform={`rotate(90,${VW-MR+19},${MT+plotH/2})`}
          textAnchor="middle" fill={C.muted} fontSize={7} fontFamily={FONT}>P(S_T=K)</text>

        {/* Legend sigma lines */}
        <line x1={VW-MR+30} y1={MT+12} x2={VW-MR+52} y2={MT+12}
          stroke="#fff" strokeWidth={1.6} opacity={0.9} />
        <text x={VW-MR+54} y={MT+12} dominantBaseline="middle"
          fill={C.muted} fontSize={7.5} fontFamily={FONT}>±1σ</text>
        <line x1={VW-MR+30} y1={MT+24} x2={VW-MR+52} y2={MT+24}
          stroke="#fff" strokeWidth={1} strokeDasharray="3 5" opacity={0.5} />
        <text x={VW-MR+54} y={MT+24} dominantBaseline="middle"
          fill={C.muted} fontSize={7.5} fontFamily={FONT}>±2σ</text>
      </svg>

      {/* ── GEX bar floating tooltip ── */}
      {hoverGex && hoverGexDTE && (
        <div style={{
          position: "fixed",
          left: mousePos.x + 14,
          top: mousePos.y - 8,
          background: "#04040e",
          border: `1px solid ${hoverGexDTE.norm >= 0 ? "#e91e8c" : "#7c3aed"}`,
          borderRadius: 5,
          padding: "10px 14px",
          fontFamily: FONT,
          pointerEvents: "none",
          zIndex: 9999,
          minWidth: 185,
          boxShadow: `0 0 20px ${hoverGexDTE.norm >= 0 ? "#e91e8c" : "#7c3aed"}44`,
        }}>
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 9, height: 9, borderRadius: 2,
              background: hoverGexDTE.norm >= 0 ? "#e91e8c" : "#7c3aed",
              boxShadow: `0 0 6px ${hoverGexDTE.norm >= 0 ? "#e91e8c" : "#7c3aed"}` }} />
            <span style={{ color: hoverGexDTE.norm >= 0 ? "#e91e8c" : "#a78bfa",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>
              GEX × DTE
            </span>
          </div>
          <div style={{ height: 1, background: "#1e1e1e", marginBottom: 8 }} />
          {[
            { l: "DTE",          v: `${dtes[hoverGex.ri]} días`,                                c: "#06b6d4" },
            { l: "Net GEX",      v: `${hoverGexDTE.gexM >= 0 ? "+" : ""}${hoverGexDTE.gexM.toFixed(2)}M`, c: hoverGexDTE.norm >= 0 ? "#e91e8c" : "#7c3aed" },
            { l: "Dirección",    v: hoverGexDTE.norm >= 0 ? "CALLS DOMINAN" : "PUTS DOMINAN",  c: hoverGexDTE.norm >= 0 ? "#e91e8c" : "#7c3aed" },
            { l: "Intensidad",   v: `${(Math.abs(hoverGexDTE.norm) * 100).toFixed(1)}%`,        c: "#ffd000" },
            { l: "Régimen",      v: hoverGexDTE.norm >= 0 ? "Pinning (Long γ)" : "Trending (Short γ)", c: hoverGexDTE.norm >= 0 ? "#00ff88" : "#ff3355" },
          ].map(r => (
            <div key={r.l} className="flex justify-between items-center py-[2px]">
              <span style={{ color: "#555", fontSize: 9 }}>{r.l}</span>
              <span style={{ color: r.c, fontSize: 10, fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, height: 4, background: "#111", borderRadius: 2 }}>
            <div style={{
              width: `${Math.abs(hoverGexDTE.norm) * 100}%`, height: "100%", borderRadius: 2,
              background: hoverGexDTE.norm >= 0 ? "#e91e8c" : "#7c3aed",
            }} />
          </div>
        </div>
      )}

      {/* ── Heatmap floating tooltip ── */}
      {hover && hoverMeta && (
        <div style={{
          position: "fixed",
          left: mousePos.x + 16,
          top: mousePos.y - 10,
          background: "#050508",
          border: `1px solid ${hoverColor}`,
          borderRadius: 5,
          padding: "10px 14px",
          fontFamily: FONT,
          pointerEvents: "none",
          zIndex: 9999,
          minWidth: 195,
          boxShadow: `0 0 18px ${hoverColor}44`,
        }}>
          <div className="flex items-center gap-2 mb-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 2,
              background: hoverColor, boxShadow: `0 0 6px ${hoverColor}` }} />
            <span style={{ color: hoverMeta.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>
              {hoverMeta.label}
            </span>
          </div>
          <div style={{ height: 1, background: `${hoverColor}40`, marginBottom: 8 }} />
          {[
            { l: "Strike",      v: `$${hover.K.toFixed(2)}`,                               c: "#e5e7eb" },
            { l: "DTE",         v: `${hover.dte} días`,                                     c: C.cyan   },
            { l: "T (años)",    v: hover.T.toFixed(4),                                      c: C.muted  },
            { l: "P. relativa", v: `${(hover.norm * 100).toFixed(2)}%`,                     c: hoverColor },
            { l: "PDF raw",     v: hover.pdf.toExponential(3),                              c: C.muted  },
            { l: "Dist. spot",  v: `${(((hover.K - spot)/spot)*100).toFixed(2)}%`,          c: hover.K >= spot ? C.green : C.red },
          ].map(r => (
            <div key={r.l} className="flex justify-between text-[10px] py-0.5">
              <span style={{ color: C.muted }}>{r.l}</span>
              <span style={{ color: r.c, fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: C.border }}>
            <div style={{ width: `${hover.norm * 100}%`, height: "100%", borderRadius: 2,
              background: hoverColor, boxShadow: `0 0 4px ${hoverColor}` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── DOOD vs Total Return data ─────────────────────────────────────────────────
interface DoodPoint {
  x: number; y: number; strike: number; dte: number;
  iv: number; delta: number; gamma: number; theta: number;
  pProfit: number; breakeven: number;
}
interface DoodBooks { longPut: DoodPoint[]; shortPut: DoodPoint[]; longCall: DoodPoint[]; shortCall: DoodPoint[] }

// Percentile clip to remove outliers
function clipPct(pts: DoodPoint[], lo = 0.02, hi = 0.98): DoodPoint[] {
  if (pts.length < 8) return pts;
  const sy = [...pts].sort((a, b) => a.y - b.y);
  const sx = [...pts].sort((a, b) => a.x - b.x);
  const yLo = sy[Math.floor(pts.length * lo)].y;
  const yHi = sy[Math.floor(pts.length * hi)].y;
  const xLo = sx[Math.floor(pts.length * lo)].x;
  const xHi = sx[Math.floor(pts.length * hi)].x;
  return pts.filter(p => p.x >= xLo && p.x <= xHi && p.y >= yLo && p.y <= yHi);
}

function computeDoodData(spot: number, iv: number, contracts: OptionContract[]): DoodBooks {
  const r = 0.05;
  const dailyStd  = iv / Math.sqrt(252);   // daily vol fraction
  const dailyMove = spot * dailyStd;        // $ daily move 1σ

  // ── Phase 1: compute greeks for all valid contracts ──────────────────
  const rawPuts:  { c: OptionContract; g: ReturnType<typeof bsGreeks>; sigma: number }[] = [];
  const rawCalls: { c: OptionContract; g: ReturnType<typeof bsGreeks>; sigma: number }[] = [];

  for (const c of contracts) {
    if (c.oi < 10) continue;
    const T     = Math.max(c.expiry, 1) / 365;
    const sigma = c.iv || iv;
    const g     = bsGreeks(spot, c.strike, T, r, sigma, c.type);
    if (c.type === "put") rawPuts.push({ c, g, sigma });
    else                  rawCalls.push({ c, g, sigma });
  }

  // ── Phase 2: normalizers for DOOD (dollar-delta / total dollar-delta) ─
  const totPut  = rawPuts.reduce((a, {c,g}) => a + Math.abs(g.delta) * c.oi * spot, 0) || 1;
  const totCall = rawCalls.reduce((a, {c,g}) => a + Math.abs(g.delta) * c.oi * spot, 0) || 1;

  // ── Phase 3: build points ─────────────────────────────────────────────
  function toPoint(
    { c, g, sigma }: { c: OptionContract; g: ReturnType<typeof bsGreeks>; sigma: number },
    normDenom: number,
  ): DoodPoint {
    const T = Math.max(c.expiry, 1) / 365;

    // DOOD = (delta × OI × spot) / total_dollar_delta  → small, like image
    const dood = (g.delta * c.oi * spot) / normDenom;

    // Bachelier-adjusted fair value (avoids extreme values for deep OTM)
    const sqrtT  = Math.sqrt(T);
    const money  = Math.log(spot / c.strike) / (sigma * sqrtT + 1e-9);
    const bachFV = spot * sigma * sqrtT * 0.3989 * Math.exp(-0.5 * money * money);
    const fv     = Math.max(bachFV, spot * 0.0015);  // floor at 0.15% of spot

    // Daily P&L components
    const gammaPnl = 0.5 * g.gamma * dailyMove * dailyMove;
    const thetaPnl = g.theta;                          // daily theta (negative for long)
    const totalReturn = Math.max(-0.12, Math.min(0.12, (gammaPnl + thetaPnl) / fv));

    // Breakeven daily move → probability profitable (long position)
    const breakeven = g.gamma > 1e-9
      ? Math.sqrt(2 * Math.abs(thetaPnl) / g.gamma)
      : dailyMove * 3;
    const zBreak  = dailyStd > 0 ? (breakeven / spot) / dailyStd : 3;
    const pProfit = Math.max(0, Math.min(1, 2 * (1 - Φ(zBreak))));

    return {
      x: dood, y: totalReturn,
      strike: c.strike, dte: c.expiry, iv: sigma,
      delta: g.delta, gamma: g.gamma, theta: g.theta,
      pProfit, breakeven,
    };
  }

  const longPut   = clipPct(rawPuts.map(r  => toPoint(r,  totPut)));
  const shortPut  = clipPct(rawPuts.map(r  => ({ ...toPoint(r, totPut),  x: -toPoint(r,totPut).x,  y: -toPoint(r,totPut).y,  delta: -r.g.delta, pProfit: 1 - toPoint(r,totPut).pProfit  })));
  const longCall  = clipPct(rawCalls.map(r => toPoint(r,  totCall)));
  const shortCall = clipPct(rawCalls.map(r => ({ ...toPoint(r, totCall), x: -toPoint(r,totCall).x, y: -toPoint(r,totCall).y, delta: -r.g.delta, pProfit: 1 - toPoint(r,totCall).pProfit })));

  return { longPut, shortPut, longCall, shortCall };
}

// ── Single book scatter panel (professional) ──────────────────────────────────
function BookScatterPanel({ title, data, color, nRaw }: { title: string; data: DoodPoint[]; color: string; nRaw: number }) {
  // Axis domain with padding
  const xs   = data.map(d => d.x);
  const ys   = data.map(d => d.y);
  const xMin = Math.min(...xs, 0), xMax = Math.max(...xs, 0);
  const yMin = Math.min(...ys, -0.005), yMax = Math.max(...ys, 0.005);
  const xPad = Math.max((xMax - xMin) * 0.10, 1e-5);
  const yPad = Math.max((yMax - yMin) * 0.14, 0.002);
  const xDom: [number, number] = [xMin - xPad, xMax + xPad];
  const yDom: [number, number] = [yMin - yPad, yMax + yPad];

  // Regression line for trend
  const reg = linReg(data.map(d => ({ x: d.x, y: d.y })));
  const regLine = [
    { rx: xDom[0], ry: reg.slope * xDom[0] + reg.intercept },
    { rx: xDom[1], ry: reg.slope * xDom[1] + reg.intercept },
  ];

  // Adaptive tick formatter for DOOD
  const xFmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs === 0) return "0";
    if (abs < 0.001) return v.toExponential(1);
    if (abs < 0.01)  return v.toFixed(4);
    return v.toFixed(3);
  };

  // Profit stats
  const nProfit = data.filter(d => d.y > 0).length;
  const pctProfit = data.length ? (nProfit / data.length * 100).toFixed(0) : "0";
  const avgPProfit = data.length ? data.reduce((a,d) => a + d.pProfit, 0) / data.length * 100 : 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    // Find DoodPoint from the scatter payload
    const d: DoodPoint = payload.find((p: any) => p.name === "scatter")?.payload ?? payload[0].payload;
    if (!d?.strike) return null;
    const profitable = d.y > 0;
    return (
      <div style={{
        background: "#020204",
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "10px 14px",
        fontFamily: FONT,
        minWidth: 210,
        boxShadow: `0 4px 24px ${color}55`,
        pointerEvents: "none",
        zIndex: 9999,
      }}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
          <span style={{ color, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em" }}>
            {title.toUpperCase()}
          </span>
        </div>
        <div style={{ height: 1, background: `${color}35`, marginBottom: 8 }} />

        {[
          { l: "Strike",       v: `$${d.strike}`,                          c: "#e5e7eb" },
          { l: "DTE",          v: `${d.dte}d`,                             c: "#06b6d4" },
          { l: "IV",           v: `${(d.iv * 100).toFixed(1)}%`,           c: "#ffd000" },
          { l: "DOOD",         v: d.x.toExponential(3),                    c: color },
          { l: "Delta",        v: d.delta.toFixed(4),                      c: d.delta >= 0 ? "#00ff88" : "#ff3355" },
          { l: "Gamma",        v: d.gamma.toExponential(3),                c: "#a78bfa" },
          { l: "Theta/día",    v: `$${d.theta.toFixed(4)}`,                c: "#ff9900" },
          { l: "Total Return", v: `${(d.y * 100).toFixed(3)}%`,            c: profitable ? "#00ff88" : "#ff3355" },
          { l: "P(Ganancia)",  v: `${(d.pProfit * 100).toFixed(1)}%`,      c: d.pProfit >= 0.5 ? "#00ff88" : "#ff3355" },
          { l: "Breakeven",    v: `±$${d.breakeven.toFixed(2)}`,           c: "#444" },
        ].map(row => (
          <div key={row.l} className="flex justify-between items-center py-[2px]">
            <span style={{ color: "#555", fontSize: 9, letterSpacing: "0.08em" }} className="uppercase">{row.l}</span>
            <span style={{ color: row.c, fontSize: 10, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.v}</span>
          </div>
        ))}

        {/* P(Ganancia) gauge */}
        <div style={{ marginTop: 8 }}>
          <div className="flex justify-between mb-1">
            <span style={{ color: "#444", fontSize: 8, letterSpacing: "0.12em" }}>P(GANANCIA) GAMMA/THETA</span>
            <span style={{ color: d.pProfit >= 0.5 ? "#00ff88" : "#ff3355", fontSize: 8, fontWeight: 700 }}>
              {(d.pProfit * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
            <div style={{
              width: `${d.pProfit * 100}%`, height: "100%", borderRadius: 2,
              background: d.pProfit >= 0.5 ? "#00ff88" : "#ff3355",
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: "#080810",
      border: `1px solid ${C.border}`,
      borderRadius: 5,
      overflow: "hidden",
    }}>
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}` }} />
        <span style={{ color: "#ccc", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em" }} className="uppercase">
          {title}
        </span>
        <span style={{ color: C.dim, fontSize: 8 }}>n={data.length}</span>
        <div className="ml-auto flex gap-2 items-center">
          <span style={{ color: C.dim, fontSize: 8 }}>R²={reg.r2.toFixed(3)}</span>
          <span style={{ color: Number(pctProfit) >= 50 ? "#00ff88" : "#ff3355", fontSize: 8, fontWeight: 700 }}>
            {pctProfit}% positivo
          </span>
          <span style={{ color: color, fontSize: 8 }}>
            P̄={avgPProfit.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 10, left: 2, bottom: 28 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 6" strokeOpacity={0.6} />

            <XAxis
              type="number" dataKey="x" name="DOOD"
              domain={xDom}
              stroke={C.dim} fontSize={8} tick={{ fontFamily: FONT, fill: C.muted }}
              tickLine={false} axisLine={{ stroke: C.dim }}
              tickFormatter={xFmt}
              tickCount={5}
              label={{ value: "DOOD", position: "insideBottom", offset: -12,
                fill: C.muted, fontSize: 8, fontFamily: FONT }}
            />
            <YAxis
              type="number" dataKey="y" name="Return"
              domain={yDom}
              stroke={C.dim} fontSize={8} tick={{ fontFamily: FONT, fill: C.muted }}
              tickLine={false} axisLine={{ stroke: C.dim }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              tickCount={5}
              width={46}
              label={{ value: "Total Return", angle: -90, position: "insideLeft", offset: 14,
                fill: C.muted, fontSize: 8, fontFamily: FONT }}
            />

            {/* Zero crosshairs */}
            <ReferenceLine x={0} stroke={`${color}50`} strokeWidth={1} />
            <ReferenceLine y={0} stroke={`${color}50`} strokeWidth={1} />

            {/* Regression line */}
            <Line
              data={regLine} dataKey="ry" name="trend"
              type="linear" dot={false}
              stroke={color} strokeWidth={1.5}
              strokeDasharray="6 4" strokeOpacity={0.7}
              legendType="none"
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 3", strokeOpacity: 0.45 }}
            />

            {/* Scatter points */}
            <Scatter
              name="scatter"
              data={data}
              fill={color}
              fillOpacity={0.55}
              r={3}
              line={false}
              shape={(props: any) => {
                const { cx, cy } = props;
                return (
                  <circle
                    cx={cx} cy={cy} r={3}
                    fill={color} fillOpacity={0.55}
                    stroke={color} strokeWidth={0.4} strokeOpacity={0.8}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 4-panel DOOD Return Chart ─────────────────────────────────────────────────
function DoodReturnChart({ spot, iv, contracts }: { spot: number; iv: number; contracts: OptionContract[] }) {
  const books = useMemo(() => computeDoodData(spot, iv, contracts), [spot, iv, contracts]);
  const totalPoints = books.longPut.length + books.shortPut.length + books.longCall.length + books.shortCall.length;

  // Aggregate probability summary
  const avgProfit = (arr: DoodPoint[]) =>
    arr.length ? arr.reduce((a, d) => a + d.pProfit, 0) / arr.length * 100 : 0;

  const summaryRows = [
    { label: "Long Put",   pct: avgProfit(books.longPut),   color: "#3b82f6" },
    { label: "Short Put",  pct: avgProfit(books.shortPut),  color: "#f97316" },
    { label: "Short Call", pct: avgProfit(books.shortCall), color: "#a855f7" },
    { label: "Long Call",  pct: avgProfit(books.longCall),  color: "#22c55e" },
  ];

  return (
    <div style={{ background: "#030306", border: `1px solid ${C.border}`, borderRadius: 6 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: C.muted, fontSize: 9, letterSpacing: "0.2em" }} className="uppercase font-bold">
          DOOD vs Total Return · 4 Libros de Opciones
        </span>
        <span style={{ color: C.dim, fontSize: 8 }}>
          n={totalPoints} contratos · pasa el mouse sobre un punto
        </span>
        {/* Probability summary pills */}
        <div className="ml-auto flex gap-2">
          {summaryRows.map(r => (
            <div key={r.label} className="flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{ background: `${r.color}12`, border: `1px solid ${r.color}40` }}>
              <span style={{ color: r.color, fontSize: 8, fontWeight: 700 }}>{r.label}</span>
              <span style={{ color: r.color, fontSize: 8 }}>{r.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2×2 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, padding: 8 }}>
        <BookScatterPanel title="Long Put book"   data={books.longPut}   color="#3b82f6" nRaw={books.longPut.length} />
        <BookScatterPanel title="Short Put book"  data={books.shortPut}  color="#f97316" nRaw={books.shortPut.length} />
        <BookScatterPanel title="Short Call book" data={books.shortCall} color="#a855f7" nRaw={books.shortCall.length} />
        <BookScatterPanel title="Long Call book"  data={books.longCall}  color="#22c55e" nRaw={books.longCall.length} />
      </div>

      {/* Bottom note */}
      <div className="px-3 pb-2 flex gap-4 flex-wrap">
        <span style={{ color: C.dim, fontSize: 8 }}>
          DOOD = Delta × OI × 100 / (Spot × 5000) · Return = (Gamma P&L + Theta) / Fair Value
        </span>
        <span style={{ color: C.dim, fontSize: 8 }}>
          P(Ganancia) = P(|ΔS| &gt; √(2|θ|/γ)) bajo distribución normal diaria
        </span>
      </div>
    </div>
  );
}

// ── Tab: REGIME CLUSTER ──────────────────────────────────────────────────────
function RegimeTab({ data, ticker, contracts }: {
  data: ReturnType<typeof useGammaProbabilities>;
  ticker: DemoTicker;
  contracts: OptionContract[];
}) {
  const { scatterData, regPos, regNeg, corrPos, corrNeg, levels, spot } = data;

  const xMin = Math.min(...scatterData.map(d=>d.distPct), -15);
  const xMax = Math.max(...scatterData.map(d=>d.distPct), 15);
  const yMin = Math.min(...scatterData.map(d=>d.gex));
  const yMax = Math.max(...scatterData.map(d=>d.gex));

  // Regression line points
  const regPosLine = [
    { distPct: xMin, gex: regPos.slope*xMin + regPos.intercept },
    { distPct: xMax, gex: regPos.slope*xMax + regPos.intercept },
  ];
  const regNegLine = [
    { distPct: xMin, gex: regNeg.slope*xMin + regNeg.intercept },
    { distPct: xMax, gex: regNeg.slope*xMax + regNeg.intercept },
  ];

  const posCount = scatterData.filter(d=>d.positive).length;
  const negCount = scatterData.filter(d=>!d.positive).length;
  const total = scatterData.length || 1;

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">
      {/* Regime stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Zona Positiva",   value: `${((posCount/total)*100).toFixed(0)}%`,  color: C.green },
          { label: "Zona Negativa",   value: `${((negCount/total)*100).toFixed(0)}%`,  color: C.red },
          { label: "R² Calls",        value: corrPos.toFixed(3),                       color: C.cyan },
          { label: "R² Puts",         value: corrNeg.toFixed(3),                       color: C.orange },
        ].map(r => (
          <div key={r.label} className="rounded p-2 text-center" style={{ background:C.card, border:`1px solid ${C.border}` }}>
            <div style={{ color:C.muted, fontSize:8, letterSpacing:"0.12em" }} className="uppercase">{r.label}</div>
            <div style={{ color:r.color, fontSize:16, fontWeight:700 }}>{r.value}</div>
          </div>
        ))}
      </div>

      {/* Scatter chart */}
      <div style={{ height: 310, flexShrink: 0 }}>
        <div style={{ color:C.muted, fontSize:9, letterSpacing:"0.15em", marginBottom:4 }} className="uppercase font-bold">
          GEX por Strike · Distancia desde Spot vs Exposición Neta
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top:8, right:24, left:8, bottom:30 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="distPct" domain={[xMin, xMax]}
              stroke={C.muted} fontSize={9} tick={{ fontFamily:FONT }}
              tickFormatter={v => `${Number(v).toFixed(1)}%`}
              label={{ value:"Distancia desde Spot (%)", position:"insideBottom", offset:-15, fill:C.muted, fontSize:9, fontFamily:FONT }}
            />
            <YAxis type="number" dataKey="gex" domain={[yMin*1.1, yMax*1.1]}
              stroke={C.muted} fontSize={9} tick={{ fontFamily:FONT }}
              tickFormatter={v => `${Number(v).toFixed(0)}M`}
              label={{ value:"Net GEX ($M)", angle:-90, position:"insideLeft", offset:10, fill:C.muted, fontSize:9, fontFamily:FONT }}
            />
            <Tooltip content={<ScatterTip />} />

            {/* Zero line */}
            <ReferenceLine y={0} stroke={C.border} strokeWidth={1} />
            {/* Spot line */}
            <ReferenceLine x={0} stroke={C.yellow} strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value:"SPOT", position:"top", fill:C.yellow, fontSize:8, fontFamily:FONT }} />
            {/* Call Wall */}
            <ReferenceLine x={((levels.callWall-spot)/spot)*100} stroke={C.green}
              strokeDasharray="6 3" strokeWidth={1}
              label={{ value:"CW", position:"top", fill:C.green, fontSize:8, fontFamily:FONT }} />
            {/* Put Wall */}
            <ReferenceLine x={((levels.putWall-spot)/spot)*100} stroke={C.red}
              strokeDasharray="6 3" strokeWidth={1}
              label={{ value:"PW", position:"top", fill:C.red, fontSize:8, fontFamily:FONT }} />
            {/* Max Pain */}
            <ReferenceLine x={((levels.maxPain-spot)/spot)*100} stroke={C.purple}
              strokeDasharray="4 2" strokeWidth={1}
              label={{ value:"MP", position:"top", fill:C.purple, fontSize:8, fontFamily:FONT }} />

            {/* Scatter: positive zone */}
            <Scatter
              name="GEX Positivo"
              data={scatterData.filter(d=>d.positive)}
              fill={C.green} fillOpacity={0.7} r={4}
            />
            {/* Scatter: negative zone */}
            <Scatter
              name="GEX Negativo"
              data={scatterData.filter(d=>!d.positive)}
              fill={C.red} fillOpacity={0.7} r={4}
            />

            {/* Regression lines */}
            <Line
              data={regPosLine} dataKey="gex" type="linear"
              stroke={C.green} strokeWidth={2} dot={false}
              strokeDasharray="8 4" name={`R² = ${corrPos.toFixed(3)}`}
            />
            <Line
              data={regNegLine} dataKey="gex" type="linear"
              stroke={C.red} strokeWidth={2} dot={false}
              strokeDasharray="8 4" name={`R² = ${corrNeg.toFixed(3)}`}
            />

            <Legend
              wrapperStyle={{ fontFamily:FONT, fontSize:10 }}
              formatter={(v) => <span style={{ color:C.muted }}>{v}</span>}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Probability Heatmap ── */}
      <GammaProbHeatmap
        spot={ticker.spot}
        iv={ticker.baseIV}
        contracts={contracts}
        levels={data.levels}
      />

      {/* ── DOOD vs Return 4-panel ── */}
      <DoodReturnChart
        spot={ticker.spot}
        iv={ticker.baseIV}
        contracts={contracts}
      />

      {/* Regime interpretation */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded p-2.5" style={{ background:C.card, border:`1px solid ${C.green}30` }}>
          <div style={{ color:C.green, fontSize:9, fontWeight:700, letterSpacing:"0.15em" }} className="uppercase mb-1">Zona Positiva (Pinning)</div>
          <div style={{ color:C.muted, fontSize:9 }}>
            Los dealers tienen gamma larga → venden en alzas, compran en bajas → acción de precio contenida
          </div>
        </div>
        <div className="rounded p-2.5" style={{ background:C.card, border:`1px solid ${C.red}30` }}>
          <div style={{ color:C.red, fontSize:9, fontWeight:700, letterSpacing:"0.15em" }} className="uppercase mb-1">Zona Negativa (Trending)</div>
          <div style={{ color:C.muted, fontSize:9 }}>
            Los dealers tienen gamma corta → compran en alzas, venden en bajas → efecto amplificador de movimiento
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Workspace ────────────────────────────────────────────────────────────
export function ProbabilityWorkspace({ ticker, contracts }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const data = useGammaProbabilities(ticker, contracts);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden"
      style={{ background:C.bg, border:`1px solid ${C.border}`, fontFamily:FONT }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 flex-wrap"
        style={{ borderBottom:`1px solid ${C.border}`, background:C.panel }}>
        <span style={{ color:C.muted, fontSize:10, letterSpacing:"0.2em" }} className="uppercase font-bold">
          Gamma Probability · {ticker.symbol}
        </span>

        {/* Tabs */}
        <div className="flex rounded overflow-hidden" style={{ border:`1px solid ${C.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-1 text-[10px] font-bold tracking-wider transition-colors"
              style={{
                background: tab===t.id ? data.regimeColor : "transparent",
                color:      tab===t.id ? "#000"           : C.muted,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Composite score badge */}
        <div className="ml-auto flex items-center gap-2 px-3 py-1 rounded"
          style={{ background:`${data.regimeColor}15`, border:`1px solid ${data.regimeColor}50` }}>
          <span style={{ color:data.regimeColor, fontSize:9, letterSpacing:"0.15em" }} className="uppercase font-bold">
            Score
          </span>
          <span style={{ color:data.regimeColor, fontSize:13, fontWeight:900 }}>
            {data.compositeScore.toFixed(0)}
          </span>
          <span style={{ color:C.muted, fontSize:9 }}>· {data.regimeLabel}</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "overview"      && <OverviewTab      data={data} ticker={ticker} />}
        {tab === "distribution"  && <DistributionTab  data={data} ticker={ticker} />}
        {tab === "radar"         && <RadarTab         data={data} />}
        {tab === "regime"        && <RegimeTab        data={data} ticker={ticker} contracts={contracts} />}
      </div>
    </div>
  );
}

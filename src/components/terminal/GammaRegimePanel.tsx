import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, ReferenceLine, Cell, AreaChart, Area,
} from "recharts";
import Plotly from "plotly.js/dist/plotly";
import type { ExposurePoint, KeyLevels, DemoTicker, OptionContract } from "@/lib/gex";
import { formatNumber, bsGreeks } from "@/lib/gex";
import { ArrowDown, ArrowUp, Minus, TrendingUp, TrendingDown } from "lucide-react";

function randn(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ── Design tokens ──────────────────────────────────────────────── */
const C = {
  bg0:    "#020c18",
  bg1:    "#040f1c",
  bg2:    "#071525",
  bg3:    "#0a1c2e",
  border: "#0f1e30",
  border2:"#1a3040",
  muted:  "#2a4060",
  dim:    "#3a5878",
  text:   "#6a8aa8",
  label:  "#8a9ab0",
  bright: "#c8d8e8",
  white:  "#e5edf5",
  call:   "#00e676",
  put:    "#ff3355",
  warn:   "#ff9500",
  gold:   "#ffcc00",
  cyan:   "#00b8d4",
  font:   "JetBrains Mono, 'Courier New', monospace",
};

const REGIME_CFG = {
  LONG:       { hex: "#00e676", label: "LONG GAMMA",       glow: "rgba(0,230,118,0.15)",   border: "rgba(0,230,118,0.25)"  },
  SOFT_LONG:  { hex: "#69f0ae", label: "SOFT LONG GAMMA",  glow: "rgba(105,240,174,0.12)", border: "rgba(105,240,174,0.2)" },
  SHORT:      { hex: "#ff3355", label: "SHORT GAMMA",       glow: "rgba(255,51,85,0.15)",   border: "rgba(255,51,85,0.25)"  },
  FLIP:       { hex: "#ffcc00", label: "FLIP ZONE",         glow: "rgba(255,204,0,0.18)",   border: "rgba(255,204,0,0.3)"   },
  TRANSITION: { hex: "#ff9500", label: "TRANSITION",        glow: "rgba(255,149,0,0.15)",   border: "rgba(255,149,0,0.25)"  },
};

type Regime = keyof typeof REGIME_CFG;

/* ── Regime classification ──────────────────────────────────────── */
interface RegimeInfo {
  key: Regime;
  subtitle: string;
  desc: string;
  playbook: { do: string[]; avoid: string[] };
}

function classifyRegime(netGex: number, spot: number, flip: number | null): RegimeInfo {
  const flipDist = flip != null ? spot - flip : Infinity;
  const absDist  = Math.abs(flipDist);
  const thresh   = Math.max(Math.abs(netGex) * 0.05, 1e6);

  if (flip != null && absDist < 1) return {
    key: "FLIP",
    subtitle: "Critical inflection · max alert",
    desc: "Spot is at the Gamma Flip Point. A move of ±$1 can switch the regime from mean-reverting to trending. Reduce size and await confirmation.",
    playbook: {
      do: ["Reduce position size immediately", "Wait for directional confirmation", "Watch volume on first break above/below"],
      avoid: ["Aggressive directional trades", "Selling premium naked", "Assuming regime continuation"],
    },
  };
  if (Math.abs(netGex) < thresh) return {
    key: "TRANSITION",
    subtitle: "Net GEX near zero · regime forming",
    desc: "Net gamma exposure is near zero. The regime is shifting — expect wider realized ranges and reduced pinning behavior around key strikes.",
    playbook: {
      do: ["Trade wider ranges", "Buy vol if IV is depressed", "Wait for clear direction before committing"],
      avoid: ["Selling ATM straddles", "Assuming pin at specific strikes"],
    },
  };
  if (netGex < 0) return {
    key: "SHORT",
    subtitle: "Dealers amplify moves · trending regime",
    desc: "Dealers are net short gamma. Every dip generates more selling, every rally more buying. Expect elevated realized volatility and momentum-driven moves.",
    playbook: {
      do: ["Trade momentum / breakouts", "Buy options (long gamma)", "Use wider stops"],
      avoid: ["Selling uncovered premium", "Fading extreme moves", "Intraday mean-reversion"],
    },
  };
  if (flip != null && flipDist > 0 && flipDist < 5) return {
    key: "SOFT_LONG",
    subtitle: "Dealers net long gamma · fragile",
    desc: `Gamma positive but fragile — flip is very close at $${flip?.toFixed(2)}. Monitor carefully if spot breaks below the flip level.`,
    playbook: {
      do: ["Mean-reversion with tight stops", "Sell premium carefully", "Monitor flip level"],
      avoid: ["Assuming strong pin", "Excess leverage"],
    },
  };
  return {
    key: "LONG",
    subtitle: "Dealers buy dips · sell rips · low vol",
    desc: "Dealers are net long gamma. They buy dips and sell rallies automatically, keeping price pinned. Expect low realized vol — ideal for selling premium.",
    playbook: {
      do: ["Sell premium (iron condors, strangles)", "Intraday mean-reversion", "Trade ranges defined by walls"],
      avoid: ["Buying expensive vol", "Trading breakouts (false breaks likely)"],
    },
  };
}

/* ── Props ──────────────────────────────────────────────────────── */
interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export function GammaRegimePanel({ ticker, exposures, levels, contracts }: Props) {
  const spot   = ticker.spot;
  const flip   = levels.gammaFlip;
  const netGex = levels.totalGex;
  const info   = classifyRegime(netGex, spot, flip);
  const rc     = REGIME_CFG[info.key];

  /* ── Derived metrics ─────────────────────────────────────────── */
  const maxAbsStrike = useMemo(() => exposures.reduce((m, p) => Math.max(m, Math.abs(p.netGex)), 1), [exposures]);

  const gpi = useMemo(() => {
    const norm = netGex / (maxAbsStrike * 5);
    return Math.max(0, Math.min(100, 50 + Math.tanh(norm) * 50));
  }, [netGex, maxAbsStrike]);

  const flipDistance = flip != null ? spot - flip : null;

  const { atmIv, netDex, totalCallOI, totalPutOI, callBias, netVanna, netCharm } = useMemo(() => {
    const atm = contracts.filter(c => Math.abs(c.strike - spot) < ticker.strikeStep * 1.5);
    const iv  = atm.length ? (atm.reduce((s, c) => s + c.iv, 0) / atm.length) * 100 : ticker.baseIV * 100;
    const dex = exposures.reduce((s, p) => s + p.dex, 0);
    const cOI = contracts.filter(c => c.type === "call").reduce((s, c) => s + c.oi, 0);
    const pOI = contracts.filter(c => c.type === "put").reduce((s, c) => s + c.oi, 0);
    const bias = (cOI - pOI) / Math.max(cOI + pOI, 1);
    let vanna = 0, charm = 0;
    for (const c of contracts) {
      if (!c.iv || c.iv <= 0 || !c.oi) continue;
      const T = Math.max((c as any).expiry ?? 30, 1) / 365;
      const g = bsGreeks(spot, c.strike, T, 0.05, c.iv, c.type);
      const N = c.oi * 100;
      const sign = c.type === "call" ? 1 : -1;
      vanna += g.vanna * N * sign;
      charm += (g as any).charm * N * sign;
    }
    return { atmIv: iv, netDex: dex, totalCallOI: cOI, totalPutOI: pOI, callBias: bias, netVanna: vanna, netCharm: charm };
  }, [contracts, exposures, spot, ticker]);

  const pcRatio = totalPutOI / Math.max(totalCallOI, 1);

  const regimeStrength = Math.round(Math.abs(gpi - 50) * 2);

  /* ── GEX profile ±6% ─────────────────────────────────────────── */
  const lo = spot * 0.94, hi = spot * 1.06;
  const profileCum = useMemo(() => {
    let acc = 0;
    return exposures
      .filter(p => p.strike >= lo && p.strike <= hi)
      .sort((a, b) => a.strike - b.strike)
      .map(p => { acc += p.netGex; return { strike: p.strike, netGex: p.netGex, cum: acc }; });
  }, [exposures, lo, hi]);

  /* ── GPI history ─────────────────────────────────────────────── */
  const [gpiHist, setGpiHist] = useState<{ t: string; gpi: number }[]>([]);
  const lastTick = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastTick.current < 4000) return;
    lastTick.current = now;
    const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setGpiHist(h => [...h.slice(-39), { t, gpi: Math.round(gpi * 10) / 10 }]);
  }, [gpi]);

  /* ── Strike magnetism ────────────────────────────────────────── */
  const magnets = useMemo(() => {
    const profile = exposures.filter(p => p.strike >= lo && p.strike <= hi);
    return [...profile]
      .map(p => ({
        strike: p.strike,
        gex: p.netGex,
        dist: Math.abs(p.strike - spot),
        mag: Math.abs(p.netGex) / Math.max(Math.abs(p.strike - spot), 0.5),
      }))
      .sort((a, b) => b.mag - a.mag)
      .slice(0, 7);
  }, [exposures, lo, hi, spot]);
  const maxMag = magnets[0]?.mag ?? 1;

  /* ── Stability ───────────────────────────────────────────────── */
  const stability = useMemo(() => {
    const near = exposures.filter(p => Math.abs(p.strike - spot) <= spot * 0.02);
    if (near.length < 2) return { score: 50, label: "NO DATA" };
    const pos = near.filter(p => p.netGex > 0).length;
    const neg = near.filter(p => p.netGex < 0).length;
    const dom = Math.abs(pos - neg) / near.length;
    const score = Math.round(dom * 100);
    return { score, label: score > 70 ? "ROCK SOLID" : score > 40 ? "MODERATE" : "FRAGILE" };
  }, [exposures, spot]);

  /* ── Monte Carlo ──────────────────────────────────────────────── */
  const mcRef = useRef<HTMLDivElement>(null);

  const mcData = useMemo(() => {
    const N_PATHS = 250;
    const N_DAYS  = 90;
    const dt      = 1 / 252;
    const volMult: Record<Regime, number> = { LONG: 0.72, SOFT_LONG: 0.85, SHORT: 1.40, FLIP: 1.25, TRANSITION: 1.10 };
    const sigma   = (atmIv / 100) * volMult[info.key];

    const paths: number[][] = [];
    for (let p = 0; p < N_PATHS; p++) {
      const path = [spot];
      for (let d = 1; d <= N_DAYS; d++) {
        const prev = path[d - 1];
        path.push(prev * Math.exp((-0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * randn()));
      }
      paths.push(path);
    }

    const days = Array.from({ length: N_DAYS + 1 }, (_, i) => i);
    const p5: number[] = [], p25: number[] = [], p50: number[] = [], p75: number[] = [], p95: number[] = [];

    for (let d = 0; d <= N_DAYS; d++) {
      const vals = paths.map(ph => ph[d]).sort((a, b) => a - b);
      const pct  = (q: number) => {
        const idx = (q / 100) * (N_PATHS - 1);
        const lo  = Math.floor(idx), hi = Math.ceil(idx);
        return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
      };
      p5.push(pct(5));
      p25.push(pct(25));
      p50.push(pct(50));
      p75.push(pct(75));
      p95.push(pct(95));
    }

    return { days, p5, p25, p50, p75, p95 };
  }, [spot, atmIv, info.key]);

  useEffect(() => {
    const div = mcRef.current;
    if (!div) return;
    const { days, p5, p25, p50, p75, p95 } = mcData;
    const isGreen   = info.key === "LONG" || info.key === "SOFT_LONG";
    const isRed     = info.key === "SHORT";
    const bandOuter = isGreen ? "rgba(0,230,118,0.07)"  : isRed ? "rgba(255,51,85,0.07)"  : "rgba(255,149,0,0.07)";
    const bandInner = isGreen ? "rgba(0,230,118,0.16)"  : isRed ? "rgba(255,51,85,0.16)"  : "rgba(255,149,0,0.16)";

    const traces: any[] = [
      { x: days, y: p5,  mode: "lines", line: { color: "transparent", width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: days, y: p95, mode: "lines", line: { color: rc.hex, width: 0.4, dash: "dot" },
        fill: "tonexty", fillcolor: bandOuter, showlegend: false, hoverinfo: "skip" },
      { x: days, y: p25, mode: "lines", line: { color: "transparent", width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: days, y: p75, mode: "lines", line: { color: rc.hex, width: 0.4 },
        fill: "tonexty", fillcolor: bandInner, showlegend: false, hoverinfo: "skip" },
      { x: days, y: p50, mode: "lines", line: { color: rc.hex, width: 2 },
        name: "Median", hovertemplate: "Day %{x}<br>$%{y:.2f}<extra></extra>" },
      { x: [0, 90], y: [spot, spot], mode: "lines",
        line: { color: "#374151", width: 1, dash: "dot" }, showlegend: false, hoverinfo: "skip" },
    ];

    const layout: any = {
      autosize: true,
      paper_bgcolor: C.bg1,
      plot_bgcolor:  C.bg1,
      font: { family: C.font, size: 9, color: C.dim },
      margin: { l: 54, r: 14, t: 10, b: 32 },
      xaxis: {
        title: { text: "Days Forward", font: { size: 9, color: C.dim } },
        showgrid: true, gridcolor: C.border, gridwidth: 1,
        zeroline: false, tickfont: { size: 9, color: C.dim }, tickcolor: "transparent",
        linecolor: C.border,
      },
      yaxis: {
        showgrid: true, gridcolor: C.border, gridwidth: 1,
        zeroline: false, tickfont: { size: 9, color: C.dim }, tickcolor: "transparent",
        tickprefix: "$", tickformat: ".0f",
        linecolor: C.border,
      },
      showlegend: false,
      hoverlabel: { bgcolor: C.bg3, bordercolor: rc.hex, font: { family: C.font, size: 11, color: C.white } },
    };

    try {
      (Plotly as any).react(div, traces, layout, {
        displayModeBar: false, responsive: true, scrollZoom: false,
      });
    } catch (err) {
      console.error("[MonteCarlo] Plotly render error:", err);
      return;
    }

    const ro = new ResizeObserver(() => {
      try { (Plotly as any).Plots.resize(div); } catch (_) {}
    });
    ro.observe(div);
    return () => { ro.disconnect(); try { (Plotly as any).purge(div); } catch (_) {} };
  }, [mcData, rc.hex, info.key, spot]);

  /* ── Phase-space attractor ────────────────────────────────────── */
  const attRef = useRef<HTMLDivElement>(null);

  const attractorData = useMemo(() => {
    const near = exposures.filter(p => Math.abs(p.strike - spot) <= spot * 0.08);
    if (!near.length) return null;

    const totalAbs = near.reduce((s, p) => s + Math.abs(p.netGex), 0) || 1;

    const centroid = near.reduce((s, p) => s + p.strike * Math.abs(p.netGex), 0) / totalAbs;
    const pca1 = Math.max(-3, Math.min(3, ((centroid - spot) / spot) * 100));

    const posGex = near.filter(p => p.netGex > 0).reduce((s, p) => s + p.netGex, 0);
    const negGex = Math.abs(near.filter(p => p.netGex < 0).reduce((s, p) => s + p.netGex, 0));
    const pca2 = Math.max(-2.5, Math.min(2.5, Math.log((posGex + 1e6) / (negGex + 1e6)) * 1.4));

    const probs = near.map(p => Math.abs(p.netGex) / totalAbs);
    const ent   = -probs.reduce((s, p) => p > 1e-10 ? s + p * Math.log(p) : s, 0);
    const chaos = Math.min(0.005, (ent / Math.max(Math.log(near.length), 1)) * 0.005);
    const threshold = chaos * 0.82;

    const statusText  = chaos < threshold * 0.5 ? "STABLE FLOW" : chaos < threshold ? "TRANSITIONING" : "CHAOTIC REGIME";
    const statusColor = chaos < threshold * 0.5 ? C.call : chaos < threshold ? C.gold : C.put;

    const seed = Math.abs(Math.sin(pca1 * 7.3 + pca2 * 13.1) * 43758.5);
    const rng  = (n: number) => { const x = Math.sin(n * 71.3 + seed) * 43758.5; return x - Math.floor(x); };

    const regimeName = REGIME_CFG[info.key].label;
    const N = 240;
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    const colorVals: number[] = [];
    const hoverText: string[] = [];

    for (let i = 0; i < N; i++) {
      const t     = i / N;
      const decay = Math.pow(1 - t, 1.1);
      // Three overlapping harmonics for scribbly, tangled look
      const p1 = t * Math.PI * 13.6;
      const p2 = t * Math.PI * 8.3;
      const p3 = t * Math.PI * 4.7;
      const x = pca1
        + decay * (Math.cos(p1) * 3.8 + Math.cos(p2 * 1.4 + 0.9) * 1.7 + Math.cos(p3 * 2.3 + 2.1) * 1.0)
        + (rng(i * 3)     - 0.5) * 0.9 * decay;
      const y = pca2
        + decay * (Math.sin(p2) * 2.4 + Math.sin(p1 * 0.7 + 1.3) * 1.3 + Math.sin(p3 * 1.8 + 0.5) * 0.8)
        + (rng(i * 5 + 1) - 0.5) * 0.7 * decay;
      const z = Math.max(0, chaos * (1 + decay * 1.6
        + Math.sin(p1 * 1.7 + p2 * 0.4) * decay * 0.5
        + Math.cos(p3 * 1.2) * decay * 0.35));

      xs.push(x); ys.push(y); zs.push(z);
      colorVals.push(z);

      const age = N - 1 - i;
      const ageLabel = age === 0 ? "CURRENT" : `T-${age}`;
      // Classify each trajectory point's local regime quadrant
      const ptKey: Regime = x > 0 && y > 0 ? "LONG"
        : x > 0 && y < 0 ? "SOFT_LONG"
        : y < 0            ? "SHORT"
        : "TRANSITION";
      hoverText.push(
        `<b>${ageLabel}</b><br>` +
        `STATE: ${x.toFixed(3)}<br>` +
        `MOMENTUM: ${y.toFixed(3)}<br>` +
        `CHAOS: ${z.toExponential(3)}<br>` +
        `REGIME: ${REGIME_CFG[ptKey].label}`,
      );
    }
    // Append current-state endpoint
    xs.push(pca1); ys.push(pca2); zs.push(chaos * 0.22);
    colorVals.push(chaos * 0.22);
    hoverText.push(
      `<b>CURRENT STATE</b><br>` +
      `STATE: ${pca1.toFixed(3)}<br>` +
      `MOMENTUM: ${pca2.toFixed(3)}<br>` +
      `CHAOS: ${(chaos * 0.22).toExponential(3)}<br>` +
      `REGIME: ${regimeName}`,
    );

    return { xs, ys, zs, colorVals, hoverText, pca1, pca2, chaos, threshold, statusText, statusColor, regimeName };
  }, [exposures, spot, info.key]);

  useEffect(() => {
    const div = attRef.current;
    if (!div || !attractorData) return;
    const { xs, ys, zs, colorVals, hoverText, pca1, pca2, chaos, threshold, statusText, statusColor, regimeName } = attractorData;

    const axStyle = {
      gridcolor: "#0c1c2c", zerolinecolor: "#0c1c2c",
      tickfont: { size: 8, color: C.muted, family: C.font },
      backgroundcolor: C.bg0, showbackground: true,
      showgrid: true, showspikes: false, linecolor: "#0a1428",
    };

    // Heatmap colorscale: teal (stable / low chaos) → green → gold → orange → red (chaotic)
    const heatScale = [
      [0.00, "#00b8d4"],
      [0.25, "#00e676"],
      [0.50, "#ffcc00"],
      [0.75, "#ff9500"],
      [1.00, "#ff3355"],
    ];
    const cmax = Math.max(...colorVals, 1e-10);

    const traces: any[] = [
      // Trajectory — heatmap-colored, hover-enabled
      {
        type: "scatter3d", mode: "lines",
        x: xs, y: ys, z: zs,
        line: {
          color: colorVals, width: 5,
          colorscale: heatScale,
          cmin: 0, cmax,
          showscale: true,
          colorbar: {
            thickness: 8, len: 0.5,
            x: 1.01, y: 0.5,
            title: "CHAOS",
            tickfont: { size: 7, color: C.dim, family: C.font },
            tickformat: ".2e",
            bgcolor: "rgba(0,0,0,0)",
            bordercolor: C.border,
          },
        },
        text: hoverText,
        hovertemplate: "%{text}<extra></extra>",
        showlegend: false,
      },
      // Current state: glowing sphere
      {
        type: "scatter3d", mode: "markers",
        x: [pca1], y: [pca2], z: [chaos * 0.22],
        marker: { size: 10, color: C.call, opacity: 1, line: { color: "#ffffff", width: 1.5 } },
        text: [
          `<b>CURRENT STATE</b><br>` +
          `STATE: ${pca1.toFixed(3)}<br>` +
          `MOMENTUM: ${pca2.toFixed(3)}<br>` +
          `CHAOS: ${(chaos * 0.22).toExponential(3)}<br>` +
          `REGIME: ${regimeName}`,
        ],
        hovertemplate: "%{text}<extra></extra>",
        showlegend: false,
      },
      // Chaos threshold plane
      {
        type: "surface",
        x: [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5],
        y: [Math.min(...ys) - 0.5, Math.max(...ys) + 0.5],
        z: [[threshold, threshold], [threshold, threshold]],
        colorscale: [[0, "rgba(255,51,85,0.08)"], [1, "rgba(255,51,85,0.08)"]],
        showscale: false, opacity: 0.92, hoverinfo: "skip",
        lighting: { ambient: 1, diffuse: 0, specular: 0, roughness: 1, fresnel: 0 },
        contours: { x: { highlight: false }, y: { highlight: false }, z: { highlight: false } },
      },
    ];

    const layout: any = {
      autosize: true,
      paper_bgcolor: C.bg1, plot_bgcolor: C.bg1,
      font: { family: C.font, size: 8, color: C.dim },
      margin: { l: 0, r: 50, t: 32, b: 0 },
      scene: {
        xaxis: { ...axStyle, title: { text: "STATE (PCA1)",    font: { size: 8, color: C.muted } } },
        yaxis: { ...axStyle, title: { text: "MOMENTUM (PCA2)", font: { size: 8, color: C.muted } } },
        zaxis: { ...axStyle, title: { text: "CHAOS (Entropy)", font: { size: 8, color: C.muted } }, tickformat: ".2e" },
        bgcolor: C.bg0,
        camera: { eye: { x: 1.9, y: -2.1, z: 1.3 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: -0.1 } },
        aspectmode: "manual",
        aspectratio: { x: 1.7, y: 1.0, z: 0.65 },
        dragmode: "turntable",
      },
      hoverlabel: {
        bgcolor: C.bg3, bordercolor: statusColor,
        font: { family: C.font, size: 11, color: C.white },
        align: "left",
      },
      annotations: [
        {
          text: `STATUS: <b>${statusText}</b>`,
          x: 0.01, y: 0.99, xref: "paper", yref: "paper",
          xanchor: "left", yanchor: "top", showarrow: false,
          font: { family: C.font, size: 10, color: statusColor },
          bgcolor: "rgba(0,0,0,0.72)", borderpad: 5,
        },
        {
          text: `Threshold: ${threshold.toExponential(3)}`,
          x: 0.5, y: 1.0, xref: "paper", yref: "paper",
          xanchor: "center", yanchor: "top", showarrow: false,
          font: { family: C.font, size: 8, color: C.muted },
        },
      ],
      showlegend: false,
    };

    try {
      (Plotly as any).react(div, traces, layout, {
        displayModeBar: false, responsive: true, scrollZoom: true,
      });
    } catch (err) {
      console.error("[Attractor] Plotly render error:", err);
      return;
    }

    const ro = new ResizeObserver(() => {
      try { (Plotly as any).Plots.resize(div); } catch (_) {}
    });
    ro.observe(div);
    return () => { ro.disconnect(); try { (Plotly as any).purge(div); } catch (_) {} };
  }, [attractorData]);

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: C.bg0, fontFamily: C.font }}
    >
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ══ SECTION 1 — REGIME HERO + MONTE CARLO ══════════════ */}
        <div style={{
          background: C.bg1,
          border: `1px solid ${rc.border}`,
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: `inset 0 0 60px ${rc.glow}, 0 0 0 1px ${rc.border}`,
        }}>
          <div style={{ height: 2, background: rc.hex, boxShadow: `0 0 16px ${rc.hex}` }} />

          {/* compact regime header */}
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8, letterSpacing: "0.3em", color: C.text, textTransform: "uppercase", marginBottom: 3 }}>
                ◈ GAMMA REGIME · {ticker.symbol}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.01em", color: rc.hex, textShadow: `0 0 24px ${rc.hex}60`, lineHeight: 1 }}>
                {rc.label}
              </div>
              <div style={{ fontSize: 9, color: C.label, marginTop: 3, letterSpacing: "0.06em" }}>{info.subtitle}</div>
            </div>
            <div style={{ display: "flex", gap: 14, flexShrink: 0, fontFamily: C.font, fontSize: 10 }}>
              <span style={{ color: C.dim }}>GPI <span style={{ color: rc.hex, fontWeight: 700 }}>{gpi.toFixed(1)}</span></span>
              <span style={{ color: C.dim }}>STR <span style={{ color: regimeStrength > 70 ? C.call : regimeStrength > 40 ? C.gold : C.put, fontWeight: 700 }}>{regimeStrength}</span></span>
              <span style={{ color: C.dim }}>GEX <span style={{ color: netGex >= 0 ? C.call : C.put, fontWeight: 700 }}>{netGex >= 0 ? "+" : ""}{(netGex / 1e9).toFixed(2)}B</span></span>
              {flipDistance != null && (
                <span style={{ color: C.dim }}>FLIP <span style={{ color: flipDistance >= 0 ? C.call : C.put, fontWeight: 700 }}>{flipDistance >= 0 ? "+" : ""}${flipDistance.toFixed(1)}</span></span>
              )}
              <span style={{ color: C.dim }}>IV <span style={{ color: C.cyan, fontWeight: 700 }}>{atmIv.toFixed(1)}%</span></span>
            </div>
            <div style={{ background: `${rc.hex}15`, border: `1px solid ${rc.hex}33`, borderRadius: 4, padding: "3px 9px", fontSize: 8, letterSpacing: "0.2em", color: rc.hex, flexShrink: 0 }}>
              σ × {{ LONG: "0.72", SOFT_LONG: "0.85", SHORT: "1.40", FLIP: "1.25", TRANSITION: "1.10" }[info.key]}
            </div>
          </div>

          {/* Monte Carlo fan chart */}
          <div style={{ padding: "6px 4px 2px" }}>
            <div style={{ fontSize: 8, letterSpacing: "0.22em", color: C.dim, textTransform: "uppercase", padding: "0 12px 4px" }}>
              MONTE CARLO · 250 PATHS · 90 DAYS · REGIME-ADJUSTED σ
            </div>
            <div ref={mcRef} style={{ height: 280, minHeight: 0 }} />
          </div>
        </div>

        {/* ══ SECTION 2 — GEX PROFILE CURVE ═══════════════════════ */}
        <SectionCard title="GEX PROFILE CURVE" subtitle={`Net gamma by strike · cumulative line · ±6% of $${spot.toFixed(0)}`}
          legend={[
            { color: C.call, label: "GEX +" },
            { color: C.put,  label: "GEX −" },
            { color: C.gold, label: "Cumulative", dashed: true },
          ]}
        >
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={profileCum} margin={{ top: 12, right: 52, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="strike"
                  tick={{ fontSize: 10, fill: C.label, fontFamily: C.font }}
                  interval="preserveStartEnd" minTickGap={24}
                  axisLine={{ stroke: C.border }} tickLine={false}
                />
                <YAxis
                  yAxisId="bars"
                  tick={{ fontSize: 10, fill: C.label, fontFamily: C.font }}
                  tickFormatter={v => `${(v / 1e9).toFixed(1)}B`}
                  width={52} axisLine={false} tickLine={false}
                />
                <YAxis
                  yAxisId="cum" orientation="right"
                  tick={{ fontSize: 10, fill: C.gold, fontFamily: C.font }}
                  tickFormatter={v => `${(v / 1e9).toFixed(1)}B`}
                  width={52} axisLine={false} tickLine={false}
                />
                <RTooltip
                  contentStyle={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 4, fontFamily: C.font, fontSize: 11, color: C.white }}
                  formatter={(v: number, name: string) => [`${(v / 1e9).toFixed(3)}B`, name]}
                  labelFormatter={l => `Strike $${l}`}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <ReferenceLine yAxisId="bars" y={0} stroke={C.border2} />
                <ReferenceLine yAxisId="bars" x={spot} stroke={C.cyan} strokeWidth={1.5} strokeDasharray="5 3"
                  label={{ value: `▼ SPOT`, position: "top", fill: C.cyan, fontSize: 9, fontFamily: C.font }} />
                {flip != null && (
                  <ReferenceLine yAxisId="bars" x={flip} stroke={C.gold} strokeWidth={1} strokeDasharray="4 3"
                    label={{ value: `FLIP`, position: "insideTopLeft", fill: C.gold, fontSize: 9, fontFamily: C.font }} />
                )}
                <ReferenceLine yAxisId="bars" x={levels.callWall} stroke={C.call} strokeWidth={1} strokeDasharray="2 3" opacity={0.6}
                  label={{ value: "CALL", position: "insideTopRight", fill: C.call, fontSize: 8, fontFamily: C.font }} />
                <ReferenceLine yAxisId="bars" x={levels.putWall} stroke={C.put} strokeWidth={1} strokeDasharray="2 3" opacity={0.6}
                  label={{ value: "PUT", position: "insideBottomLeft", fill: C.put, fontSize: 8, fontFamily: C.font }} />
                <Bar yAxisId="bars" dataKey="netGex" name="Net GEX" radius={[2, 2, 0, 0]} maxBarSize={22}>
                  {profileCum.map((d, i) => (
                    <Cell key={i}
                      fill={d.netGex >= 0 ? C.call : C.put}
                      fillOpacity={0.75}
                    />
                  ))}
                </Bar>
                <Line yAxisId="cum" type="monotone" dataKey="cum" stroke={C.gold} strokeWidth={1.8} strokeDasharray="5 3" dot={false} name="Cumulative" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* ══ ATTRACTOR — Phase-space trajectory ════════════════════ */}
        {attractorData && (
          <SectionCard
            title="GAMMA PHASE-SPACE ATTRACTOR"
            subtitle="State · Momentum · Chaos · 3D trajectory · drag to rotate"
          >
            <div ref={attRef} style={{ height: 500, minHeight: 0 }} />
          </SectionCard>
        )}

        {/* ══ SECTION 3 — 2-col: GPI timeline + Strike Magnetism ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* GPI Evolution */}
          <SectionCard title="GPI EVOLUTION" subtitle="Gamma Pressure Index · live · every 4s">
            <div style={{ height: 200 }}>
              {gpiHist.length < 2 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.dim, fontSize: 11 }}>
                  Collecting data…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={gpiHist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gpi-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={rc.hex} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={rc.hex} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" tick={{ fontSize: 9, fill: C.dim, fontFamily: C.font }} minTickGap={30} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: C.dim, fontFamily: C.font }} width={28} axisLine={false} tickLine={false} />
                    <RTooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 4, fontFamily: C.font, fontSize: 11, color: C.white }} />
                    <ReferenceLine y={50} stroke={C.border2} strokeDasharray="4 3" />
                    <ReferenceLine y={60} stroke={C.call} strokeOpacity={0.25} strokeDasharray="2 2" />
                    <ReferenceLine y={40} stroke={C.put}  strokeOpacity={0.25} strokeDasharray="2 2" />
                    <Area dataKey="gpi" stroke={rc.hex} strokeWidth={1.8} fill="url(#gpi-fill)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, color: C.dim, letterSpacing: "0.06em" }}>
              <span style={{ color: C.put }}>● 0–40 SHORT</span>
              <span style={{ color: C.gold }}>● 40–60 NEUTRAL</span>
              <span style={{ color: C.call }}>● 60–100 LONG</span>
            </div>
          </SectionCard>

          {/* Strike Magnetism */}
          <SectionCard title="STRIKE MAGNETISM" subtitle="Attract / repel force near spot">
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {magnets.map(m => {
                const pct = (m.mag / maxMag) * 100;
                const isPos = m.gex >= 0;
                const dir = m.strike > spot ? "↑" : m.strike < spot ? "↓" : "·";
                const distPct = ((m.dist / spot) * 100).toFixed(1);
                return (
                  <div key={m.strike} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 52, textAlign: "right", fontSize: 10, color: C.label, fontFamily: C.font, flexShrink: 0 }}>
                      <span style={{ color: isPos ? C.call : C.put, marginRight: 2 }}>{dir}</span>
                      ${m.strike}
                    </div>
                    <div style={{ flex: 1, height: 18, background: C.bg2, borderRadius: 3, position: "relative", overflow: "hidden" }}>
                      <div style={{
                        position: "absolute", inset: "0 auto 0 0",
                        width: `${pct}%`,
                        background: isPos
                          ? `linear-gradient(90deg, ${C.call}22, ${C.call}88)`
                          : `linear-gradient(90deg, ${C.put}22, ${C.put}88)`,
                        borderRight: `1px solid ${isPos ? C.call : C.put}`,
                      }} />
                      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 6, fontSize: 9, color: C.white, letterSpacing: "0.05em" }}>
                        {isPos ? "MAGNET" : "REPULSE"} · {(m.gex / 1e9).toFixed(2)}B
                      </span>
                    </div>
                    <div style={{ width: 36, textAlign: "right", fontSize: 9, color: C.dim, flexShrink: 0 }}>
                      {distPct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* ══ SECTION 4 — STABILITY + GREEKS SNAPSHOT ═════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>

          {/* Regime Stability */}
          <SectionCard title="REGIME STABILITY" subtitle="Sign consistency ±2% of spot">
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8 }}>
              <StabilityRing score={stability.score} />
              <div>
                <div style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
                  color: stability.score > 70 ? C.call : stability.score > 40 ? C.gold : C.put,
                }}>
                  {stability.label}
                </div>
                <div style={{ fontSize: 10, color: C.label, marginTop: 6, lineHeight: 1.6, maxWidth: 160 }}>
                  {stability.score > 70
                    ? "High confidence. Regime likely to persist."
                    : stability.score > 40
                    ? "Moderate. Monitor for regime shift."
                    : "Fragile. Any large flow can break it."}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Greeks Snapshot */}
          <SectionCard title="GREEKS SNAPSHOT" subtitle="Aggregate option book exposure">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 8 }}>
              <GreekBlock label="NET GEX"   value={`${(netGex / 1e9).toFixed(3)}B`} color={netGex >= 0 ? C.call : C.put}
                info={netGex >= 0 ? "Dealers long gamma → stabilizing" : "Dealers short gamma → amplifying"} />
              <GreekBlock label="NET DEX"   value={`${(netDex / 1e9).toFixed(3)}B`} color={netDex >= 0 ? C.call : C.put}
                info={netDex >= 0 ? "Net long delta exposure" : "Net short delta exposure"} />
              <GreekBlock label="NET VANNA" value={formatNumber(netVanna / 1e6, 1) + "M"} color={C.cyan}
                info="Sensitivity of delta to vol changes" />
              <GreekBlock label="CALL OI"   value={`${(totalCallOI / 1e6).toFixed(1)}M`} color={C.call}
                info="Total call open interest" />
              <GreekBlock label="PUT OI"    value={`${(totalPutOI / 1e6).toFixed(1)}M`} color={C.put}
                info="Total put open interest" />
              <GreekBlock label="OI SKEW"   value={`${(callBias * 100).toFixed(1)}%`} color={callBias > 0 ? C.call : C.put}
                info={callBias > 0 ? "Call heavy — bullish bias" : callBias < 0 ? "Put heavy — defensive bias" : "Balanced OI"} />
            </div>
          </SectionCard>
        </div>

        {/* ══ SECTION 5 — DEALER HEDGING BEHAVIOR ═════════════════ */}
        <SectionCard title="DEALER HEDGING BEHAVIOR" subtitle="How dealers react to price moves in current regime">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 8 }}>
            <BehaviorTile
              icon={<ArrowUp style={{ width: 14, height: 14 }} />}
              when="SPOT RISES"
              action={netGex >= 0 ? "DEALERS SELL FUTURES" : "DEALERS BUY FUTURES"}
              note={netGex >= 0 ? "Slows the rally → mean-revert" : "Accelerates rally → gamma squeeze"}
              isPositive={netGex >= 0}
            />
            <BehaviorTile
              icon={<ArrowDown style={{ width: 14, height: 14 }} />}
              when="SPOT FALLS"
              action={netGex >= 0 ? "DEALERS BUY FUTURES" : "DEALERS SELL FUTURES"}
              note={netGex >= 0 ? "Automatic support → cushions drop" : "Cascades lower → vol crush upward"}
              isPositive={netGex >= 0}
            />
            <BehaviorTile
              icon={<Minus style={{ width: 14, height: 14 }} />}
              when="SPOT SIDEWAYS"
              action={netGex >= 0 ? `PIN TO $${levels.majorWall}` : "WHIPSAW / CHOP"}
              note={netGex >= 0 ? "Strike magnetism dominates" : "No stabilizing gamma to pin"}
              isPositive={netGex >= 0}
            />
            <BehaviorTile
              icon={callBias > 0 ? <TrendingUp style={{ width: 14, height: 14 }} /> : <TrendingDown style={{ width: 14, height: 14 }} />}
              when="OI POSITIONING"
              action={callBias > 0.05 ? "CALL HEAVY" : callBias < -0.05 ? "PUT HEAVY" : "BALANCED OI"}
              note={`C/P skew ${(callBias * 100).toFixed(1)}% · P/C ratio ${pcRatio.toFixed(2)}`}
              isPositive={callBias >= 0}
            />
          </div>
        </SectionCard>

        {/* ══ SECTION 6 — TRADER PLAYBOOK ═════════════════════════ */}
        <SectionCard title="TRADER PLAYBOOK" subtitle={`Strategy recommendations for ${rc.label}`}
          accent={rc.hex}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div style={{ background: `rgba(0,230,118,0.04)`, border: `1px solid rgba(0,230,118,0.15)`, borderRadius: 4, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.25em", color: C.call, marginBottom: 10, fontWeight: 700 }}>
                ✓ EXECUTE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {info.playbook.do.map(item => (
                  <div key={item} style={{ display: "flex", gap: 8, fontSize: 11, color: C.bright, lineHeight: 1.5 }}>
                    <span style={{ color: C.call, flexShrink: 0, marginTop: 1 }}>▸</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: `rgba(255,51,85,0.04)`, border: `1px solid rgba(255,51,85,0.15)`, borderRadius: 4, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.25em", color: C.put, marginBottom: 10, fontWeight: 700 }}>
                ✗ AVOID
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {info.playbook.avoid.map(item => (
                  <div key={item} style={{ display: "flex", gap: 8, fontSize: 11, color: C.bright, lineHeight: 1.5 }}>
                    <span style={{ color: C.put, flexShrink: 0, marginTop: 1 }}>▸</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* disclaimer */}
          <div style={{ marginTop: 10, fontSize: 9, color: C.dim, letterSpacing: "0.05em", textAlign: "center" }}>
            ◈ NOT FINANCIAL ADVICE · BASED ON DEALER HEDGING MECHANICS · FOR EDUCATIONAL USE ONLY
          </div>
        </SectionCard>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════════════════ */

/* ── GPI Arc gauge ───────────────────────────────────────────────── */
function GpiArc({ value, hex }: { value: number; hex: string }) {
  const v     = Math.max(0, Math.min(100, value));
  const angle = (v / 100) * 180 - 90;            // -90 (left) to +90 (right)
  const R     = 60;
  const cx    = 80, cy = 80;
  const rad   = (angle * Math.PI) / 180;
  const nx    = cx + R * Math.sin(rad);
  const ny    = cy - R * Math.cos(rad);

  // tick marks
  const ticks = [0, 25, 50, 75, 100].map(pct => {
    const a   = (pct / 100) * 180 - 90;
    const ra  = (a * Math.PI) / 180;
    const r1  = R - 6, r2 = R + 2;
    return {
      x1: cx + r1 * Math.sin(ra), y1: cy - r1 * Math.cos(ra),
      x2: cx + r2 * Math.sin(ra), y2: cy - r2 * Math.cos(ra),
      label: String(pct),
      lx: cx + (R + 14) * Math.sin(ra),
      ly: cy - (R + 14) * Math.cos(ra),
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="160" height="100" viewBox="0 0 160 100">
        <defs>
          <linearGradient id="arc-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="#ff3355" />
            <stop offset="40%"  stopColor="#ff9500" />
            <stop offset="100%" stopColor="#00e676" />
          </linearGradient>
        </defs>
        {/* background arc */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke={C.bg2} strokeWidth={10} />
        {/* colored arc */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="url(#arc-grad)" strokeWidth={10} strokeLinecap="round" opacity={0.85} />
        {/* ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={C.muted} strokeWidth={1.5} />
            <text x={t.lx} y={t.ly + 3} textAnchor="middle" fontSize={7} fill={C.dim} fontFamily={C.font}>{t.label}</text>
          </g>
        ))}
        {/* needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={hex} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill={hex} />
        <circle cx={cx} cy={cy} r={2.5} fill={C.bg1} />
      </svg>
      <div style={{ fontSize: 26, fontWeight: 900, color: hex, textShadow: `0 0 20px ${hex}60`, marginTop: -6, fontFamily: C.font }}>
        {v.toFixed(1)}
      </div>
      <div style={{ fontSize: 8, color: C.dim, letterSpacing: "0.2em", marginTop: 2 }}>
        GAMMA PRESSURE INDEX
      </div>
    </div>
  );
}

/* ── Metric pill ─────────────────────────────────────────────────── */
function MetricPill({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`,
      borderRadius: 4, padding: "8px 10px",
      borderBottom: `2px solid ${color}22`,
    }}>
      <div style={{ fontSize: 8, letterSpacing: "0.2em", color: C.dim, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: C.font, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: C.dim, marginTop: 3, letterSpacing: "0.05em" }}>{sub}</div>}
    </div>
  );
}

/* ── Section card wrapper ────────────────────────────────────────── */
function SectionCard({
  title, subtitle, children, legend, accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  legend?: { color: string; label: string; dashed?: boolean }[];
  accent?: string;
}) {
  return (
    <div style={{
      background: C.bg1,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: "12px 14px",
      ...(accent ? { boxShadow: `inset 0 0 0 1px ${accent}18` } : {}),
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.25em", color: C.label, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 9, color: C.dim, marginTop: 2, letterSpacing: "0.04em" }}>{subtitle}</div>}
        </div>
        {legend && (
          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            {legend.map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8, color: C.dim }}>
                <div style={{
                  width: 16, height: 2,
                  background: l.dashed
                    ? `repeating-linear-gradient(90deg,${l.color},${l.color} 3px,transparent 3px,transparent 6px)`
                    : l.color,
                }} />
                {l.label}
              </div>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Stability ring ──────────────────────────────────────────────── */
function StabilityRing({ score }: { score: number }) {
  const color = score > 70 ? C.call : score > 40 ? C.gold : C.put;
  const circ  = 2 * Math.PI * 32;
  return (
    <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
      <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="40" cy="40" r="32" fill="none" stroke={C.bg2} strokeWidth="7" />
        <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 20, fontWeight: 900, color, fontFamily: C.font, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 7, color: C.dim, letterSpacing: "0.1em" }}>SCORE</span>
      </div>
    </div>
  );
}

/* ── Greek block ─────────────────────────────────────────────────── */
function GreekBlock({ label, value, color, info }: { label: string; value: string; color: string; info: string }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 10px", position: "relative", cursor: "help" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
    >
      <div style={{ fontSize: 7, letterSpacing: "0.2em", color: C.dim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: C.font }}>{value}</div>
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 50,
          background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 4,
          padding: "6px 10px", fontSize: 10, color: C.white, whiteSpace: "nowrap",
          boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        }}>
          {info}
        </div>
      )}
    </div>
  );
}

/* ── Behavior tile ───────────────────────────────────────────────── */
function BehaviorTile({
  icon, when, action, note, isPositive,
}: {
  icon: React.ReactNode;
  when: string;
  action: string;
  note: string;
  isPositive: boolean;
}) {
  const color  = isPositive ? C.call : C.put;
  const border = isPositive ? "rgba(0,230,118,0.2)" : "rgba(255,51,85,0.2)";
  const bg     = isPositive ? "rgba(0,230,118,0.04)" : "rgba(255,51,85,0.04)";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 8, letterSpacing: "0.18em", color: C.dim, marginBottom: 5 }}>
        <span style={{ color }}>{icon}</span>
        {when}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: "0.05em", marginBottom: 4 }}>{action}</div>
      <div style={{ fontSize: 10, color: C.label, lineHeight: 1.5, fontStyle: "italic" }}>{note}</div>
    </div>
  );
}

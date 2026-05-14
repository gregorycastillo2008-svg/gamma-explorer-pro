import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js/dist/plotly";
import { calculateAllGreeks } from "@/lib/greeks/greekCalculations";

type MetricKey = "gamma" | "delta" | "vega" | "vanna" | "charm" | "theta";

interface RawContract {
  strike: number;
  expiration: string;
  side: "call" | "put";
  iv: number;
  oi: number;
  delta: number;
  gamma: number;
}

interface ChainData {
  spot: number;
  expirations: string[];
  selectedExpiration: string;
  contracts: RawContract[];
}

interface Props {
  chain: ChainData;
  symbol: string;
}

const MONO = "JetBrains Mono, ui-monospace, monospace";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "gamma", label: "GAMMA",  color: "#22c55e" },
  { key: "delta", label: "DELTA",  color: "#4a9eff" },
  { key: "vega",  label: "VEGA",   color: "#a78bfa" },
  { key: "vanna", label: "VANNA",  color: "#06b6d4" },
  { key: "charm", label: "CHARM",  color: "#f43f5e" },
  { key: "theta", label: "THETA",  color: "#fb923c" },
];

// Plasma-inspired colorscale: black → deep purple → magenta → orange → yellow
const COLORSCALE = [
  [0.00, "#000000"],
  [0.08, "#1a0533"],
  [0.18, "#5c1270"],
  [0.30, "#9b1f9b"],
  [0.42, "#d42975"],
  [0.55, "#f5543b"],
  [0.68, "#fd8827"],
  [0.82, "#fdc325"],
  [1.00, "#fff200"],
];

function daysBetween(iso: string): number {
  return Math.max(0.25, (new Date(iso + "T21:00:00Z").getTime() - Date.now()) / 86_400_000);
}

export function GexGreekSurface3D({ chain, symbol }: Props) {
  const divRef   = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<MetricKey>("gamma");

  // Build IV profile from available contracts: ivMap[strike] = { call, put }
  const ivMap = useMemo(() => {
    const m = new Map<number, { call: number; put: number }>();
    for (const c of chain.contracts) {
      if (!c.iv || c.iv <= 0) continue;
      const cur = m.get(c.strike) ?? { call: 0.20, put: 0.20 };
      if (c.side === "call") cur.call = c.iv;
      else                   cur.put  = c.iv;
      m.set(c.strike, cur);
    }
    return m;
  }, [chain.contracts]);

  // Build Strike × DTE × Metric surface using BS for all expirations
  const { strikeAxis, dteAxis, zMatrix, zMin, zMax } = useMemo(() => {
    const spot = chain.spot;

    // Strikes: unique, filtered ±18% of spot
    const strikesRaw = Array.from(new Set(chain.contracts.map(c => c.strike)))
      .filter(s => Math.abs(s - spot) / spot <= 0.18)
      .sort((a, b) => a - b);
    if (!strikesRaw.length) return { strikeAxis: [], dteAxis: [], zMatrix: [], zMin: 0, zMax: 1 };

    // DTEs: from all available expirations, sorted ascending
    const expirations = chain.expirations?.length
      ? chain.expirations
      : [chain.selectedExpiration];
    const dtePairs = expirations
      .map(exp => ({ exp, dte: daysBetween(exp) }))
      .filter(p => p.dte >= 0.25 && p.dte <= 180)
      .sort((a, b) => a.dte - b.dte);
    if (!dtePairs.length) return { strikeAxis: [], dteAxis: [], zMatrix: [], zMin: 0, zMax: 1 };

    const dteAxis = dtePairs.map(p => Math.round(p.dte));

    // For each (dte, strike) compute BS greek
    let globalMin = Infinity, globalMax = -Infinity;

    const zMatrix = dtePairs.map(({ dte }) =>
      strikesRaw.map(strike => {
        const iv = ivMap.get(strike)?.call ?? 0.20;
        try {
          const bs = calculateAllGreeks({ spot, strike, dte, iv, rate: 0.045, isCall: true });
          let val: number;
          switch (metric) {
            case "gamma": val = Math.abs(bs.gamma) * 1000;       break;  // scale to readable
            case "delta": val = Math.abs(bs.delta);              break;
            case "vega":  val = Math.abs(bs.vega)  * 100;        break;
            case "vanna": val = Math.abs(bs.vanna) * 100;        break;
            case "charm": val = Math.abs(bs.charm) * 1000;       break;
            case "theta": val = Math.abs(bs.theta) * 100;        break;
            default:      val = 0;
          }
          if (Number.isFinite(val)) {
            if (val < globalMin) globalMin = val;
            if (val > globalMax) globalMax = val;
          }
          return Number.isFinite(val) ? val : 0;
        } catch { return 0; }
      })
    );

    return {
      strikeAxis: strikesRaw,
      dteAxis,
      zMatrix,
      zMin: globalMin === Infinity  ? 0 : globalMin,
      zMax: globalMax === -Infinity ? 1 : globalMax,
    };
  }, [chain, metric, ivMap]);

  const metaCurrent = METRICS.find(m => m.key === metric)!;

  // Replot when data or metric changes
  useEffect(() => {
    const div = divRef.current;
    if (!div || !zMatrix.length || !strikeAxis.length || !dteAxis.length) return;

    const data = [
      {
        type: "surface" as const,
        x: strikeAxis,
        y: dteAxis,
        z: zMatrix,
        colorscale: COLORSCALE,
        showscale: true,
        connectgaps: true,
        colorbar: {
          title: { text: metaCurrent.label, font: { color: metaCurrent.color, size: 10 }, side: "right" as const },
          tickfont: { color: "#6b7280", size: 9 },
          len: 0.72, thickness: 12, x: 0.97,
          bgcolor: "rgba(0,0,0,0)", bordercolor: "#1f1f1f",
        },
        lighting: {
          ambient:   0.80,
          diffuse:   0.95,
          specular:  0.40,
          roughness: 0.35,
          fresnel:   0.20,
        },
        lightposition: { x: 1500, y: -1000, z: 2500 },
        opacity: 1.0,
        contours: {
          z: {
            show: true,
            usecolormap: true,
            highlightcolor: "rgba(255,255,255,0.15)",
            project: { z: false },
            width: 1,
          },
        },
        hovertemplate:
          `<b>Strike</b> $%{x:.0f}<br>` +
          `<b>DTE</b> %{y}d<br>` +
          `<b>${metaCurrent.label}</b> %{z:.4f}<extra></extra>`,
      },
    ];

    const axStyle = {
      gridcolor:       "#1a1a1a",
      zerolinecolor:   "#2a2a2a",
      tickfont:        { size: 8, color: "#6b7280" },
      backgroundcolor: "#050505",
      showbackground:  true,
      showgrid:        true,
      showspikes:      false,
    };

    const layout = {
      autosize: true,
      scene: {
        xaxis: { ...axStyle, title: { text: "Strike ($)", font: { size: 9, color: "#4b5563" } }, tickprefix: "$" },
        yaxis: { ...axStyle, title: { text: "DTE",       font: { size: 9, color: "#4b5563" } } },
        zaxis: { ...axStyle, title: { text: metaCurrent.label, font: { size: 9, color: metaCurrent.color } } },
        bgcolor: "#000000",
        camera: {
          eye:    { x: 1.7, y: -1.8, z: 1.2 },
          up:     { x: 0,   y: 0,    z: 1   },
          center: { x: 0,   y: 0,    z: -0.1 },
        },
        dragmode:    "turntable",
        aspectmode:  "manual",
        aspectratio: { x: 1.8, y: 0.9, z: 0.70 },
      },
      margin:        { l: 0, r: 20, b: 0, t: 0 },
      paper_bgcolor: "#000000",
      plot_bgcolor:  "#000000",
      font: { color: "#6b7280", family: MONO, size: 10 },
      hoverlabel: {
        bgcolor:    "#111111",
        bordercolor: metaCurrent.color,
        font: { color: "#e0e0e0", family: MONO, size: 11 },
        namelength: -1,
      },
      showlegend:  false,
      uirevision:  metric,   // preserve camera when only metric changes
    };

    (Plotly as any).react(div, data, layout, {
      displayModeBar:          true,
      modeBarButtonsToRemove:  ["toImage", "sendDataToCloud", "editInChartStudio"],
      displaylogo:             false,
      responsive:              true,
      scrollZoom:              true,
    });

    const ro = new ResizeObserver(() => (Plotly as any).Plots.resize(div));
    ro.observe(div);
    return () => {
      ro.disconnect();
      try { (Plotly as any).purge(div); } catch (_) {}
    };
  }, [strikeAxis, dteAxis, zMatrix, metric, metaCurrent]);

  const nStrikes = strikeAxis.length;
  const nDtes    = dteAxis.length;

  return (
    <div style={{ width: "100%", background: "#000000", borderRadius: 6, overflow: "hidden", border: "1px solid #111111" }}>
      {/* Header */}
      <div style={{
        background: "#0a0a0a",
        borderBottom: "1px solid #111111",
        padding: "7px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: "#4b5563", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Δ GREEK SURFACE · {symbol}
          </span>
          {nStrikes > 0 && (
            <span style={{
              fontFamily: MONO, fontSize: 8, padding: "1px 6px", borderRadius: 2,
              background: "#0a1a0a", border: `1px solid ${metaCurrent.color}33`, color: metaCurrent.color,
              letterSpacing: "0.12em",
            }}>
              {nStrikes}S × {nDtes}T
            </span>
          )}
        </div>

        {/* Metric selector */}
        <div style={{ display: "flex", gap: 3 }}>
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              style={{
                fontFamily: MONO, fontSize: 8, padding: "2px 7px", borderRadius: 3,
                letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                background: metric === m.key ? m.color + "22" : "transparent",
                color:      metric === m.key ? m.color : "#374151",
                border:     `1px solid ${metric === m.key ? m.color + "66" : "#1a1a1a"}`,
                fontWeight: metric === m.key ? 700 : 400,
                transition: "all 0.12s",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <span style={{ fontFamily: MONO, fontSize: 8, color: "#1f2937", letterSpacing: "0.1em" }}>
          DRAG · SCROLL · ROTATE
        </span>
      </div>

      {/* Surface */}
      {nStrikes === 0 || nDtes === 0 ? (
        <div style={{
          height: 360, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 11, color: "#374151",
        }}>
          No data available — waiting for chain…
        </div>
      ) : (
        <div ref={divRef} style={{ width: "100%", height: 360 }} />
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef } from "react";
import Plotly from "plotly.js/dist/plotly";

export interface SurfacePoint {
  strike: number;
  dte: number;
  value: number;
}

interface Props {
  symbol: string;
  points: SurfacePoint[];
  metric?: string;
}

// Jet-style colorscale: deep blue → cyan → yellow → orange → red (matches reference image)
const JET_SCALE = [
  [0.00, "#00007f"],
  [0.12, "#0000ff"],
  [0.25, "#007fff"],
  [0.38, "#00ffff"],
  [0.50, "#7fff7f"],
  [0.62, "#ffff00"],
  [0.75, "#ff7f00"],
  [0.88, "#ff0000"],
  [1.00, "#7f0000"],
];

export function GreeksSurface3D({ symbol, points, metric = "DELTA" }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  const { strikeAxis, dteAxis, zMatrix } = useMemo(() => {
    if (!points.length) return { strikeAxis: [], dteAxis: [], zMatrix: [] };

    const strikesSet = new Set(points.map((p) => p.strike));
    const dtesSet    = new Set(points.map((p) => p.dte));
    const strikes    = Array.from(strikesSet).sort((a, b) => a - b);
    const dtes       = Array.from(dtesSet).sort((a, b) => a - b);

    const map = new Map<string, number>();
    points.forEach((p) => map.set(`${p.strike}|${p.dte}`, p.value));

    // z[dte_i][strike_i] — Plotly convention: outer = y-axis rows
    // null for missing cells so Plotly can interpolate / leave gaps
    const z = dtes.map((d) =>
      strikes.map((s) => map.get(`${s}|${d}`) ?? null)
    );

    return { strikeAxis: strikes, dteAxis: dtes, zMatrix: z };
  }, [points]);

  useEffect(() => {
    const div = divRef.current;
    if (!div || !zMatrix.length || !strikeAxis.length) return;

    const data = [
      {
        type: "surface" as const,
        x: strikeAxis,
        y: dteAxis,
        z: zMatrix,
        colorscale: JET_SCALE,
        showscale: true,
        connectgaps: true,
        colorbar: {
          title: { text: metric, font: { color: "#a0a0a0", size: 10 }, side: "right" as const },
          tickfont: { color: "#a0a0a0", size: 9 },
          len: 0.70, thickness: 14, x: 0.97,
          bgcolor: "rgba(0,0,0,0)", bordercolor: "#1f1f1f",
        },
        lighting: {
          ambient:   0.75,
          diffuse:   0.95,
          specular:  0.35,
          roughness: 0.45,
          fresnel:   0.15,
        },
        lightposition: { x: 1200, y: -800, z: 2000 },
        opacity: 1.0,
        // Surface contours — shows horizontal terrain isolines like the reference image
        contours: {
          z: {
            show: true,
            usecolormap: true,
            highlightcolor: "rgba(255,255,255,0.4)",
            project: { z: false },
            width: 1,
          },
        },
        hovertemplate:
          `<b>Strike</b> $%{x:.0f}<br>` +
          `<b>DTE</b> %{y}d<br>` +
          `<b>${metric}</b> %{z:.4f}<extra></extra>`,
      },
    ];

    const axStyle = {
      gridcolor: "#1f1f1f",
      zerolinecolor: "#2a2a2a",
      tickfont: { size: 8, color: "#a0a0a0" },
      backgroundcolor: "#050505",
      showbackground: true,
      showgrid: true,
      showspikes: false,
    };

    const layout = {
      autosize: true,
      scene: {
        xaxis: {
          ...axStyle,
          title: { text: "Strike ($)", font: { size: 9, color: "#6b7280" } },
          tickprefix: "$",
        },
        yaxis: {
          ...axStyle,
          title: { text: "DTE (days)", font: { size: 9, color: "#6b7280" } },
        },
        zaxis: {
          ...axStyle,
          title: { text: metric, font: { size: 9, color: "#6b7280" } },
        },
        bgcolor: "#050505",
        camera: {
          eye: { x: 1.6, y: -1.9, z: 1.1 },
          up:  { x: 0, y: 0, z: 1 },
          center: { x: 0, y: 0, z: -0.1 },
        },
        dragmode: "turntable",
        aspectmode: "manual",
        aspectratio: { x: 1.8, y: 0.9, z: 0.65 },
      },
      margin: { l: 0, r: 20, b: 0, t: 4 },
      paper_bgcolor: "#050505",
      plot_bgcolor:  "#050505",
      font: {
        color: "#a0a0a0",
        family: "JetBrains Mono, ui-monospace, monospace",
        size: 10,
      },
      hoverlabel: {
        bgcolor: "#1e1e1e",
        bordercolor: "#2a2a2a",
        font: { color: "#e0e0e0", family: "JetBrains Mono, ui-monospace, monospace", size: 11 },
        namelength: -1,
      },
      showlegend: false,
      uirevision: "camera",
    };

    (Plotly as any).newPlot(div, data, layout, {
      displayModeBar: true,
      modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "editInChartStudio"],
      displaylogo: false,
      responsive: true,
      scrollZoom: true,
    });

    const ro = new ResizeObserver(() => (Plotly as any).Plots.resize(div));
    ro.observe(div);

    return () => {
      ro.disconnect();
      try { (Plotly as any).purge(div); } catch (_) {}
    };
  }, [strikeAxis, dteAxis, zMatrix, metric]);

  return (
    <div style={{ width: "100%", background: "#050505", borderRadius: 6, overflow: "hidden" }}>
      <div style={{
        padding: "6px 14px 4px",
        fontSize: 10,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderBottom: "1px solid #111111",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ color: "#6b7280" }}>Δ SURFACE 3D · {symbol} · Strike × DTE × {metric}</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "#374151", fontSize: 9 }}>DRAG · SCROLL · ROTATE</span>
          <span style={{
            fontSize: 8, padding: "1px 6px", borderRadius: 2,
            background: "#0a1a0a", border: "1px solid #22c55e33", color: "#22c55e",
            letterSpacing: "0.15em",
          }}>
            {points.length} pts
          </span>
        </div>
      </div>
      <div ref={divRef} style={{ width: "100%", height: 360 }} />
    </div>
  );
}

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

export function GreeksSurface3D({ symbol, points, metric = "DELTA" }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  const { strikeAxis, dteAxis, zMatrix } = useMemo(() => {
    const strikesSet = new Set(points.map((p) => p.strike));
    const dtesSet    = new Set(points.map((p) => p.dte));
    const strikes    = Array.from(strikesSet).sort((a, b) => a - b);
    const dtes       = Array.from(dtesSet).sort((a, b) => a - b);
    const map        = new Map<string, number>();
    points.forEach((p) => map.set(`${p.strike}|${p.dte}`, p.value));
    // z[dte_i][strike_i] — Plotly convention: outer = y-axis rows
    const z = dtes.map((d) => strikes.map((s) => map.get(`${s}|${d}`) ?? 0));
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
        colorscale: "RdYlGn" as const,
        showscale: true,
        colorbar: {
          title: { text: metric, font: { color: "#a0a0a0", size: 10 }, side: "right" as const },
          tickfont: { color: "#a0a0a0", size: 9 },
          len: 0.65, thickness: 12, x: 0.97,
          bgcolor: "rgba(0,0,0,0)", bordercolor: "#2a2a2a",
        },
        lighting: { ambient: 0.65, diffuse: 0.90, specular: 0.25, roughness: 0.40, fresnel: 0.20 },
        lightposition: { x: 800, y: -600, z: 1400 },
        opacity: 1.0,
        hovertemplate: `<b>Strike</b> $%{x:.0f}<br><b>DTE</b> %{y}D<br><b>${metric}</b> %{z:.2f}<extra></extra>`,
      },
    ];

    const axStyle = {
      gridcolor: "#1f1f1f",
      zerolinecolor: "#2a2a2a",
      tickfont: { size: 8, color: "#a0a0a0" },
      backgroundcolor: "#0a0a0a",
      showbackground: true,
      showgrid: true,
      showspikes: false,
    };

    const layout = {
      autosize: true,
      scene: {
        xaxis: { ...axStyle, title: { text: "Strike", font: { size: 10, color: "#a0a0a0" } } },
        yaxis: { ...axStyle, title: { text: "DTE",    font: { size: 10, color: "#a0a0a0" } } },
        zaxis: { ...axStyle, title: { text: metric,   font: { size: 10, color: "#a0a0a0" } } },
        bgcolor: "#0a0a0a",
        camera: {
          eye: { x: 1.5, y: -1.8, z: 0.9 },
          up: { x: 0, y: 0, z: 1 },
          center: { x: 0, y: 0, z: 0 },
        },
        dragmode: "orbit",
        aspectmode: "manual",
        aspectratio: { x: 1.6, y: 0.8, z: 0.55 },
      },
      margin: { l: 0, r: 24, b: 0, t: 8 },
      paper_bgcolor: "#0a0a0a",
      plot_bgcolor:  "#0a0a0a",
      font: { color: "#a0a0a0", family: "JetBrains Mono, ui-monospace, monospace", size: 10 },
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
      displayModeBar: false,
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
    <div style={{ width: "100%", background: "#0a0a0a", borderRadius: 6, overflow: "hidden" }}>
      <div style={{
        padding: "6px 14px 4px",
        fontSize: 10,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        color: "#6b7280",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderBottom: "1px solid #1a1a1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span>Δ SURFACE 3D · {symbol} · Strike × DTE × {metric}</span>
        <span style={{ color: "#374151", fontSize: 9 }}>DRAG · SCROLL · ROTATE</span>
      </div>
      <div ref={divRef} style={{ width: "100%", height: 340 }} />
    </div>
  );
}

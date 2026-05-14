import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js/dist/plotly";

interface Props {
  strikes: number[];
  expiries: number[];
  cellMap: Map<string, number>;
  min: number;
  max: number;
  spot?: number;
}

const GRID_N = 64;

// Professional dark-to-warm colorscale: deep navy → blue → cyan → emerald → amber → red
const IV_COLORSCALE = [
  [0.00, "#0a0e2a"],
  [0.10, "#0d2470"],
  [0.22, "#0c57c0"],
  [0.35, "#0899d4"],
  [0.48, "#06c49e"],
  [0.60, "#26d448"],
  [0.72, "#e8cc10"],
  [0.83, "#f07010"],
  [0.92, "#e83030"],
  [1.00, "#a00030"],
];

function buildSmoothedSurface(
  strikes: number[],
  expiries: number[],
  cellMap: Map<string, number>,
  spot: number,
  N: number,
) {
  const pts: { K: number; T: number; iv: number }[] = [];
  cellMap.forEach((iv, key) => {
    const [ks, es] = key.split("|");
    const K = +ks, E = +es;
    if (K > 0 && E > 0 && iv > 0.005 && iv < 4.5) pts.push({ K, T: E / 365, iv });
  });

  const atmPts = pts.filter(p => Math.abs(p.K / spot - 1) < 0.05);
  const atmIV =
    atmPts.length > 0 ? atmPts.reduce((s, p) => s + p.iv, 0) / atmPts.length
    : pts.length  > 0 ? pts.reduce((s, p) => s + p.iv, 0)    / pts.length
    : 0.22;

  const sortedStr = strikes.slice().sort((a, b) => a - b);
  const sortedExp = expiries.slice().sort((a, b) => a - b);
  const minStr = sortedStr[0] ?? spot * 0.80;
  const maxStr = sortedStr[sortedStr.length - 1] ?? spot * 1.20;
  const minExp = sortedExp[0] ?? 7;
  const maxExp = sortedExp[sortedExp.length - 1] ?? 365;

  const strikeAxis: number[] = Array.from({ length: N }, (_, i) =>
    Math.round((minStr + (i / (N - 1)) * (maxStr - minStr)) * 100) / 100,
  );
  const dteAxis: number[] = Array.from({ length: N }, (_, i) =>
    Math.round(minExp + (i / (N - 1)) * (maxExp - minExp)),
  );

  // Adaptive bandwidth: wider for sparse data, tighter for dense chains
  const hK = spot * (pts.length > 200 ? 0.045 : pts.length > 60 ? 0.055 : 0.075);
  const hT = Math.max(0.04, (maxExp - minExp) * (pts.length > 200 ? 0.18 : 0.26) / 365);

  const ivGrid: number[][] = strikeAxis.map(K => {
    const m = Math.log(K / spot);
    return dteAxis.map(dte => {
      const T = dte / 365;
      if (pts.length >= 3) {
        let wSum = 0, ivSum = 0;
        for (const dp of pts) {
          const dK = (K - dp.K) / hK;
          const dT = (T - dp.T) / hT;
          const w = Math.exp(-0.5 * (dK * dK + dT * dT));
          if (w > 1e-6) { wSum += w; ivSum += w * dp.iv; }
        }
        if (wSum > 0.015) return ivSum / wSum;
      }
      // Fallback: SVI-inspired parametric smile
      const smileAdj = Math.max(0, -0.28 * m + 0.60 * m * m + 0.012 * Math.abs(m));
      const termAdj  = 1.0 + 0.07 * Math.exp(-T * 5);
      return Math.max(0.03, atmIV * (1 + smileAdj) * termAdj);
    });
  });

  // Laplacian smoothing — more passes for a glassy professional finish
  const z = ivGrid.map(r => [...r]);
  for (let pass = 0; pass < 8; pass++) {
    const alpha = pass < 4 ? 0.35 : 0.20; // strong early, gentle late
    for (let si = 1; si < N - 1; si++) {
      for (let ti = 1; ti < N - 1; ti++) {
        const lap = (z[si-1][ti] + z[si+1][ti] + z[si][ti-1] + z[si][ti+1]) / 4 - z[si][ti];
        z[si][ti] += alpha * lap;
      }
    }
  }

  return { strikeAxis, dteAxis, ivGrid: z };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const CTL: React.CSSProperties = {
  color: "#aaa", fontSize: 11, fontFamily: "monospace",
  display: "inline-flex", alignItems: "center", gap: 4,
};
const BTN_BASE: React.CSSProperties = {
  padding: "3px 10px", fontSize: 11, fontFamily: "monospace",
  borderRadius: 5, cursor: "pointer", transition: "all 0.15s",
};

export function IvSurface3DReal({ strikes, expiries, cellMap, spot, min, max }: Props) {
  const plotDivRef = useRef<HTMLDivElement>(null);
  const S = spot ?? 500;

  const [elev, setElev] = useState(17);
  const [azim, setAzim] = useState(320);
  // Prevent feedback loop: true while a slider is driving a relayout
  const sliderApplyingRef = useRef(false);
  const syncTimerRef      = useRef<ReturnType<typeof setTimeout>>();
  const [showDataPts,  setShowDataPts]  = useState(false);
  const [showRefPlane, setShowRefPlane] = useState(true);
  const [showGrid,     setShowGrid]     = useState(true);

  const { strikeAxis, dteAxis, ivGrid } = useMemo(
    () => buildSmoothedSurface(strikes, expiries, cellMap, S, GRID_N),
    [strikes, expiries, cellMap, S],
  );

  const zForPlot = useMemo(
    () => dteAxis.map((_, ti) => strikeAxis.map((_, si) => ivGrid[si][ti])),
    [dteAxis, strikeAxis, ivGrid],
  );

  // Real contract scatter points
  const { ptX, ptY, ptZ } = useMemo(() => {
    const ptX: number[] = [], ptY: number[] = [], ptZ: number[] = [];
    cellMap.forEach((iv, key) => {
      const [ks, es] = key.split("|");
      const K = +ks, E = +es;
      if (K > 0 && E > 0 && iv > 0.005 && iv < 4.5) { ptX.push(K); ptY.push(E); ptZ.push(iv); }
    });
    return { ptX, ptY, ptZ };
  }, [cellMap]);

  const midIV = (min + max) / 2;

  // ── Main plot ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const div = plotDivRef.current;
    if (!div) return;
    const refZ = dteAxis.map(() => strikeAxis.map(() => midIV));

    const data = [
      // Trace 0 — IV surface
      {
        type: "surface",
        x: strikeAxis, y: dteAxis, z: zForPlot,
        colorscale: IV_COLORSCALE,
        showscale: true,
        colorbar: {
          title: { text: "Impl. Vol", font: { color: "#8894a8", size: 11 }, side: "right" },
          tickfont: { color: "#8894a8", size: 10 },
          tickformat: ".0%",
          len: 0.65, thickness: 14,
          bgcolor: "rgba(0,0,0,0)", bordercolor: "#2a3a54", borderwidth: 1, x: 0.96,
        },
        contours: {
          x: { show: true, color: "rgba(255,255,255,0.06)", width: 1, usecolormap: false },
          y: { show: true, color: "rgba(255,255,255,0.06)", width: 1, usecolormap: false },
          z: { show: true, color: "rgba(255,255,255,0.10)", width: 1, usecolormap: false, start: min, end: max, size: (max - min) / 10 },
        },
        lighting: { ambient: 0.65, diffuse: 0.92, specular: 0.22, roughness: 0.38, fresnel: 0.28 },
        lightposition: { x: 800, y: -600, z: 1600 },
        opacity: 1.0,
        hovertemplate: "<b>Strike</b>  $%{x:.2f}<br><b>DTE</b>     %{y}D<br><b>IV</b>      %{z:.2%}<extra></extra>",
      },
      // Trace 1 — semi-transparent reference plane
      {
        type: "surface",
        x: strikeAxis, y: dteAxis, z: refZ,
        colorscale: [[0, "rgba(80,130,255,0.13)"], [1, "rgba(80,130,255,0.13)"]],
        showscale: false,
        opacity: 0.18,
        visible: showRefPlane,
        hoverinfo: "none",
        lighting: { ambient: 1, diffuse: 0, specular: 0, roughness: 1, fresnel: 0 },
        name: "Ref plane",
      },
      // Trace 2 — real data points
      {
        type: "scatter3d",
        x: ptX, y: ptY, z: ptZ,
        mode: "markers",
        marker: { size: 3.5, color: "#ff2222", opacity: 0.85, line: { width: 0 } },
        visible: showDataPts,
        hovertemplate: "<b>Strike</b> $%{x}<br><b>DTE</b> %{y}D<br><b>IV</b> %{z:.2%}<extra></extra>",
        name: "Data pts",
      },
    ];

    const el0 = elev * Math.PI / 180;
    const az0 = azim * Math.PI / 180;
    const d = 2.5;

    const layout = {
      autosize: true,
      scene: {
        xaxis: {
          title: { text: "Strike", font: { size: 10, color: "#6a7a9a" } },
          color: "#2a3a58", gridcolor: "#111d30", linecolor: "#0e1828",
          tickfont: { size: 8, color: "#4a5a78" }, backgroundcolor: "#060a14",
          showbackground: showGrid, showgrid: showGrid, showspikes: false,
          mirror: false, ticks: "outside", ticklen: 3,
        },
        yaxis: {
          title: { text: "DTE", font: { size: 10, color: "#6a7a9a" } },
          color: "#2a3a58", gridcolor: "#111d30", linecolor: "#0e1828",
          tickfont: { size: 8, color: "#4a5a78" }, backgroundcolor: "#060a14",
          showbackground: showGrid, showgrid: showGrid, showspikes: false,
          mirror: false, ticks: "outside", ticklen: 3,
        },
        zaxis: {
          title: { text: "Impl. Vol", font: { size: 10, color: "#6a7a9a" } },
          color: "#2a3a58", gridcolor: "#111d30", linecolor: "#0e1828",
          tickfont: { size: 8, color: "#4a5a78" }, tickformat: ".0%", backgroundcolor: "#060a14",
          showbackground: showGrid, showgrid: showGrid, showspikes: false,
          mirror: false, ticks: "outside", ticklen: 3,
        },
        bgcolor: "#06080f",
        camera: {
          eye:    { x: d * Math.cos(el0) * Math.cos(az0), y: d * Math.cos(el0) * Math.sin(az0), z: d * Math.sin(el0) },
          up:     { x: 0, y: 0, z: 1 },
          center: { x: 0, y: 0, z: -0.05 },
        },
        aspectmode: "manual",
        aspectratio: { x: 1.6, y: 0.80, z: 0.52 },
        dragmode: "orbit",
      },
      margin: { l: 0, r: 24, b: 0, t: 8 },
      paper_bgcolor: "#06080f",
      plot_bgcolor:  "#06080f",
      font: { color: "#7a8aaa", family: "JetBrains Mono, ui-monospace, monospace", size: 11 },
      hoverlabel: {
        bgcolor: "#0b1322", bordercolor: "#1e3050",
        font: { color: "#d8e6ff", family: "JetBrains Mono, ui-monospace, monospace", size: 12 },
        namelength: -1,
      },
      showlegend: false,
      uirevision: "camera",
    };

    const config = { displayModeBar: false, responsive: true, scrollZoom: true };

    Plotly.newPlot(div, data, layout, config);

    // After user drags the surface, Plotly updates the camera internally.
    // Sync the slider state back so subsequent slider moves continue from
    // the current visual position instead of jumping.
    (div as any).on("plotly_relayout", (evtData: Record<string, any>) => {
      if (sliderApplyingRef.current) return;
      const eye = evtData?.["scene.camera"]?.eye ?? evtData?.["scene.camera.eye"];
      if (!eye || typeof eye.x !== "number") return;
      const r = Math.sqrt(eye.x ** 2 + eye.y ** 2 + eye.z ** 2);
      if (r < 0.1) return;
      const newElev = Math.round(Math.asin(Math.max(-1, Math.min(1, eye.z / r))) * 180 / Math.PI);
      const newAzim = (Math.round(Math.atan2(eye.y, eye.x) * 180 / Math.PI) + 360) % 360;
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => { setElev(newElev); setAzim(newAzim); }, 80);
    });

    const ro = new ResizeObserver(() => Plotly.Plots.resize(div));
    ro.observe(div);

    return () => {
      clearTimeout(syncTimerRef.current);
      ro.disconnect();
      try { Plotly.purge(div); } catch (_) { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strikeAxis, dteAxis, zForPlot, ptX, ptY, ptZ, midIV]);

  // ── Camera update ──────────────────────────────────────────────────────────
  useEffect(() => {
    const div = plotDivRef.current;
    if (!div) return;
    const el = elev * Math.PI / 180;
    const az = azim * Math.PI / 180;
    const d = 2.5;
    sliderApplyingRef.current = true;
    Plotly.relayout(div, {
      "scene.camera.eye": {
        x: d * Math.cos(el) * Math.cos(az),
        y: d * Math.cos(el) * Math.sin(az),
        z: d * Math.sin(el),
      },
    });
    // Clear flag after Plotly fires its relayout event (~150 ms)
    setTimeout(() => { sliderApplyingRef.current = false; }, 200);
  }, [elev, azim]);

  // ── Grid toggle ────────────────────────────────────────────────────────────
  useEffect(() => {
    const div = plotDivRef.current;
    if (!div) return;
    Plotly.relayout(div, {
      "scene.xaxis.showgrid": showGrid, "scene.xaxis.showbackground": showGrid,
      "scene.yaxis.showgrid": showGrid, "scene.yaxis.showbackground": showGrid,
      "scene.zaxis.showgrid": showGrid, "scene.zaxis.showbackground": showGrid,
    });
  }, [showGrid]);

  // ── Trace visibility ───────────────────────────────────────────────────────
  useEffect(() => {
    const div = plotDivRef.current;
    if (!div) return;
    Plotly.restyle(div, { visible: showRefPlane }, [1]);
  }, [showRefPlane]);

  useEffect(() => {
    const div = plotDivRef.current;
    if (!div) return;
    Plotly.restyle(div, { visible: showDataPts }, [2]);
  }, [showDataPts]);

  return (
    <div style={{ width: "100%", background: "#06080f", borderRadius: 12, boxSizing: "border-box", overflow: "hidden" }}>
      <div ref={plotDivRef} style={{ width: "100%", height: 580 }} />

      {/* Controls */}
      <div style={{ display: "flex", gap: 16, padding: "8px 12px", flexWrap: "wrap", alignItems: "center", justifyContent: "center", background: "#06080f" }}>
        <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace" }}>🖱 drag: rotar &nbsp;|&nbsp; scroll: zoom</span>
        <label style={CTL}>
          Elev
          <input type="range" min={-89} max={89} value={elev} onChange={e => setElev(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} />
          <span style={{ color: "#aaa", minWidth: 32 }}>{elev}°</span>
        </label>
        <label style={CTL}>
          Az
          <input type="range" min={0} max={360} value={azim} onChange={e => setAzim(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} />
          <span style={{ color: "#aaa", minWidth: 32 }}>{azim}°</span>
        </label>
        <label style={CTL}>
          <input type="checkbox" checked={showDataPts} onChange={e => setShowDataPts(e.target.checked)} />
          Data pts
        </label>
        <label style={CTL}>
          <input type="checkbox" checked={showRefPlane} onChange={e => setShowRefPlane(e.target.checked)} />
          Ref plane
        </label>
        <button
          onClick={() => setShowGrid(g => !g)}
          style={{
            ...BTN_BASE,
            background: showGrid ? "rgba(34,34,34,0.9)" : "transparent",
            border: `1px solid ${showGrid ? "#444" : "#2a2a2a"}`,
            color: showGrid ? "#e5e7eb" : "#555",
          }}
        >
          {showGrid ? "⊞ Grid ON" : "⊟ Grid OFF"}
        </button>
      </div>

      {/* Color legend */}
      <div style={{ display: "flex", justifyContent: "center", padding: "0 12px 10px", background: "#06080f" }}>
        <div>
          <div style={{ width: 260, height: 14, background: "linear-gradient(to right, #0a0e2a, #0d2470, #0c57c0, #0899d4, #06c49e, #26d448, #e8cc10, #f07010, #e83030, #a00030)", borderRadius: 4, border: "1px solid #1a2a40" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", fontFamily: "monospace", marginTop: 2 }}>
            <span>Low</span><span>Mid</span><span>High Vol</span>
          </div>
        </div>
      </div>
    </div>
  );
}

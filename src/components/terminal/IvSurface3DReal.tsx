import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  strikes: number[];
  expiries: number[];
  cellMap: Map<string, number>;
  min: number;
  max: number;
  spot?: number;
}

const GRID_N = 48;

const IV_COLORSCALE = [
  [0.00, "#0500ff"],
  [0.14, "#0077ff"],
  [0.28, "#00ccff"],
  [0.42, "#00ff99"],
  [0.56, "#88ff00"],
  [0.68, "#ffee00"],
  [0.78, "#ff9900"],
  [0.89, "#ff3300"],
  [1.00, "#cc0044"],
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

  const hK = spot * 0.065;
  const hT = Math.max(0.05, (maxExp - minExp) * 0.22 / 365);

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
          if (w > 1e-5) { wSum += w; ivSum += w * dp.iv; }
        }
        if (wSum > 0.03) return ivSum / wSum;
      }
      const smileAdj = Math.max(0, -0.30 * m + 0.55 * m * m + 0.015 * Math.abs(m));
      const termAdj  = 1.0 + 0.08 * Math.exp(-T * 4);
      return Math.max(0.04, atmIV * (1 + smileAdj) * termAdj);
    });
  });

  const z = ivGrid.map(r => [...r]);
  for (let pass = 0; pass < 5; pass++) {
    for (let si = 1; si < N - 1; si++) {
      for (let ti = 1; ti < N - 1; ti++) {
        z[si][ti] = (z[si][ti] * 4 + z[si-1][ti] + z[si+1][ti] + z[si][ti-1] + z[si][ti+1]) / 8;
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
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;

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
          x: { show: true, color: "rgba(255,255,255,0.08)", width: 1, usecolormap: false },
          y: { show: true, color: "rgba(255,255,255,0.08)", width: 1, usecolormap: false },
          z: { show: false, highlightcolor: "rgba(255,255,255,0.45)", highlightwidth: 2 },
        },
        lighting: { ambient: 0.72, diffuse: 0.88, specular: 0.06, roughness: 0.48, fresnel: 0.16 },
        lightposition: { x: 600, y: -800, z: 1400 },
        opacity: 0.97,
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
          title: { text: "Strike Price", font: { size: 11, color: "#8894a8" } },
          color: "#4a5a74", gridcolor: "#1e2d42", linecolor: "#1e2d42",
          tickfont: { size: 9, color: "#6b7a94" }, backgroundcolor: "#0b1020",
          showbackground: showGrid, showgrid: showGrid, showspikes: false,
        },
        yaxis: {
          title: { text: "Days to Expiration", font: { size: 11, color: "#8894a8" } },
          color: "#4a5a74", gridcolor: "#1e2d42", linecolor: "#1e2d42",
          tickfont: { size: 9, color: "#6b7a94" }, backgroundcolor: "#0b1020",
          showbackground: showGrid, showgrid: showGrid, showspikes: false,
        },
        zaxis: {
          title: { text: "Implied Volatility", font: { size: 11, color: "#8894a8" } },
          color: "#4a5a74", gridcolor: "#1e2d42", linecolor: "#1e2d42",
          tickfont: { size: 9, color: "#6b7a94" }, tickformat: ".0%", backgroundcolor: "#0b1020",
          showbackground: showGrid, showgrid: showGrid, showspikes: false,
        },
        bgcolor: "#080c14",
        camera: {
          eye:    { x: d * Math.cos(el0) * Math.cos(az0), y: d * Math.cos(el0) * Math.sin(az0), z: d * Math.sin(el0) },
          up:     { x: 0, y: 0, z: 1 },
          center: { x: 0, y: 0, z: -0.06 },
        },
        aspectmode: "manual",
        aspectratio: { x: 1.5, y: 0.85, z: 0.58 },
      },
      margin: { l: 0, r: 20, b: 0, t: 10 },
      paper_bgcolor: "#080c14",
      plot_bgcolor:  "#080c14",
      font: { color: "#8894a8", family: "JetBrains Mono, ui-monospace, monospace", size: 11 },
      hoverlabel: {
        bgcolor: "#0d1827", bordercolor: "#2a3a54",
        font: { color: "#e0e6ed", family: "JetBrains Mono, ui-monospace, monospace", size: 12 },
      },
      showlegend: false,
    };

    const config = { displayModeBar: false, responsive: true, scrollZoom: true };

    Plotly.newPlot(div, data, layout, config);

    const ro = new ResizeObserver(() => Plotly.Plots.resize(div));
    ro.observe(div);

    return () => {
      ro.disconnect();
      try { Plotly.purge(div); } catch (_) { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strikeAxis, dteAxis, zForPlot, ptX, ptY, ptZ, midIV]);

  // ── Camera update ──────────────────────────────────────────────────────────
  useEffect(() => {
    const div = plotDivRef.current;
    const Plotly = (window as any).Plotly;
    if (!div || !Plotly) return;
    const el = elev * Math.PI / 180;
    const az = azim * Math.PI / 180;
    const d = 2.5;
    Plotly.relayout(div, {
      "scene.camera.eye": {
        x: d * Math.cos(el) * Math.cos(az),
        y: d * Math.cos(el) * Math.sin(az),
        z: d * Math.sin(el),
      },
    });
  }, [elev, azim]);

  // ── Grid toggle ────────────────────────────────────────────────────────────
  useEffect(() => {
    const div = plotDivRef.current;
    const Plotly = (window as any).Plotly;
    if (!div || !Plotly) return;
    Plotly.relayout(div, {
      "scene.xaxis.showgrid": showGrid, "scene.xaxis.showbackground": showGrid,
      "scene.yaxis.showgrid": showGrid, "scene.yaxis.showbackground": showGrid,
      "scene.zaxis.showgrid": showGrid, "scene.zaxis.showbackground": showGrid,
    });
  }, [showGrid]);

  // ── Trace visibility ───────────────────────────────────────────────────────
  useEffect(() => {
    const div = plotDivRef.current;
    const Plotly = (window as any).Plotly;
    if (!div || !Plotly) return;
    Plotly.restyle(div, { visible: showRefPlane }, [1]);
  }, [showRefPlane]);

  useEffect(() => {
    const div = plotDivRef.current;
    const Plotly = (window as any).Plotly;
    if (!div || !Plotly) return;
    Plotly.restyle(div, { visible: showDataPts }, [2]);
  }, [showDataPts]);

  return (
    <div style={{ width: "100%", background: "#080c14", borderRadius: 12, boxSizing: "border-box", overflow: "hidden" }}>
      <div ref={plotDivRef} style={{ width: "100%", height: 540 }} />

      {/* Controls — matching old Volatility3DSurface style */}
      <div style={{ display: "flex", gap: 16, padding: "8px 12px", flexWrap: "wrap", alignItems: "center", justifyContent: "center", background: "#080c14" }}>
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
      <div style={{ display: "flex", justifyContent: "center", padding: "0 12px 10px", background: "#080c14" }}>
        <div>
          <div style={{ width: 220, height: 14, background: "linear-gradient(to right, #0500ff, #0077ff, #00ccff, #00ff99, #88ff00, #ffee00, #ff9900, #ff3300, #cc0044)", borderRadius: 4, border: "1px solid #333" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", fontFamily: "monospace", marginTop: 2 }}>
            <span>Low</span><span>Mid</span><span>High Vol</span>
          </div>
        </div>
      </div>
    </div>
  );
}

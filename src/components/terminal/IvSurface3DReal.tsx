import { useEffect, useMemo, useRef } from "react";

interface Props {
  strikes: number[];
  expiries: number[];
  cellMap: Map<string, number>; // `${strike}|${expiry}` → iv (0..1)
  min: number;
  max: number;
  spot?: number;
}

const GRID_N = 48;

// Blue→Cyan→Green→Yellow→Orange→Red — matches the reference image style
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

// ── Smooth IV surface from sparse contract data ──────────────────────────────
// 1. Gaussian kernel regression from real (K, T, IV) triplets
// 2. SVI-style smile fallback for cells far from real data
// 3. 5-pass box blur to eliminate spikes
function buildSmoothedSurface(
  strikes: number[],
  expiries: number[],
  cellMap: Map<string, number>,
  spot: number,
  N: number,
) {
  // Collect valid real points
  const pts: { K: number; T: number; iv: number }[] = [];
  cellMap.forEach((iv, key) => {
    const [ks, es] = key.split("|");
    const K = +ks, E = +es;
    if (K > 0 && E > 0 && iv > 0.005 && iv < 4.5) {
      pts.push({ K, T: E / 365, iv });
    }
  });

  // ATM IV baseline
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

  // Raw grid: ivGrid[si][ti] = IV at (strikeAxis[si], dteAxis[ti])
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
      // SVI-like smile fallback with put skew + short-term bump
      const smileAdj = Math.max(0, -0.30 * m + 0.55 * m * m + 0.015 * Math.abs(m));
      const termAdj  = 1.0 + 0.08 * Math.exp(-T * 4);
      return Math.max(0.04, atmIV * (1 + smileAdj) * termAdj);
    });
  });

  // 5-pass weighted box blur (borders stay fixed)
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

export function IvSurface3DReal({ strikes, expiries, cellMap, spot }: Props) {
  const plotDivRef = useRef<HTMLDivElement>(null);
  const S = spot ?? 500;

  const { strikeAxis, dteAxis, ivGrid } = useMemo(
    () => buildSmoothedSurface(strikes, expiries, cellMap, S, GRID_N),
    [strikes, expiries, cellMap, S],
  );

  // Plotly needs z[y_idx][x_idx] = z[dte_idx][strike_idx]
  // → transpose ivGrid so Strike is X (left-right) and DTE is Y (depth)
  const zForPlot = useMemo(
    () => dteAxis.map((_, ti) => strikeAxis.map((_, si) => ivGrid[si][ti])),
    [dteAxis, strikeAxis, ivGrid],
  );

  useEffect(() => {
    const div = plotDivRef.current;
    if (!div) return;

    // Use the Plotly loaded from CDN in index.html (avoids bundle conflicts)
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;

    const data = [
      {
        type: "surface",
        // X = Strike Price  → goes left to right (like reference image)
        x: strikeAxis,
        // Y = Days to Expiry → goes into depth (like reference image)
        y: dteAxis,
        z: zForPlot,
        colorscale: IV_COLORSCALE,
        showscale: true,
        colorbar: {
          title: { text: "Impl. Vol", font: { color: "#8894a8", size: 11 }, side: "right" },
          tickfont: { color: "#8894a8", size: 10 },
          tickformat: ".0%",
          len: 0.65,
          thickness: 14,
          bgcolor: "rgba(0,0,0,0)",
          bordercolor: "#2a3a54",
          borderwidth: 1,
          x: 0.96,
        },
        // Grid lines on the surface mesh (visible in reference image)
        contours: {
          x: { show: true, color: "rgba(255,255,255,0.08)", width: 1, usecolormap: false },
          y: { show: true, color: "rgba(255,255,255,0.08)", width: 1, usecolormap: false },
          z: { show: false, highlightcolor: "rgba(255,255,255,0.45)", highlightwidth: 2 },
        },
        lighting: {
          ambient: 0.72,
          diffuse: 0.88,
          specular: 0.06,
          roughness: 0.48,
          fresnel: 0.16,
        },
        lightposition: { x: 600, y: -800, z: 1400 },
        opacity: 0.97,
        hovertemplate:
          "<b>Strike</b>  $%{x:.2f}<br>" +
          "<b>DTE</b>     %{y}D<br>" +
          "<b>IV</b>      %{z:.2%}" +
          "<extra></extra>",
      },
    ];

    const layout = {
      autosize: true,
      scene: {
        // Strike Price on X axis (horizontal, left→right)
        xaxis: {
          title: { text: "Strike Price", font: { size: 11, color: "#8894a8" } },
          color: "#4a5a74",
          gridcolor: "#1e2d42",
          linecolor: "#1e2d42",
          tickfont: { size: 9, color: "#6b7a94" },
          backgroundcolor: "#0b1020",
          showbackground: true,
          showspikes: false,
        },
        // Days to Expiry on Y axis (depth, going back)
        yaxis: {
          title: { text: "Days to Expiration", font: { size: 11, color: "#8894a8" } },
          color: "#4a5a74",
          gridcolor: "#1e2d42",
          linecolor: "#1e2d42",
          tickfont: { size: 9, color: "#6b7a94" },
          backgroundcolor: "#0b1020",
          showbackground: true,
          showspikes: false,
        },
        // Implied Vol on Z axis (height)
        zaxis: {
          title: { text: "Implied Volatility", font: { size: 11, color: "#8894a8" } },
          color: "#4a5a74",
          gridcolor: "#1e2d42",
          linecolor: "#1e2d42",
          tickfont: { size: 9, color: "#6b7a94" },
          tickformat: ".0%",
          backgroundcolor: "#0b1020",
          showbackground: true,
          showspikes: false,
        },
        bgcolor: "#080c14",
        // Camera: front-right, slightly elevated — matches reference image perspective
        // Strike goes left→right, DTE recedes into background, IV rises up
        camera: {
          eye:    { x: 1.80, y: -1.55, z: 0.72 },
          up:     { x: 0,    y: 0,     z: 1    },
          center: { x: 0,    y: 0,     z: -0.06 },
        },
        aspectmode: "manual",
        // Strike axis wider than DTE depth, IV height proportional
        aspectratio: { x: 1.5, y: 0.85, z: 0.58 },
      },
      margin: { l: 0, r: 20, b: 0, t: 10 },
      paper_bgcolor: "#080c14",
      plot_bgcolor:  "#080c14",
      font: {
        color: "#8894a8",
        family: "JetBrains Mono, ui-monospace, monospace",
        size: 11,
      },
      hoverlabel: {
        bgcolor: "#0d1827",
        bordercolor: "#2a3a54",
        font: { color: "#e0e6ed", family: "JetBrains Mono, ui-monospace, monospace", size: 12 },
      },
    };

    const config = {
      displayModeBar: false,
      responsive: true,
      scrollZoom: true,
    };

    Plotly.newPlot(div, data, layout, config);

    const ro = new ResizeObserver(() => Plotly.Plots.resize(div));
    ro.observe(div);

    return () => {
      ro.disconnect();
      try { Plotly.purge(div); } catch (_) { /* ignore */ }
    };
  }, [strikeAxis, dteAxis, zForPlot]);

  return (
    <div
      style={{
        width: "100%",
        background: "#080c14",
        borderRadius: 12,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div ref={plotDivRef} style={{ width: "100%", height: 540 }} />
    </div>
  );
}

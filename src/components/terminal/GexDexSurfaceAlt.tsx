import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js/dist/plotly";
import { calculateAllGreeks } from "@/lib/greeks/greekCalculations";
import type { OptionContract } from "@/lib/gex";

type Metric = "gex" | "dex" | "gexdex";

interface Props {
  contracts:      OptionContract[];
  spot:           number;
  symbol:         string;
  callWall?:      number;
  putWall?:       number;
  gammaFlip?:     number | null;
  defaultMetric?: Metric;
}

const MONO = "JetBrains Mono, ui-monospace, monospace";

const CS_SABANA: [number, string][] = [
  [0.00, "#0d1b3e"],
  [0.12, "#1040a0"],
  [0.25, "#1e7fd4"],
  [0.38, "#5bb8f5"],
  [0.50, "#c8a05a"],
  [0.62, "#e86820"],
  [0.74, "#e02010"],
  [0.88, "#cc0000"],
  [1.00, "#660000"],
];

function fmtM(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

export function GexDexSurfaceAlt({
  contracts, spot, symbol, callWall, putWall, gammaFlip, defaultMetric,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const eyeRef = useRef({ x: 1.55, y: -2.0, z: 1.4 });
  const [metric, setMetric] = useState<Metric>(defaultMetric ?? "gex");

  // ── Build all three matrices in one pass ────────────────────────
  const { strikeAxis, dteAxis, gexMatrix, dexMatrix, expCount } = useMemo(() => {
    const gexMap    = new Map<string, number>();
    const dexMap    = new Map<string, number>();
    const strikeSet = new Set<number>();
    const dteSet    = new Set<number>();

    for (const c of contracts) {
      if (!c.oi || !c.strike || c.expiry == null) continue;
      if (Math.abs(c.strike / spot - 1) > 0.18) continue;
      strikeSet.add(c.strike);
      dteSet.add(c.expiry);

      const sign  = c.type === "call" ? 1 : -1;
      const dte   = Math.max(c.expiry, 0.5);
      const ivUse = c.iv > 0 ? c.iv : 0.20;
      const g     = calculateAllGreeks({ spot, strike: c.strike, dte, iv: ivUse, rate: 0.045, isCall: c.type === "call" });

      const gamma = (c.gamma != null && c.gamma !== 0) ? c.gamma : g.gamma;
      const delta = (c.delta != null && c.delta !== 0) ? c.delta : g.delta;
      const key   = `${c.strike}|${c.expiry}`;

      gexMap.set(key, (gexMap.get(key) ?? 0) + sign * gamma * c.oi * spot * spot * 0.01);
      dexMap.set(key, (dexMap.get(key) ?? 0) + sign * delta * c.oi * spot);
    }

    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const dtes    = Array.from(dteSet).sort((a, b) => a - b);
    if (!strikes.length || !dtes.length)
      return { strikeAxis: [], dteAxis: [], gexMatrix: [], dexMatrix: [], expCount: 0 };

    const gexMatrix = dtes.map(dte => strikes.map(s => (gexMap.get(`${s}|${dte}`) ?? 0) / 1e6));
    const dexMatrix = dtes.map(dte => strikes.map(s => (dexMap.get(`${s}|${dte}`) ?? 0) / 1e6));

    return { strikeAxis: strikes, dteAxis: dtes, gexMatrix, dexMatrix, expCount: dtes.length };
  }, [contracts, spot]);

  // Select active z-matrix
  const zMatrix = metric === "gex"
    ? gexMatrix
    : metric === "dex"
    ? dexMatrix
    : gexMatrix.map((row, i) => row.map((v, j) => v + dexMatrix[i][j]));

  // ── Stats ───────────────────────────────────────────────────────
  const { netTotal, callDom, putDom } = useMemo(() => {
    let net = 0, pos = 0, neg = 0;
    zMatrix.forEach(row => row.forEach(v => {
      net += v;
      if (v > 0) pos += v; else neg += v;
    }));
    return { netTotal: net, callDom: pos, putDom: neg };
  }, [zMatrix]);

  // ── Plotly render ───────────────────────────────────────────────
  useEffect(() => {
    const div = divRef.current;
    if (!div || !zMatrix.length || !strikeAxis.length) return;

    const nS       = strikeAxis.length;
    const nD       = dteAxis.length;
    const label    = metric === "gex" ? "Net GEX ($M)" : metric === "dex" ? "Net DEX ($M)" : "Net GEX+DEX ($M)";

    const surface: any = {
      type:        "surface",
      x:           strikeAxis,
      y:           dteAxis,
      z:           zMatrix,
      colorscale:  CS_SABANA,
      showscale:   true,
      connectgaps: true,
      opacity:     1.0,
      lighting: {
        ambient:   0.85, diffuse: 0.95, specular: 0.05, roughness: 1.0, fresnel: 0.0,
      },
      lightposition: { x: 0, y: 0, z: 3000 },
      contours: {
        z: { show: true, usecolormap: false, color: "rgba(255,255,255,0.18)", width: 2, project: { z: false } },
        x: { show: false }, y: { show: false },
      },
      hovertemplate: `<b>Strike</b> $%{x:.0f}<br><b>DTE</b> %{y}d<br><b>${label}</b> %{z:.3f}M<extra></extra>`,
      colorbar: {
        title:     { text: label, font: { color: "#ffdd00", size: 9, family: MONO }, side: "right" as const },
        tickfont:  { color: "#4b5563", size: 8, family: MONO },
        tickformat: ".1f", ticksuffix: "M",
        len: 0.75, thickness: 10, x: 0.97,
        bgcolor: "rgba(0,0,0,0)", bordercolor: "#1a1a1a",
      },
    };

    const zeroPlane: any = {
      type:       "surface",
      x:          [strikeAxis[0], strikeAxis[nS - 1]],
      y:          [dteAxis[0],    dteAxis[nD - 1]],
      z:          [[0, 0], [0, 0]],
      showscale:  false,
      opacity:    0.06,
      colorscale: [[0, "#ffffff"], [1, "#ffffff"]],
      hoverinfo:  "skip",
      lighting:   { ambient: 1, diffuse: 0, specular: 0 },
      contours:   { z: { show: false }, x: { show: false }, y: { show: false } },
    };

    // Reference lines
    const refLines: any[] = [];
    const refs = [
      ...(callWall  ? [{ strike: callWall,  color: "#ffaa00", lbl: "CALL WALL" }] : []),
      ...(putWall   ? [{ strike: putWall,   color: "#3399ff", lbl: "PUT WALL"  }] : []),
      ...(gammaFlip != null ? [{ strike: gammaFlip, color: "#a855f7", lbl: "γ FLIP" }] : []),
      { strike: spot, color: "#22c55e", lbl: "SPOT" },
    ];
    const absMax = Math.max(Math.abs(Math.min(...zMatrix.flat())), Math.abs(Math.max(...zMatrix.flat())), 0.001);
    for (const { strike, color, lbl } of refs) {
      if (strike < strikeAxis[0] || strike > strikeAxis[strikeAxis.length - 1]) continue;
      refLines.push({
        type: "scatter3d", mode: "lines+text",
        x: [strike, strike], y: [dteAxis[0], dteAxis[nD - 1]], z: [-absMax * 0.05, absMax * 0.85],
        line: { color, width: 3 },
        text: ["", lbl], textfont: { color, size: 8, family: MONO },
        textposition: "top center", showlegend: false, hoverinfo: "skip",
      });
    }

    const axStyle = {
      gridcolor: "#141414", zerolinecolor: "#222222",
      tickfont: { size: 8, color: "#4b5563", family: MONO },
      backgroundcolor: "#060606", showbackground: true, showspikes: false, linecolor: "#1f1f1f",
    };

    const layout: any = {
      autosize: true,
      paper_bgcolor: "#000000", plot_bgcolor: "#000000",
      margin: { l: 0, r: 24, b: 0, t: 0 },
      font: { color: "#4b5563", family: MONO, size: 9 },
      scene: {
        xaxis: { ...axStyle, title: { text: "Strike ($)", font: { size: 9, color: "#374151" } }, tickprefix: "$" },
        yaxis: { ...axStyle, title: { text: "DTE (days)", font: { size: 9, color: "#374151" } } },
        zaxis: { ...axStyle, title: { text: label, font: { size: 9, color: "#ffdd00" } }, ticksuffix: "M" },
        bgcolor: "#000000",
        camera: { eye: eyeRef.current, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: -0.1 } },
        dragmode: "turntable", aspectmode: "manual", aspectratio: { x: 2.0, y: 1.0, z: 0.65 },
      },
      hoverlabel: {
        bgcolor: "#0d0d0d", bordercolor: "#ffdd00",
        font: { color: "#e0e0e0", family: MONO, size: 11 }, namelength: -1,
      },
      showlegend: false,
      uirevision: metric,
    };

    (Plotly as any).react(div, [surface, zeroPlane, ...refLines], layout, {
      displayModeBar: true,
      modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "editInChartStudio"],
      displaylogo: false, responsive: true, scrollZoom: true,
    });

    const onRelayout = (e: any) => { if (e?.["scene.camera.eye"]) eyeRef.current = e["scene.camera.eye"]; };
    (div as any).on?.("plotly_relayout", onRelayout);

    const ro = new ResizeObserver(() => (Plotly as any).Plots.resize(div));
    ro.observe(div);
    return () => { ro.disconnect(); try { (Plotly as any).purge(div); } catch (_) {} };
  }, [strikeAxis, dteAxis, zMatrix, metric, spot, callWall, putWall, gammaFlip]);

  const nS    = strikeAxis.length;
  const nD    = expCount;
  const isPos = netTotal >= 0;
  const accent = "#ffdd00";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
                  background: "#000", border: "1px solid #111", borderRadius: 6, overflow: "hidden" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: "#080808", borderBottom: "1px solid #111",
                    padding: "7px 12px", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        {/* Left: title + badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: "#374151",
                         letterSpacing: "0.16em", textTransform: "uppercase" }}>
            ∑ GEX/DEX 3D · {symbol}
          </span>
          {nS > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 8, padding: "1px 6px", borderRadius: 2,
                           background: accent + "11", border: `1px solid ${accent}33`,
                           color: accent, letterSpacing: "0.1em" }}>
              {nS}S × {nD}T
            </span>
          )}
        </div>

        {/* Center: stats */}
        {nS > 0 && (
          <div style={{ display: "flex", gap: 14, fontFamily: MONO, fontSize: 9 }}>
            <span style={{ color: "#374151" }}>NET&nbsp;
              <span style={{ color: isPos ? "#ffdd00" : "#00ccff", fontWeight: 700 }}>
                {isPos ? "+" : ""}{fmtM(netTotal)}
              </span>
            </span>
            <span style={{ color: "#374151" }}>CALL&nbsp;
              <span style={{ color: "#cc8800", fontWeight: 600 }}>{fmtM(callDom)}</span>
            </span>
            <span style={{ color: "#374151" }}>PUT&nbsp;
              <span style={{ color: "#2266cc", fontWeight: 600 }}>{fmtM(putDom)}</span>
            </span>
          </div>
        )}

        {/* Right: GEX | DEX | GEX+DEX toggle */}
        <div style={{ display: "flex", gap: 3 }}>
          {(["gex", "dex", "gexdex"] as Metric[]).map(m => (
            <button key={m} onClick={() => setMetric(m)} style={{
              fontFamily: MONO, fontSize: 9, padding: "2px 10px",
              borderRadius: 3, letterSpacing: "0.12em",
              textTransform: "uppercase" as const, cursor: "pointer",
              background: metric === m ? "#ffdd0022" : "transparent",
              color:      metric === m ? "#ffdd00"   : "#2a2a2a",
              border:     metric === m ? "1px solid #ffdd0066" : "1px solid #1a1a1a",
              fontWeight: metric === m ? 700 : 400,
              transition: "all 0.12s",
            }}>
              {m === "gexdex" ? "GEX+DEX" : m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Surface ────────────────────────────────────────────── */}
      {nS === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: MONO, fontSize: 11, color: "#1f2937" }}>
          No contract data available…
        </div>
      ) : (
        <div ref={divRef} style={{ flex: 1, minHeight: 0 }} />
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "4px 12px", borderTop: "1px solid #0d0d0d",
                    display: "flex", alignItems: "center", gap: 16,
                    background: "#050505", fontFamily: MONO, fontSize: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: "linear-gradient(90deg, #0d1b3e, #5bb8f5, #c8a05a, #e02010, #660000)" }} />
          <span style={{ color: "#1f2937" }}>LOW → HIGH</span>
        </div>
        <span style={{ color: "#1a1a1a" }}>·</span>
        <span style={{ color: "#1f2937" }}>DRAG · SCROLL · ROTATE</span>
        {callWall  && <span style={{ color: "#374151" }}>CALL WALL <span style={{ color: "#ffaa00" }}>${callWall}</span></span>}
        {putWall   && <span style={{ color: "#374151" }}>PUT WALL  <span style={{ color: "#3399ff" }}>${putWall}</span></span>}
        {gammaFlip != null && <span style={{ color: "#374151" }}>γ FLIP <span style={{ color: "#a855f7" }}>${gammaFlip}</span></span>}
      </div>
    </div>
  );
}

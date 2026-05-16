import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js/dist/plotly";
import { calculateAllGreeks } from "@/lib/greeks/greekCalculations";
import type { OptionContract } from "@/lib/gex";

type Metric = "gex" | "dex" | "gexdex";

interface Props {
  contracts:     OptionContract[];
  spot:          number;
  symbol:        string;
  callWall?:     number;
  putWall?:      number;
  gammaFlip?:    number | null;
  defaultMetric?: Metric;
}

const MONO = "JetBrains Mono, ui-monospace, monospace";

// ── Shared diverging colorscale: cyan → dark → amber → yellow ───────
const CS_SHARED: [number, string][] = [
  [0.00, "#00d8ff"],
  [0.15, "#0055bb"],
  [0.30, "#001a44"],
  [0.50, "#0a0a0a"],
  [0.70, "#4a1200"],
  [0.85, "#cc5500"],
  [1.00, "#ffdd00"],
];

function fmtM(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

export function GexDexSurface3D({
  contracts, spot, symbol, callWall, putWall, gammaFlip, defaultMetric,
}: Props) {
  const divRef  = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<Metric>(defaultMetric ?? "gex");

  // ── Build Strike × DTE → value matrix ────────────────────────────
  const { strikeAxis, dteAxis, zMatrix, zMin, zMax, netTotal, callDom, putDom } = useMemo(() => {
    const map = new Map<string, number>();   // "strike|dte" → net value
    const strikeSet = new Set<number>();
    const dteSet    = new Set<number>();

    for (const c of contracts) {
      if (!c.oi || !c.strike || c.expiry == null) continue;
      if (Math.abs(c.strike / spot - 1) > 0.18) continue;   // ±18% window
      strikeSet.add(c.strike);
      dteSet.add(c.expiry);

      const sign  = c.type === "call" ? 1 : -1;
      const dte   = Math.max(c.expiry, 0.5);
      const ivUse = c.iv > 0 ? c.iv : 0.20;

      const g = calculateAllGreeks({ spot, strike: c.strike, dte, iv: ivUse, rate: 0.045, isCall: c.type === "call" });
      const gamma = (c.gamma != null && c.gamma !== 0) ? c.gamma : g.gamma;
      const delta = (c.delta != null && c.delta !== 0) ? c.delta : g.delta;
      const gexVal = sign * gamma * c.oi * spot * spot * 0.01;
      const dexVal = sign * delta * c.oi * spot;

      let val: number;
      if (metric === "gex")    val = gexVal;
      else if (metric === "dex") val = dexVal;
      else                     val = gexVal + dexVal;

      const key = `${c.strike}|${c.expiry}`;
      map.set(key, (map.get(key) ?? 0) + val);
    }

    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const dtes    = Array.from(dteSet).sort((a, b) => a - b);
    if (!strikes.length || !dtes.length) {
      return { strikeAxis: [], dteAxis: [], zMatrix: [], zMin: -1, zMax: 1, netTotal: 0, callDom: 0, putDom: 0 };
    }

    let gMin = Infinity, gMax = -Infinity;
    let netTotal = 0, callDom = 0, putDom = 0;

    const zMatrix = dtes.map(dte =>
      strikes.map(strike => {
        const v = map.get(`${strike}|${dte}`) ?? 0;
        netTotal += v;
        if (v > 0) callDom += v; else putDom += v;
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
        return v / 1e6;   // scale to millions for display
      })
    );

    return {
      strikeAxis: strikes,
      dteAxis: dtes,
      zMatrix,
      zMin: gMin === Infinity  ? -1 : gMin / 1e6,
      zMax: gMax === -Infinity ?  1 : gMax / 1e6,
      netTotal,
      callDom,
      putDom,
    };
  }, [contracts, spot, metric]);

  // ── Plotly render ────────────────────────────────────────────────
  useEffect(() => {
    const div = divRef.current;
    if (!div || !zMatrix.length || !strikeAxis.length || !dteAxis.length) return;

    const absMax = Math.max(Math.abs(zMin), Math.abs(zMax), 0.001);
    const label  = metric === "gex" ? "Net GEX ($M)" : metric === "dex" ? "Net DEX ($M)" : "Net GEX+DEX ($M)";
    const accent = "#ffdd00";
    const cs     = CS_SHARED;

    const surface = {
      type:       "surface" as const,
      x:          strikeAxis,
      y:          dteAxis,
      z:          zMatrix,
      colorscale: cs,
      cmin:       -absMax,
      cmax:        absMax,
      showscale:   true,
      connectgaps: true,
      colorbar: {
        title:     { text: label, font: { color: accent, size: 9, family: MONO }, side: "right" as const },
        tickfont:  { color: "#4b5563", size: 8, family: MONO },
        tickformat: ".1f",
        len: 0.75, thickness: 10, x: 0.97,
        bgcolor: "rgba(0,0,0,0)", bordercolor: "#1a1a1a",
      },
      lighting: {
        ambient:   0.78,
        diffuse:   0.92,
        specular:  0.45,
        roughness: 0.30,
        fresnel:   0.25,
      },
      lightposition: { x: 2000, y: -1500, z: 3000 },
      opacity: 0.96,
      contours: {
        z: { show: true, usecolormap: true, highlightcolor: "rgba(255,255,255,0.14)",
             project: { z: true }, width: 1 },           // projects contours onto floor
      },
      hovertemplate:
        `<b>Strike</b> $%{x:.0f}<br>` +
        `<b>DTE</b> %{y}d<br>` +
        `<b>${metric.toUpperCase()}</b> %{z:.3f}M<extra></extra>`,
    };

    // ── Zero-plane ────────────────────────────────────────────────
    const nS = strikeAxis.length;
    const nD = dteAxis.length;
    const zeroPlane = {
      type:       "surface" as const,
      x:          strikeAxis,
      y:          dteAxis,
      z:          Array.from({ length: nD }, () => Array(nS).fill(0)),
      colorscale: [[0, "rgba(255,255,255,0.06)"], [1, "rgba(255,255,255,0.06)"]] as [number, string][],
      showscale:   false,
      opacity:     1,
      hoverinfo:   "skip" as const,
      lighting:    { ambient: 1, diffuse: 0, specular: 0, roughness: 1, fresnel: 0 },
    };

    // ── Reference lines: Spot, Call Wall, Put Wall ────────────────
    const refLines: any[] = [];
    const lineStrikes: { strike: number; color: string; label: string }[] = [
      ...(callWall  ? [{ strike: callWall,  color: "#ffaa00", label: "CALL WALL" }] : []),
      ...(putWall   ? [{ strike: putWall,   color: "#3399ff", label: "PUT WALL"  }] : []),
      ...(gammaFlip != null ? [{ strike: gammaFlip, color: "#a855f7", label: "γ FLIP" }] : []),
      { strike: spot, color: "#22c55e", label: "SPOT" },
    ];
    for (const { strike, color, label: lbl } of lineStrikes) {
      if (strike < strikeAxis[0] || strike > strikeAxis[strikeAxis.length - 1]) continue;
      refLines.push({
        type:    "scatter3d" as const,
        mode:    "lines+text",
        x:       [strike, strike],
        y:       [dteAxis[0], dteAxis[dteAxis.length - 1]],
        z:       [-absMax * 0.05, absMax * 0.85],
        line:    { color, width: 3 },
        text:    ["", lbl],
        textfont: { color, size: 8, family: MONO },
        textposition: "top center" as const,
        showlegend:   false,
        hoverinfo:    "skip" as const,
      });
    }

    const axStyle = {
      gridcolor:       "#141414",
      zerolinecolor:   "#222222",
      tickfont:        { size: 8, color: "#4b5563", family: MONO },
      backgroundcolor: "#060606",
      showbackground:  true,
      showgrid:        true,
      showspikes:      false,
      linecolor:       "#1f1f1f",
    };

    const layout: any = {
      autosize: true,
      scene: {
        xaxis: { ...axStyle, title: { text: "Strike  ($)", font: { size: 9, color: "#374151" } }, tickprefix: "$" },
        yaxis: { ...axStyle, title: { text: "DTE  (days)", font: { size: 9, color: "#374151" } } },
        zaxis: { ...axStyle, title: { text: label,         font: { size: 9, color: accent      } }, ticksuffix: "M" },
        bgcolor:     "#000000",
        camera: {
          eye:    { x: 1.55, y: -2.0, z: 1.4 },
          up:     { x: 0,    y: 0,    z: 1   },
          center: { x: 0,    y: 0,    z: -0.1 },
        },
        dragmode:    "turntable",
        aspectmode:  "manual",
        aspectratio: { x: 2.0, y: 1.0, z: 0.65 },
      },
      margin:        { l: 0, r: 24, b: 0, t: 0 },
      paper_bgcolor: "#000000",
      plot_bgcolor:  "#000000",
      font:          { color: "#4b5563", family: MONO, size: 9 },
      hoverlabel: {
        bgcolor:     "#0d0d0d",
        bordercolor: accent,
        font:        { color: "#e0e0e0", family: MONO, size: 11 },
        namelength:  -1,
      },
      showlegend: false,
      uirevision: metric,
    };

    (Plotly as any).react(div, [surface, zeroPlane, ...refLines], layout, {
      displayModeBar:         true,
      modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "editInChartStudio"],
      displaylogo:            false,
      responsive:             true,
      scrollZoom:             true,
    });

    const ro = new ResizeObserver(() => (Plotly as any).Plots.resize(div));
    ro.observe(div);
    return () => {
      ro.disconnect();
      try { (Plotly as any).purge(div); } catch (_) {}
    };
  }, [strikeAxis, dteAxis, zMatrix, metric, zMin, zMax, spot, callWall, putWall, gammaFlip]);

  const nS     = strikeAxis.length;
  const nD     = dteAxis.length;
  const isPos  = netTotal >= 0;
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
            <button
              key={m}
              onClick={() => setMetric(m)}
              style={{
                fontFamily: MONO, fontSize: 9, padding: "2px 10px",
                borderRadius: 3, letterSpacing: "0.12em",
                textTransform: "uppercase" as const, cursor: "pointer",
                background: metric === m ? "#ffdd0022" : "transparent",
                color:      metric === m ? "#ffdd00"   : "#2a2a2a",
                border:     metric === m ? "1px solid #ffdd0066" : "1px solid #1a1a1a",
                fontWeight: metric === m ? 700 : 400,
                transition: "all 0.12s",
              }}
            >
              {m === "gexdex" ? "GEX+DEX" : m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Surface ────────────────────────────────────────────── */}
      {nS === 0 || nD === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: MONO, fontSize: 11, color: "#1f2937" }}>
          No contract data available…
        </div>
      ) : (
        <div ref={divRef} style={{ flex: 1, minHeight: 0 }} />
      )}

      {/* ── Footer legend ──────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "4px 12px", borderTop: "1px solid #0d0d0d",
                    display: "flex", alignItems: "center", gap: 16,
                    background: "#050505", fontFamily: MONO, fontSize: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: "linear-gradient(90deg, #00d8ff, #0a0a0a, #ffdd00)" }} />
          <span style={{ color: "#1f2937" }}>PUT ← 0 → CALL</span>
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

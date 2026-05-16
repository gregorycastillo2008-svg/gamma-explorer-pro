import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js/dist/plotly";
import { calculateAllGreeks } from "@/lib/greeks/greekCalculations";
import type { OptionContract } from "@/lib/gex";

type Metric = "gex" | "dex" | "gexdex";
type ViewPreset = "iso" | "top" | "side";
type CmapKey = "sabana" | "rdbu" | "plasma" | "viridis";

interface Props {
  contracts:      OptionContract[];
  spot:           number;
  symbol:         string;
  callWall?:      number;
  putWall?:       number;
  gammaFlip?:     number | null;
  defaultMetric?: Metric;
}

const MONO = "'Courier New', monospace";

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

const CMAPS: Record<CmapKey, string | [number, string][]> = {
  sabana: CS_SABANA,
  rdbu:   "RdBu",
  plasma: "Plasma",
  viridis:"Viridis",
};

const VIEW_EYES: Record<ViewPreset, { x: number; y: number; z: number }> = {
  iso:  { x: 1.5,  y: -1.7, z: 1.0 },
  top:  { x: 0,    y: 0,    z: 2.5 },
  side: { x: 2.2,  y: 0,    z: 0.3 },
};

const METRIC_CFG: Record<Metric, { color: string; bg: string; border: string; label: string }> = {
  gex:    { color: "#34d399", bg: "#021a0f", border: "#064e3b", label: "GEX"     },
  dex:    { color: "#60a5fa", bg: "#0c1a3a", border: "#1d4ed8", label: "DEX"     },
  gexdex: { color: "#a78bfa", bg: "#1a0c3a", border: "#6d28d9", label: "GEX+DEX" },
};

function fmtVal(v: number): string {
  const s = v >= 0 ? "+" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(v / 1e3).toFixed(0)}K`;
  return `${s}${v.toFixed(0)}`;
}

export function GexDexSurfaceAlt({
  contracts, spot, symbol, callWall, putWall, gammaFlip, defaultMetric,
}: Props) {
  const divRef  = useRef<HTMLDivElement>(null);
  const eyeRef  = useRef<{ x: number; y: number; z: number }>(VIEW_EYES.iso);
  const [metric, setMetric] = useState<Metric>(defaultMetric ?? "gex");
  const [view,   setView]   = useState<ViewPreset>("iso");
  const [cmap,   setCmap]   = useState<CmapKey>("sabana");

  // ── Build all three matrices in one pass ────────────────────────
  const { strikeAxis, dteAxis, gexMatrix, dexMatrix, expCount } = useMemo(() => {
    const gexMap = new Map<string, number>();
    const dexMap = new Map<string, number>();
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

      const key = `${c.strike}|${c.expiry}`;
      gexMap.set(key, (gexMap.get(key) ?? 0) + sign * gamma * c.oi * spot * spot * 0.01);
      dexMap.set(key, (dexMap.get(key) ?? 0) + sign * delta * c.oi * spot);
    }

    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const dtes    = Array.from(dteSet).sort((a, b) => a - b);
    if (!strikes.length || !dtes.length) {
      return { strikeAxis: [], dteAxis: [], gexMatrix: [], dexMatrix: [], expCount: 0 };
    }

    const gexMatrix = dtes.map(dte =>
      strikes.map(strike => (gexMap.get(`${strike}|${dte}`) ?? 0) / 1e6)
    );
    const dexMatrix = dtes.map(dte =>
      strikes.map(strike => (dexMap.get(`${strike}|${dte}`) ?? 0) / 1e6)
    );

    return { strikeAxis: strikes, dteAxis: dtes, gexMatrix, dexMatrix, expCount: dtes.length };
  }, [contracts, spot]);

  // Select active z-matrix
  const zMatrix = metric === "gex"
    ? gexMatrix
    : metric === "dex"
    ? dexMatrix
    : gexMatrix.map((row, i) => row.map((v, j) => v + dexMatrix[i][j]));

  // ── Stats derived from selected matrix ──────────────────────────
  const { netTotal, callDom, putDom, flipLevel } = useMemo(() => {
    if (!zMatrix.length || !strikeAxis.length)
      return { netTotal: 0, callDom: 0, putDom: 0, flipLevel: null as number | null };

    let net = 0, pos = 0, neg = 0;
    const strikeSum = new Map<number, number>();

    zMatrix.forEach((row, _di) => {
      row.forEach((v, si) => {
        net += v;
        if (v > 0) pos += v; else neg += v;
        const k = strikeAxis[si];
        strikeSum.set(k, (strikeSum.get(k) ?? 0) + v);
      });
    });

    let flipStrike: number | null = null;
    let minAbs = Infinity;
    strikeSum.forEach((sum, strike) => {
      if (Math.abs(sum) < minAbs) { minAbs = Math.abs(sum); flipStrike = strike; }
    });

    return { netTotal: net, callDom: pos, putDom: neg, flipLevel: flipStrike };
  }, [zMatrix, strikeAxis]);

  // ── Plotly render ───────────────────────────────────────────────
  useEffect(() => {
    const div = divRef.current;
    if (!div || !zMatrix.length || !strikeAxis.length) return;

    const cs        = CMAPS[cmap];
    const cfg       = METRIC_CFG[metric];
    const modeName  = cfg.label;
    const nS        = strikeAxis.length;
    const nD        = dteAxis.length;

    const surface: any = {
      type:        "surface",
      x:           strikeAxis,
      y:           dteAxis,
      z:           zMatrix,
      colorscale:  cs,
      showscale:   true,
      opacity:     1.0,
      lighting: {
        ambient:   0.85,
        diffuse:   0.95,
        specular:  0.05,
        roughness: 1.0,
        fresnel:   0.0,
      },
      lightposition: { x: 0, y: 0, z: 3000 },
      contours: {
        z: { show: true, usecolormap: false, color: "rgba(255,255,255,0.22)", width: 2, project: { z: false } },
        x: { show: false },
        y: { show: false },
      },
      hovertemplate: `Strike: <b>$%{x:.0f}</b><br>DTE: %{y}d<br>${modeName}: %{z:.2f}M<extra></extra>`,
      colorbar: {
        len: 0.70, thickness: 9, x: 1.01,
        tickfont:   { color: "#374151", size: 9, family: MONO },
        ticksuffix: "M",
        title: {
          text: `${modeName} ($M)`,
          font: { color: cfg.color, size: 10, family: MONO },
          side: "right",
        },
      },
    };

    const zeroPlane: any = {
      type:       "surface",
      x:          [strikeAxis[0], strikeAxis[nS - 1]],
      y:          [dteAxis[0], dteAxis[nD - 1]],
      z:          [[0, 0], [0, 0]],
      showscale:  false,
      opacity:    0.06,
      colorscale: [[0, "#ffffff"], [1, "#ffffff"]],
      hoverinfo:  "skip",
      lighting:   { ambient: 1, diffuse: 0, specular: 0 },
      contours:   { z: { show: false }, x: { show: false }, y: { show: false } },
    };

    const layout: any = {
      paper_bgcolor: "#04050d",
      plot_bgcolor:  "#04050d",
      margin: { l: 0, r: 60, t: 8, b: 0 },
      scene: {
        camera:   { eye: eyeRef.current, up: { x: 0, y: 0, z: 1 } },
        bgcolor:  "#04050d",
        aspectmode:  "manual",
        aspectratio: { x: 2.0, y: 1.0, z: 0.65 },
        xaxis: {
          title:           { text: "Strike", font: { color: "#4b5563", size: 10 } },
          gridcolor:       "#0d1117",
          zerolinecolor:   "#141824",
          tickfont:        { color: "#374151", size: 9 },
          showbackground:  true,
          backgroundcolor: "#070910",
          tickprefix:      "$",
        },
        yaxis: {
          title:           { text: "DTE (days)", font: { color: "#4b5563", size: 10 } },
          gridcolor:       "#0d1117",
          zerolinecolor:   "#141824",
          tickfont:        { color: "#374151", size: 9 },
          showbackground:  true,
          backgroundcolor: "#070910",
        },
        zaxis: {
          title:           { text: `${modeName} ($M)`, font: { color: cfg.color, size: 10 } },
          gridcolor:       "#0d1117",
          zerolinecolor:   "#141824",
          tickfont:        { color: "#374151", size: 9 },
          showbackground:  true,
          backgroundcolor: "#070910",
          ticksuffix:      "M",
        },
      },
      showlegend:  false,
      uirevision:  `${metric}-${cmap}`,
    };

    (Plotly as any).react(div, [surface, zeroPlane], layout, {
      displayModeBar:         true,
      modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "editInChartStudio"],
      displaylogo:            false,
      responsive:             true,
      scrollZoom:             true,
    });

    const onRelayout = (e: any) => {
      if (e?.["scene.camera.eye"]) eyeRef.current = e["scene.camera.eye"];
    };
    (div as any).on?.("plotly_relayout", onRelayout);

    const ro = new ResizeObserver(() => (Plotly as any).Plots.resize(div));
    ro.observe(div);
    return () => {
      ro.disconnect();
      try { (Plotly as any).purge(div); } catch (_) {}
    };
  }, [strikeAxis, dteAxis, zMatrix, metric, cmap]);

  // Handle view preset clicks
  const handleView = (v: ViewPreset) => {
    setView(v);
    eyeRef.current = VIEW_EYES[v];
    const div = divRef.current;
    if (div) (Plotly as any).relayout(div, { "scene.camera.eye": VIEW_EYES[v] });
  };

  const nS  = strikeAxis.length;
  const cfg = METRIC_CFG[metric];

  // ── Button style helper ─────────────────────────────────────────
  const btnBase: React.CSSProperties = {
    fontFamily: MONO, fontSize: 9, padding: "2px 8px",
    borderRadius: 4, cursor: "pointer", transition: "all 0.15s",
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
                  background: "#04050d", border: "1px solid #141824", borderRadius: 6, overflow: "hidden" }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 14px 0", display: "flex", alignItems: "center",
                    justifyContent: "space-between", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
        {/* Left: title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#34d399", letterSpacing: "1.5px" }}>
            GEX·DEX
          </span>
          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4,
                         background: "#020d07", color: "#34d399", border: "1px solid #064e3b", fontFamily: MONO }}>
            3D SURFACE
          </span>
          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4,
                         background: "#0d1117", color: "#4b5563", border: "1px solid #1a1f2e", fontFamily: MONO }}>
            ∂²C/∂S²
          </span>
          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4,
                         background: "#0d1117", color: "#374151", border: "1px solid #1a1f2e", fontFamily: MONO }}>
            {symbol} · ${spot}
          </span>
        </div>

        {/* Right: controls */}
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          {/* View presets */}
          <span style={{ fontFamily: MONO, fontSize: 8, color: "#374151" }}>VIEW</span>
          {(["iso", "top", "side"] as ViewPreset[]).map(v => (
            <button key={v} onClick={() => handleView(v)} style={{
              ...btnBase,
              background:   view === v ? "#021a0f" : "#0d1117",
              color:        view === v ? "#34d399" : "#4b5563",
              border:       `1px solid ${view === v ? "#064e3b" : "#1a1f2e"}`,
            }}>
              {v.toUpperCase()}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: "#141824", margin: "0 2px" }} />

          {/* Metric toggle */}
          <span style={{ fontFamily: MONO, fontSize: 8, color: "#374151" }}>MODE</span>
          {(Object.entries(METRIC_CFG) as [Metric, typeof METRIC_CFG[Metric]][]).map(([m, c]) => (
            <button key={m} onClick={() => setMetric(m)} style={{
              ...btnBase,
              background: metric === m ? c.bg     : "#0d1117",
              color:      metric === m ? c.color  : "#4b5563",
              border:     `1px solid ${metric === m ? c.border : "#1a1f2e"}`,
              fontWeight: metric === m ? 700 : 400,
            }}>
              {c.label}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: "#141824", margin: "0 2px" }} />

          {/* Colormap */}
          <select value={cmap} onChange={e => setCmap(e.target.value as CmapKey)} style={{
            fontFamily: MONO, fontSize: 9, padding: "2px 5px",
            background: "#0d1117", color: "#6b7280",
            border: "1px solid #1a1f2e", borderRadius: 4, cursor: "pointer",
          }}>
            <option value="sabana">CMAP · sábana</option>
            <option value="rdbu">CMAP · RdBu</option>
            <option value="plasma">CMAP · Plasma</option>
            <option value="viridis">CMAP · Viridis</option>
          </select>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 4px", flexWrap: "wrap", flexShrink: 0 }}>
        {[
          { label: `NET ${cfg.label}`, val: fmtVal(netTotal), color: cfg.color },
          { label: "CALL",        val: fmtVal(callDom),  color: "#6ee7b7" },
          { label: "PUT",         val: fmtVal(putDom),   color: "#fca5a5" },
          { label: "FLIP LEVEL",  val: flipLevel != null ? `$${flipLevel}` : "–", color: "#fbbf24" },
          { label: "EXPIRIES",    val: String(expCount),  color: "#93c5fd" },
          ...(callWall  ? [{ label: "CALL WALL", val: `$${callWall}`,  color: "#fbbf24" }] : []),
          ...(putWall   ? [{ label: "PUT WALL",  val: `$${putWall}`,   color: "#93c5fd" }] : []),
          ...(gammaFlip != null ? [{ label: "γ FLIP", val: `$${gammaFlip}`, color: "#a78bfa" }] : []),
        ].map(s => (
          <div key={s.label} style={{ background: "#0a0c14", border: "1px solid #141824",
                                       borderRadius: 6, padding: "5px 10px", textAlign: "center", minWidth: 78 }}>
            <div style={{ fontFamily: MONO, fontSize: 8, color: "#374151", letterSpacing: "0.8px", marginBottom: 2 }}>
              {s.label}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: s.color }}>
              {s.val}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chart ─────────────────────────────────────────────────── */}
      {nS === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: MONO, fontSize: 11, color: "#1f2937" }}>
          No contract data available…
        </div>
      ) : (
        <div ref={divRef} style={{ flex: 1, minHeight: 0 }} />
      )}
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { OptionContract, DemoTicker, computeExposures, formatNumber } from "@/lib/gex";
import { Panel } from "./Panel";

type View = "heatmap" | "strike" | "surface";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
  metric: "netGex" | "dex";
}

// ────────────────────────── COLOR HELPERS ──────────────────────────
// Heatmap: pure black for 0, emerald neon for positive, crimson for negative.
function heatBg(value: number, max: number): string {
  if (max <= 0 || value === 0) return "#000000";
  const t = Math.min(1, Math.abs(value) / max);
  const a = Math.pow(t, 0.55);
  if (value > 0) {
    // emerald neon → #00ff88
    return `rgb(${Math.round(0)},${Math.round(255 * a)},${Math.round(136 * a)})`;
  }
  // crimson → #ff3344
  return `rgb(${Math.round(255 * a)},${Math.round(51 * a)},${Math.round(68 * a)})`;
}

function heatFg(value: number, max: number): string {
  const t = max > 0 ? Math.abs(value) / max : 0;
  return t > 0.55 ? "#000000" : "#e5e7eb";
}

// 3D Surface: thermal colormap (blue → cyan → green → yellow → red)
function jet(t: number): [number, number, number] {
  // t in [0,1]
  const stops = [
    [0.0, 0.05, 0.18, 0.55],   // deep blue
    [0.25, 0.0, 0.78, 0.95],   // cyan
    [0.5, 0.0, 0.95, 0.35],    // green
    [0.75, 1.0, 0.85, 0.0],    // yellow
    [1.0, 1.0, 0.18, 0.18],    // red
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ar, ag, ab] = stops[i];
    const [b, br, bg, bb] = stops[i + 1];
    if (t >= a && t <= b) {
      const k = (t - a) / (b - a);
      return [ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k];
    }
  }
  return [stops[stops.length - 1][1], stops[stops.length - 1][2], stops[stops.length - 1][3]];
}

function jetCss(t: number): string {
  const [r, g, b] = jet(Math.max(0, Math.min(1, t)));
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

// ────────────────────────── HEATMAP ──────────────────────────
export function HeatmapGridView({ ticker, contracts, metric }: Props) {
  const { strikes, expiries, grid, max, peakPos, peakNeg } = useMemo(() => {
    const expSet = Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b);
    const perExp = new Map<number, Map<number, number>>();
    for (const exp of expSet) {
      const subset = contracts.filter((c) => c.expiry === exp);
      const points = computeExposures(ticker.spot, subset);
      const m = new Map<number, number>();
      for (const p of points) m.set(p.strike, p[metric]);
      perExp.set(exp, m);
    }
    const strikeSet = Array.from(new Set(contracts.map((c) => c.strike))).sort((a, b) => b - a);
    let mx = 0;
    let pPos = { strike: NaN, expiry: NaN, value: -Infinity };
    let pNeg = { strike: NaN, expiry: NaN, value: Infinity };
    for (const [exp, m] of perExp.entries()) {
      for (const [s, v] of m.entries()) {
        if (Math.abs(v) > mx) mx = Math.abs(v);
        if (v > pPos.value) pPos = { strike: s, expiry: exp, value: v };
        if (v < pNeg.value) pNeg = { strike: s, expiry: exp, value: v };
      }
    }
    return { strikes: strikeSet, expiries: expSet, grid: perExp, max: mx, peakPos: pPos, peakNeg: pNeg };
  }, [ticker, contracts, metric]);

  return (
    <div className="bg-black rounded overflow-auto h-full" style={{ scrollbarColor: "#1a1a1a #000" }}>
      <table className="w-full font-jetbrains text-[11px]" style={{ borderCollapse: "collapse" }}>
        <thead className="sticky top-0 z-20">
          <tr>
            <th
              className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.15em] text-[#6b7280] sticky left-0 z-30"
              style={{ background: "#000" }}
            >
              Strike / DTE
            </th>
            {expiries.map((e) => (
              <th
                key={e}
                className="px-3 py-2 text-[9px] uppercase tracking-[0.15em] text-[#6b7280] text-right"
                style={{ background: "#000", minWidth: 78 }}
              >
                {e}D
              </th>
            ))}
          </tr>
          <tr>
            <th colSpan={expiries.length + 1} style={{ background: "#000", padding: 0 }}>
              <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #1a1a1a, transparent)" }} />
            </th>
          </tr>
        </thead>
        <tbody>
          {strikes.map((s) => {
            const isSpot = Math.abs(s - ticker.spot) < ticker.strikeStep / 2;
            return (
              <tr
                key={s}
                style={
                  isSpot
                    ? {
                        outline: "1px solid #00ffff",
                        outlineOffset: "-1px",
                        boxShadow: "0 0 14px rgba(0,255,255,0.35) inset",
                      }
                    : undefined
                }
              >
                <td
                  className={`px-3 py-1.5 sticky left-0 text-right z-10 ${isSpot ? "font-bold" : ""}`}
                  style={{
                    background: "#000",
                    color: isSpot ? "#00ffff" : "#9ca3af",
                    borderRight: "1px solid #0a0a0a",
                  }}
                >
                  {isSpot && <span className="mr-1.5 text-[#00ffff]">●</span>}${s}
                </td>
                {expiries.map((e) => {
                  const v = grid.get(e)?.get(s) ?? 0;
                  const bg = heatBg(v, max);
                  const fg = heatFg(v, max);
                  const isPeakPos = s === peakPos.strike && e === peakPos.expiry && v > 0;
                  const isPeakNeg = s === peakNeg.strike && e === peakNeg.expiry && v < 0;
                  const isPeak = isPeakPos || isPeakNeg;
                  return (
                    <td
                      key={e}
                      className="px-3 py-1.5 text-right transition-colors duration-200 cursor-default relative"
                      style={{
                        background: bg,
                        color: isPeak ? "#ffffff" : fg,
                        borderRight: "1px solid rgba(255,255,255,0.02)",
                        borderBottom: "1px solid rgba(255,255,255,0.02)",
                        textShadow: v !== 0 && Math.abs(v) / max > 0.55 ? "none" : "0 0 6px rgba(0,0,0,0.6)",
                        fontWeight: isPeak ? 800 : Math.abs(v) / max > 0.6 ? 600 : 400,
                        outline: isPeak ? "2px solid #ffffff" : undefined,
                        outlineOffset: isPeak ? "-2px" : undefined,
                        boxShadow: isPeakPos
                          ? "inset 0 0 12px rgba(0,255,136,0.6), 0 0 8px rgba(0,255,136,0.4)"
                          : isPeakNeg
                            ? "inset 0 0 12px rgba(255,77,77,0.6), 0 0 8px rgba(255,77,77,0.4)"
                            : undefined,
                      }}
                      title={`Strike $${s} · ${e}DTE · ${formatNumber(v)}${isPeakPos ? " · ★ MAX +Γ" : isPeakNeg ? " · ★ MAX −Γ" : ""}`}
                    >
                      {isPeak && <span className="absolute top-0.5 left-1 text-[9px]">★</span>}
                      {v === 0 ? <span className="text-[#222]">·</span> : formatNumber(v, 1)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────── STRIKE CHART ──────────────────────────
export function StrikeChartView({ ticker, contracts, metric }: Props) {
  const data = useMemo(() => {
    const points = computeExposures(ticker.spot, contracts);
    return points.slice().sort((a, b) => b.strike - a.strike);
  }, [ticker, contracts]);

  const max = Math.max(...data.map((d) => Math.abs(d[metric])), 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ strike: number; value: number; x: number; y: number } | null>(null);

  // Detect spot row index + max positive / max negative strikes
  const spotIdx = data.findIndex((p) => Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2);
  const maxPosStrike = data.reduce((m, p) => (p[metric] > (m?.[metric] ?? -Infinity) ? p : m), null as null | (typeof data)[number])?.strike;
  const maxNegStrike = data.reduce((m, p) => (p[metric] < (m?.[metric] ?? Infinity) ? p : m), null as null | (typeof data)[number])?.strike;
  const sym = metric === "netGex" ? "Γ" : "Δ";

  // Build symmetric x-axis ticks
  const axisMax = Math.max(max, 1);
  // Round up to a "nice" number (1k, 2k, 5k, 10k, ...)
  const niceMax = (() => {
    const exp = Math.pow(10, Math.floor(Math.log10(axisMax)));
    const n = axisMax / exp;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * exp;
  })();
  const ticks = [-niceMax, -niceMax / 2, 0, niceMax / 2, niceMax];

  return (
    <div
      className="relative bg-black rounded border border-border h-full flex flex-col overflow-hidden"
      onMouseLeave={() => setHover(null)}
    >
      {/* Header bar with title + ALL/NET pseudo tabs (visual only) */}
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center gap-3 shrink-0">
        <span className="font-jetbrains text-[10px] uppercase tracking-[0.2em] text-[#9ca3af] font-bold">
          {metric === "netGex" ? "GAMMAEX" : "DELTAEX"} ↓ ALL ↓ NET
        </span>
      </div>

      {/* Scroll body: strike column (left) + bar chart (right) */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 relative overflow-y-scroll overscroll-contain touch-pan-y"
        onWheel={(e) => {
          e.stopPropagation();
          if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
        }}
        style={{ scrollbarColor: "#3a3a3a #000", scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" as any }}
      >
        <div className="grid grid-cols-[72px_1fr] relative min-h-max">
          {/* LEFT: strike price column */}
          <div className="flex flex-col">
            {data.map((p) => {
              const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
              return (
                <div
                  key={p.strike}
                  className={`font-jetbrains text-[11px] flex items-center justify-end pr-3 ${
                    isSpot ? "text-[#7dd3fc] font-bold" : "text-[#9ca3af]"
                  }`}
                  style={{ height: 22 }}
                >
                  ${p.strike}
                </div>
              );
            })}
          </div>

          {/* RIGHT: bar chart canvas */}
          <div className="relative">
            {/* Vertical zero line */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#2a2a2a]" />
            {/* Reference half-tick lines */}
            {[0.25, 0.75].map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 w-px bg-[#141414]"
                style={{ left: `${t * 100}%` }}
              />
            ))}

            {/* SPOT horizontal dashed line (purple/blue) */}
            {spotIdx >= 0 && data.length > 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20"
                style={{ top: `${(spotIdx + 0.5) * 22}px` }}
              >
                <div
                  className="h-px"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, #a78bfa 0 6px, transparent 6px 12px)",
                    boxShadow: "0 0 6px #a78bfa, 0 0 12px #a78bfa55",
                  }}
                />
                <div
                  className="absolute -top-2.5 font-jetbrains text-[9px] px-1.5 py-0.5 rounded font-semibold"
                  style={{
                    left: "52%",
                    background: "#a78bfa22",
                    color: "#c4b5fd",
                    border: "1px solid #a78bfa66",
                  }}
                >
                  SPOT ${ticker.spot}
                </div>
              </div>
            )}

            {/* Bars */}
            {data.map((p) => {
              const v = p[metric];
              const w = (Math.abs(v) / niceMax) * 50; // half-width percent
              const isHover = hover?.strike === p.strike;
              const isPos = v >= 0;
              const color = isPos ? "#86efac" : "#fca5a5"; // pastel green / red
              const colorStrong = isPos ? "#22c55e" : "#ef4444";
              return (
                <div
                  key={p.strike}
                  onMouseMove={(e) => {
                    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    setHover({ strike: p.strike, value: v, x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                  className={`relative cursor-crosshair ${isHover ? "bg-white/[0.04]" : ""}`}
                  style={{ height: 22 }}
                >
                  {v !== 0 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2"
                      style={{
                        height: 14,
                        width: `${w}%`,
                        left: isPos ? "50%" : `${50 - w}%`,
                        background: isHover ? colorStrong : color,
                        borderRadius: isPos ? "2px 4px 4px 2px" : "4px 2px 2px 4px",
                        boxShadow: isHover ? `0 0 10px ${colorStrong}88` : "none",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis numeric scale */}
      <div className="grid grid-cols-[72px_1fr] border-t border-[#1a1a1a] shrink-0">
        <div />
        <div className="relative h-6 font-jetbrains text-[9px] text-[#6b7280]">
          {ticks.map((t, i) => {
            const pct = ((t + niceMax) / (niceMax * 2)) * 100;
            return (
              <span
                key={i}
                className="absolute top-1.5 -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {t === 0 ? "0" : `${t > 0 ? "" : "-"}${formatNumber(Math.abs(t), 1)}`}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-30 bg-black/95 backdrop-blur border border-[#1f1f1f] rounded px-3 py-2 font-jetbrains text-[11px] shadow-2xl"
            style={{
              left: Math.min(hover.x + 90, 9999),
              top: hover.y + 30,
              boxShadow: "0 0 20px rgba(167,139,250,0.2)",
            }}
          >
            <div className="text-[9px] uppercase tracking-[0.18em] text-[#6b7280] mb-1">Strike</div>
            <div className="text-[#7dd3fc] text-sm font-bold">${hover.strike}</div>
            <div className="mt-1" style={{ color: hover.value >= 0 ? "#22c55e" : "#ef4444" }}>
              {sym} {formatNumber(hover.value)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ────────────────────────── 3D SURFACE ──────────────────────────
function FloorGrid() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(14, 28, 0x1a4d4d, 0x0d2626);
    (g.material as THREE.Material).transparent = true;
    (g.material as THREE.Material).opacity = 0.45;
    g.position.y = -0.005;
    return g;
  }, []);
  return <primitive object={grid} />;
}

function Surface3D({
  strikes,
  expiries,
  values,
  max,
  onHover,
}: {
  strikes: number[];
  expiries: number[];
  values: number[][];
  max: number;
  onHover: (info: { strike: number; expiry: number; value: number } | null) => void;
}) {
  const geometry = useMemo(() => {
    const w = strikes.length;
    const h = expiries.length;
    const sizeX = 12;
    const sizeY = 8;
    const geo = new THREE.PlaneGeometry(sizeX, sizeY, w - 1, h - 1);
    const colors: number[] = [];
    const pos = geo.attributes.position;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        const v = values[j]?.[i] ?? 0;
        const z = max > 0 ? (v / max) * 3 : 0;
        pos.setZ(idx, z);
        // thermal colormap based on signed normalized magnitude
        const t = max > 0 ? (v / max + 1) / 2 : 0.5; // 0..1, 0.5 = neutral
        // For pure GEX we re-map: negatives → cool blue side, positives → warm side
        const tt = max > 0 ? Math.max(0, Math.min(1, (v / max + 1) / 2)) : 0.5;
        const [r, g, b] = jet(tt);
        // boost vertical highlights
        const intensity = 0.6 + 0.4 * Math.abs(v / Math.max(max, 1));
        colors.push(r * intensity, g * intensity, b * intensity);
      }
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [strikes, expiries, values, max]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 6]} intensity={0.9} />
      <directionalLight position={[-6, 4, -4]} intensity={0.35} color="#00bbff" />
      <pointLight position={[0, 6, 0]} intensity={0.4} color="#ffffff" />

      <FloorGrid />

      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2.4, 0, 0]}
        onPointerMove={(e) => {
          const face = e.face;
          if (!face) return;
          const w = strikes.length;
          const i = face.a % w;
          const j = Math.floor(face.a / w);
          const v = values[j]?.[i] ?? 0;
          onHover({ strike: strikes[i], expiry: expiries[j], value: v });
        }}
        onPointerOut={() => onHover(null)}
      >
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading={false} metalness={0.15} roughness={0.55} />
      </mesh>

      <mesh geometry={geometry} rotation={[-Math.PI / 2.4, 0, 0]}>
        <meshBasicMaterial wireframe color="#ffffff" transparent opacity={0.06} />
      </mesh>

      <OrbitControls enablePan enableZoom enableRotate makeDefault />
    </>
  );
}

export function SurfaceView({ ticker, contracts, metric }: Props) {
  const [hover, setHover] = useState<{ strike: number; expiry: number; value: number } | null>(null);

  const { strikes, expiries, values, max } = useMemo(() => {
    const expSet = Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b);
    const strikeSet = Array.from(new Set(contracts.map((c) => c.strike))).sort((a, b) => a - b);
    const grid: number[][] = [];
    let mx = 0;
    for (const e of expSet) {
      const subset = contracts.filter((c) => c.expiry === e);
      const points = computeExposures(ticker.spot, subset);
      const m = new Map<number, number>();
      for (const p of points) m.set(p.strike, p[metric]);
      const row = strikeSet.map((s) => m.get(s) ?? 0);
      for (const v of row) mx = Math.max(mx, Math.abs(v));
      grid.push(row);
    }
    return { strikes: strikeSet, expiries: expSet, values: grid, max: mx };
  }, [ticker, contracts, metric]);

  const legendStops = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative bg-black rounded border border-border h-[400px] overflow-hidden">
      <Canvas camera={{ position: [10, 8, 10], fov: 45 }} style={{ background: "#000" }}>
        <Surface3D strikes={strikes} expiries={expiries} values={values} max={max} onHover={setHover} />
      </Canvas>

      {/* Top-left meta */}
      <div className="absolute top-3 left-3 font-jetbrains text-[10px] text-[#6b7280] uppercase tracking-[0.2em] pointer-events-none">
        {ticker.symbol} · {metric === "netGex" ? "Gamma" : "Delta"} Surface
      </div>
      <div className="absolute bottom-3 left-3 font-jetbrains text-[9px] text-[#4b5563] uppercase tracking-[0.18em] pointer-events-none">
        X strikes · Y dte · Z magnitude
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-3 right-3 bg-black/90 backdrop-blur border border-[#1f1f1f] rounded px-3 py-2 font-jetbrains text-[11px] shadow-2xl pointer-events-none"
          >
            <div className="text-[9px] uppercase tracking-[0.18em] text-[#6b7280] mb-1">Surface point</div>
            <div className="text-[#e5e7eb]">Strike <span className="text-[#00ffff]">${hover.strike}</span></div>
            <div className="text-[#e5e7eb]">DTE <span className="text-[#00ffff]">{hover.expiry}D</span></div>
            <div style={{ color: hover.value >= 0 ? "#00ff88" : "#ff4d4d" }}>
              {metric === "netGex" ? "Γ" : "Δ"} {formatNumber(hover.value)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vertical thermal legend */}
      <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-stretch gap-2 pointer-events-none">
        <div className="flex flex-col justify-between font-jetbrains text-[9px] text-[#6b7280]">
          <span>HIGH</span>
          <span>MID</span>
          <span>LOW</span>
        </div>
        <div
          className="w-3 rounded"
          style={{
            height: 140,
            background: `linear-gradient(to top, ${jetCss(0)}, ${jetCss(0.25)}, ${jetCss(0.5)}, ${jetCss(0.75)}, ${jetCss(1)})`,
            boxShadow: "0 0 10px rgba(0,255,255,0.15)",
          }}
        />
      </div>
    </div>
  );
}

// ────────────────────────── EXPORTED PANELS ──────────────────────────
// Standalone heatmap panel
export function GexHeatmapPanel(props: Props) {
  return (
    <Panel
      title="Heatmap Matrix"
      subtitle={`${props.ticker.symbol} · ${props.metric === "netGex" ? "GEX" : "DEX"} per strike × DTE`}
      noPad
    >
      <div className="p-2 bg-black">
        <HeatmapGridView {...props} />
      </div>
    </Panel>
  );
}

// Standalone strike chart panel
export function GexStrikeChartPanel(props: Props) {
  return (
    <Panel
      title="Strike Distribution"
      subtitle={`${props.ticker.symbol} · ${props.metric === "netGex" ? "Gamma" : "Delta"} per strike · negative ← → positive`}
      noPad
    >
      <div className="p-2 bg-black">
        <StrikeChartView {...props} />
      </div>
    </Panel>
  );
}

// Standalone 3D surface panel
export function GexSurfacePanel(props: Props) {
  return (
    <Panel
      title="3D Surface Projection"
      subtitle={`${props.ticker.symbol} · thermal colormap · drag to rotate`}
      noPad
    >
      <div className="p-2 bg-black">
        <SurfaceView {...props} />
      </div>
    </Panel>
  );
}

// Tab switcher (kept for backward compat / overview view)
export function GexExposureTabs(props: Props) {
  const [view, setView] = useState<View>("heatmap");
  const tabs: { key: View; label: string }[] = [
    { key: "heatmap", label: "HEATMAP" },
    { key: "strike", label: "STRIKE CHART" },
    { key: "surface", label: "3D SURFACE" },
  ];

  return (
    <Panel
      title="GEX Exposure Matrix"
      subtitle={`${props.ticker.symbol} · ${props.metric === "netGex" ? "Gamma" : "Delta"} exposure`}
      right={
        <div className="flex gap-0.5 bg-black/60 border border-border rounded p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`relative px-3 py-1 text-[10px] font-jetbrains uppercase tracking-[0.18em] rounded transition-colors ${
                view === t.key ? "text-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {view === t.key && (
                <motion.div
                  layoutId="gex-tab-bg"
                  className="absolute inset-0 rounded"
                  style={{ background: "#00ff88" }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {view === "heatmap" && <HeatmapGridView {...props} />}
          {view === "strike" && <StrikeChartView {...props} />}
          {view === "surface" && <SurfaceView {...props} />}
        </motion.div>
      </AnimatePresence>
    </Panel>
  );
}

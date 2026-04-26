import { useMemo, useState } from "react";
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

// ────── color helpers ──────
// Black neutral, intense green positive, intense red negative
function gexBg(value: number, max: number): string {
  if (max <= 0 || value === 0) return "rgb(0,0,0)";
  const t = Math.min(1, Math.abs(value) / max);
  // ease so small values stay dark
  const a = Math.pow(t, 0.55);
  if (value > 0) {
    // toward #00ff88
    const r = Math.round(0 * a);
    const g = Math.round(255 * a);
    const b = Math.round(136 * a);
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(255 * a);
  const g = Math.round(77 * a);
  const b = Math.round(77 * a);
  return `rgb(${r},${g},${b})`;
}

function fgFor(value: number, max: number): string {
  const t = max > 0 ? Math.abs(value) / max : 0;
  return t > 0.45 ? "#000000" : "#e5e7eb";
}

// ────── HEATMAP ──────
function HeatmapView({ ticker, contracts, metric }: Props) {
  const { strikes, expiries, grid, max } = useMemo(() => {
    const expSet = Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b);
    // Build per-expiry exposures
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
    for (const m of perExp.values()) for (const v of m.values()) mx = Math.max(mx, Math.abs(v));
    return { strikes: strikeSet, expiries: expSet, grid: perExp, max: mx };
  }, [ticker, contracts, metric]);

  return (
    <div className="bg-black rounded border border-border overflow-auto max-h-[560px]">
      <table className="w-full font-mono text-[11px] border-separate border-spacing-px">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-black px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0">
              Strike \ DTE
            </th>
            {expiries.map((e) => (
              <th key={e} className="bg-black px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground text-center">
                {e}D
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strikes.map((s) => {
            const isSpot = Math.abs(s - ticker.spot) < ticker.strikeStep / 2;
            return (
              <tr key={s}>
                <td
                  className={`px-2 py-1 sticky left-0 bg-black text-right border-r border-border ${
                    isSpot ? "text-primary font-bold" : "text-foreground"
                  }`}
                >
                  ${s}
                  {isSpot && <span className="ml-1">●</span>}
                </td>
                {expiries.map((e) => {
                  const v = grid.get(e)?.get(s) ?? 0;
                  const bg = gexBg(v, max);
                  const fg = fgFor(v, max);
                  return (
                    <td
                      key={e}
                      className="px-2 py-1 text-right tabular-nums transition-colors"
                      style={{ background: bg, color: fg, minWidth: 70 }}
                      title={`Strike $${s} · ${e}DTE · ${formatNumber(v)}`}
                    >
                      {v === 0 ? "—" : formatNumber(v, 1)}
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

// ────── STRIKE CHART (divergent horizontal bars) ──────
function StrikeChartView({ ticker, contracts, metric }: Props) {
  const data = useMemo(() => {
    const points = computeExposures(ticker.spot, contracts);
    return points.slice().sort((a, b) => b.strike - a.strike);
  }, [ticker, contracts]);

  const max = Math.max(...data.map((d) => Math.abs(d[metric])), 1);

  return (
    <div className="bg-black rounded border border-border p-3 max-h-[560px] overflow-auto">
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2 grid grid-cols-[1fr_80px_1fr] gap-2">
        <div className="text-right">Negative Gamma</div>
        <div className="text-center">Strike</div>
        <div>Positive Gamma</div>
      </div>
      <div className="space-y-0.5">
        {data.map((p) => {
          const v = p[metric];
          const w = (Math.abs(v) / max) * 100;
          const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
          return (
            <div
              key={p.strike}
              className={`grid grid-cols-[1fr_80px_1fr] items-center gap-2 font-mono text-[11px] ${
                isSpot ? "bg-primary/10" : ""
              }`}
            >
              <div className="flex justify-end items-center h-5">
                {v < 0 && (
                  <>
                    <span className="mr-2 tabular-nums" style={{ color: "#ff4d4d" }}>
                      {formatNumber(v, 1)}
                    </span>
                    <div
                      className="h-3 rounded-l"
                      style={{ width: `${w}%`, background: "#ff4d4d", boxShadow: "0 0 8px rgba(255,77,77,0.4)" }}
                    />
                  </>
                )}
              </div>
              <div
                className={`text-center tabular-nums ${isSpot ? "text-primary font-bold" : "text-foreground"}`}
                style={{ borderLeft: "1px solid hsl(var(--border))", borderRight: "1px solid hsl(var(--border))" }}
              >
                ${p.strike}
              </div>
              <div className="flex items-center h-5">
                {v >= 0 && (
                  <>
                    <div
                      className="h-3 rounded-r"
                      style={{ width: `${w}%`, background: "#00ff88", boxShadow: "0 0 8px rgba(0,255,136,0.4)" }}
                    />
                    <span className="ml-2 tabular-nums" style={{ color: "#00ff88" }}>
                      {formatNumber(v, 1)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────── 3D SURFACE ──────
function Surface3D({
  strikes,
  expiries,
  values,
  max,
  onHover,
}: {
  strikes: number[];
  expiries: number[];
  values: number[][]; // [iExp][iStrike]
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
        const z = max > 0 ? (v / max) * 3 : 0; // height
        pos.setZ(idx, z);
        const t = max > 0 ? Math.abs(v) / max : 0;
        const a = Math.pow(t, 0.5);
        if (v >= 0) {
          colors.push(0, a, 0.53 * a);
        } else {
          colors.push(a, 0.3 * a, 0.3 * a);
        }
      }
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [strikes, expiries, values, max]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} />
      <directionalLight position={[-5, 4, -3]} intensity={0.4} color="#00ff88" />

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
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading={false} metalness={0.1} roughness={0.65} />
      </mesh>

      <mesh geometry={geometry} rotation={[-Math.PI / 2.4, 0, 0]}>
        <meshBasicMaterial wireframe color="#ffffff" transparent opacity={0.08} />
      </mesh>

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[14, 10]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}

function SurfaceView({ ticker, contracts, metric }: Props) {
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

  return (
    <div className="relative bg-black rounded border border-border h-[560px]">
      <Canvas camera={{ position: [10, 8, 10], fov: 45 }} style={{ background: "#000000" }}>
        <Surface3D strikes={strikes} expiries={expiries} values={values} max={max} onHover={setHover} />
      </Canvas>

      {/* Axis labels overlay */}
      <div className="absolute bottom-2 left-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
        X: Strikes ({strikes[0]} → {strikes[strikes.length - 1]}) · Y: DTE ({expiries[0]} → {expiries[expiries.length - 1]}D) · Z: Gamma
      </div>
      <div className="absolute top-2 left-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
        Drag to rotate · Scroll to zoom
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-3 right-3 bg-black/90 backdrop-blur border border-border rounded px-3 py-2 font-mono text-[11px] shadow-lg"
          >
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Surface point</div>
            <div className="text-foreground">Strike <span className="text-primary">${hover.strike}</span></div>
            <div className="text-foreground">DTE <span className="text-primary">{hover.expiry}D</span></div>
            <div style={{ color: hover.value >= 0 ? "#00ff88" : "#ff4d4d" }}>
              {metric === "netGex" ? "Gamma" : "Delta"}: {formatNumber(hover.value)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Color legend */}
      <div className="absolute bottom-2 right-3 flex items-center gap-2 font-mono text-[10px]">
        <span style={{ color: "#ff4d4d" }}>− Short γ</span>
        <div
          className="h-2 w-32 rounded"
          style={{ background: "linear-gradient(to right, #ff4d4d, #000000, #00ff88)" }}
        />
        <span style={{ color: "#00ff88" }}>+ Long γ</span>
      </div>
    </div>
  );
}

// ────── MAIN TAB SWITCHER ──────
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
              className={`relative px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded transition-colors ${
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
          {view === "heatmap" && <HeatmapView {...props} />}
          {view === "strike" && <StrikeChartView {...props} />}
          {view === "surface" && <SurfaceView {...props} />}
        </motion.div>
      </AnimatePresence>
    </Panel>
  );
}

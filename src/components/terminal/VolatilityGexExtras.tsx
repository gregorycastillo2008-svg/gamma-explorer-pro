import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { OptionContract, DemoTicker, computeExposures, formatNumber } from "@/lib/gex";
import { Panel } from "./Panel";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

// ───── HEATMAP (red/green, identical to GEX/DEX) ─────
function heatBg(value: number, max: number): string {
  if (max <= 0 || value === 0) return "#000000";
  const t = Math.min(1, Math.abs(value) / max);
  const a = Math.pow(t, 0.55);
  if (value > 0) return `rgb(0,${Math.round(255 * a)},${Math.round(136 * a)})`;
  return `rgb(${Math.round(255 * a)},${Math.round(51 * a)},${Math.round(68 * a)})`;
}
function heatFg(value: number, max: number): string {
  const t = max > 0 ? Math.abs(value) / max : 0;
  return t > 0.55 ? "#000000" : "#e5e7eb";
}

export function GexHeatmapForVolatility({ ticker, contracts }: Props) {
  const { strikes, expiries, grid, max } = useMemo(() => {
    const expSet = Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b);
    const perExp = new Map<number, Map<number, number>>();
    for (const exp of expSet) {
      const subset = contracts.filter((c) => c.expiry === exp);
      const points = computeExposures(ticker.spot, subset);
      const m = new Map<number, number>();
      for (const p of points) m.set(p.strike, p.netGex);
      perExp.set(exp, m);
    }
    const strikeSet = Array.from(new Set(contracts.map((c) => c.strike))).sort((a, b) => b - a);
    let mx = 0;
    for (const m of perExp.values()) for (const v of m.values()) mx = Math.max(mx, Math.abs(v));
    return { strikes: strikeSet, expiries: expSet, grid: perExp, max: mx };
  }, [ticker, contracts]);

  return (
    <Panel
      title="GEX Heatmap"
      subtitle={`${ticker.symbol} · Net Gamma · Strike × DTE · positive green / negative red`}
      noPad
    >
      <div className="p-2 bg-black">
        <div className="bg-black rounded overflow-auto max-h-[380px]">
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
                      return (
                        <td
                          key={e}
                          className="px-3 py-1.5 text-right transition-colors duration-200 cursor-default"
                          style={{
                            background: heatBg(v, max),
                            color: heatFg(v, max),
                            borderRight: "1px solid rgba(255,255,255,0.02)",
                            borderBottom: "1px solid rgba(255,255,255,0.02)",
                            fontWeight: Math.abs(v) / max > 0.6 ? 600 : 400,
                          }}
                          title={`Strike $${s} · ${e}DTE · ${formatNumber(v)}`}
                        >
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
      </div>
    </Panel>
  );
}

// ───── HILL 3D SURFACE — flat → rising hill, red/yellow downslope ─────
// Colormap: deep dark red → red → orange → yellow → pale yellow at peak
function hillColor(t: number): [number, number, number] {
  // t in [0,1] mapped from low elevation to high
  const stops: [number, number, number, number][] = [
    [0.0, 0.08, 0.0, 0.0],   // near-black red base (flat side)
    [0.2, 0.35, 0.05, 0.05], // dark blood red
    [0.45, 0.85, 0.18, 0.05],// strong red
    [0.7, 1.0, 0.55, 0.05],  // orange
    [0.9, 1.0, 0.85, 0.2],   // yellow
    [1.0, 1.0, 0.97, 0.6],   // pale gold peak
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
function hillCss(t: number): string {
  const [r, g, b] = hillColor(t);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

function HillFloorGrid() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(14, 28, 0x4d2a0f, 0x2a1505);
    (g.material as THREE.Material).transparent = true;
    (g.material as THREE.Material).opacity = 0.5;
    g.position.y = -0.005;
    return g;
  }, []);
  return <primitive object={grid} />;
}

function HillSurfaceMesh({
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
        // Hill profile: ONE side flat (low), rises like a hill, drops on the other side.
        // X axis goes from left (flat) to right.
        // Build a smooth ridge using sigmoid-like blending of magnitude with a positional ramp.
        const xRel = i / Math.max(1, w - 1); // 0..1 across strikes
        const yRel = j / Math.max(1, h - 1); // 0..1 across DTE
        const mag = max > 0 ? Math.abs(v) / max : 0;

        // Hill envelope: smooth bump centered slightly past middle, flatter on left
        // Left side (xRel < 0.25) → near-flat plateau
        // Mid → rising hill
        // Right (xRel > 0.75) → cliff falling off
        let envelope: number;
        if (xRel < 0.2) {
          envelope = 0.05; // flat plateau
        } else {
          // bell-shaped peak around xRel ~ 0.55
          const center = 0.55;
          const sigma = 0.22;
          envelope = Math.exp(-Math.pow((xRel - center) / sigma, 2));
        }
        // DTE softens: nearer DTE has higher peak
        const dteFalloff = 0.55 + 0.45 * (1 - yRel);
        const heightT = envelope * dteFalloff * (0.45 + 0.55 * mag);
        const z = heightT * 3.2;
        pos.setZ(idx, z);

        const tColor = Math.max(0, Math.min(1, heightT));
        const [r, g, b] = hillColor(tColor);
        // Add subtle shading by side: right cliff slightly darker → reddish
        const sideShade = xRel > 0.7 ? 0.85 : 1.0;
        colors.push(r * sideShade, g * sideShade, b * sideShade);
      }
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [strikes, expiries, values, max]);

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[8, 12, 6]} intensity={1.1} color="#fff5d8" />
      <directionalLight position={[-6, 4, -4]} intensity={0.3} color="#ff5522" />
      <pointLight position={[2, 5, 2]} intensity={0.5} color="#ffaa55" />

      <HillFloorGrid />

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
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          flatShading={false}
          metalness={0.05}
          roughness={0.75}
        />
      </mesh>

      <mesh geometry={geometry} rotation={[-Math.PI / 2.4, 0, 0]}>
        <meshBasicMaterial wireframe color="#ffaa55" transparent opacity={0.05} />
      </mesh>

      <OrbitControls enablePan enableZoom enableRotate makeDefault />
    </>
  );
}

export function GexHillSurfaceForVolatility({ ticker, contracts }: Props) {
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
      for (const p of points) m.set(p.strike, p.netGex);
      const row = strikeSet.map((s) => m.get(s) ?? 0);
      for (const v of row) mx = Math.max(mx, Math.abs(v));
      grid.push(row);
    }
    return { strikes: strikeSet, expiries: expSet, values: grid, max: mx };
  }, [ticker, contracts]);

  return (
    <Panel
      title="Volatility Hill Projection"
      subtitle={`${ticker.symbol} · gamma terrain · flat plateau → ridge peak → cliff falloff`}
      noPad
    >
      <div className="p-2 bg-black">
        <div className="relative bg-black rounded border border-[#2a1505] h-[380px] overflow-hidden">
          <Canvas camera={{ position: [11, 7, 11], fov: 45 }} style={{ background: "#000" }}>
            <HillSurfaceMesh strikes={strikes} expiries={expiries} values={values} max={max} onHover={setHover} />
          </Canvas>

          <div className="absolute top-3 left-3 font-jetbrains text-[10px] text-[#a16a3c] uppercase tracking-[0.2em] pointer-events-none">
            {ticker.symbol} · Gamma Terrain
          </div>
          <div className="absolute bottom-3 left-3 font-jetbrains text-[9px] text-[#7a4a2a] uppercase tracking-[0.18em] pointer-events-none">
            X strikes · Y dte · Z elevation
          </div>

          <AnimatePresence>
            {hover && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-3 right-3 bg-black/90 backdrop-blur border border-[#3a1f0a] rounded px-3 py-2 font-jetbrains text-[11px] shadow-2xl pointer-events-none"
              >
                <div className="text-[9px] uppercase tracking-[0.18em] text-[#a16a3c] mb-1">Terrain point</div>
                <div className="text-[#e5e7eb]">Strike <span className="text-[#ffaa55]">${hover.strike}</span></div>
                <div className="text-[#e5e7eb]">DTE <span className="text-[#ffaa55]">{hover.expiry}D</span></div>
                <div style={{ color: hover.value >= 0 ? "#ffd166" : "#ff5533" }}>
                  Γ {formatNumber(hover.value)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Vertical legend */}
          <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-stretch gap-2 pointer-events-none">
            <div className="flex flex-col justify-between font-jetbrains text-[9px] text-[#a16a3c]">
              <span>PEAK</span>
              <span>SLOPE</span>
              <span>FLAT</span>
            </div>
            <div
              className="w-3 rounded"
              style={{
                height: 140,
                background: `linear-gradient(to top, ${hillCss(0)}, ${hillCss(0.25)}, ${hillCss(0.5)}, ${hillCss(0.75)}, ${hillCss(1)})`,
                boxShadow: "0 0 10px rgba(255,140,40,0.2)",
              }}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

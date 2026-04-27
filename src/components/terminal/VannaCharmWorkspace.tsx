import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { DemoTicker, OptionContract } from "@/lib/gex";
import { bsGreeks, formatNumber } from "@/lib/gex";
import { ZoomIn, ZoomOut, RotateCcw, Camera, Home, Maximize2 } from "lucide-react";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

type Tab = "heatmap" | "strike" | "surface";
type Greek = "vanna" | "charm";

const CYAN = "#06b6d4";
const MUTED = "#6b7280";
const BORDER = "#1f1f1f";
const PANEL_BG = "#0a0a0a";
const RED = "#ef4444";
const GREEN = "#10b981";
const YELLOW = "#fbbf24";
const TEXT = "#9ca3af";

// Aggregate per (strike, expiry) for a given greek
function buildGrid(spot: number, contracts: OptionContract[], greek: Greek) {
  const map = new Map<string, { strike: number; expiry: number; value: number }>();
  for (const c of contracts) {
    const T = Math.max(c.expiry, 1) / 365;
    const g = bsGreeks(spot, c.strike, T, 0.05, c.iv, c.type);
    const sign = c.type === "call" ? 1 : -1;
    const notional = c.oi * 100;
    const v = (greek === "vanna" ? g.vanna : g.charm) * notional * sign;
    const key = `${c.strike}|${c.expiry}`;
    const cur = map.get(key) ?? { strike: c.strike, expiry: c.expiry, value: 0 };
    cur.value += v;
    map.set(key, cur);
  }
  return Array.from(map.values());
}

// Aggregate per strike (sum across expiries, optionally filtered)
function aggregateByStrike(
  grid: { strike: number; expiry: number; value: number }[],
  expiryFilter: number | "all"
) {
  const m = new Map<number, number>();
  for (const g of grid) {
    if (expiryFilter !== "all" && g.expiry !== expiryFilter) continue;
    m.set(g.strike, (m.get(g.strike) ?? 0) + g.value);
  }
  return Array.from(m.entries())
    .map(([strike, value]) => ({ strike, value }))
    .sort((a, b) => b.strike - a.strike);
}

export function VannaCharmWorkspace({ ticker, contracts }: Props) {
  const [tab, setTab] = useState<Tab>("heatmap");
  const [expiry, setExpiry] = useState<number | "all">("all");

  const expiries = useMemo(
    () => Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b),
    [contracts]
  );

  const vannaGrid = useMemo(() => buildGrid(ticker.spot, contracts, "vanna"), [ticker.spot, contracts]);
  const charmGrid = useMemo(() => buildGrid(ticker.spot, contracts, "charm"), [ticker.spot, contracts]);

  return (
    <div className="h-full w-full flex flex-col bg-black font-mono">
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4"
        style={{ background: "#000", borderBottom: `1px solid ${BORDER}`, height: 48 }}
      >
        <div className="flex items-center gap-1">
          <TabBtn active={tab === "heatmap"} onClick={() => setTab("heatmap")}>HEATMAP</TabBtn>
          <TabBtn active={tab === "strike"} onClick={() => setTab("strike")}>STRIKE CHART</TabBtn>
          <TabBtn active={tab === "surface"} onClick={() => setTab("surface")}>3D SURFACE</TabBtn>
          <span className="ml-4 text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>EXPIRY</span>
          <select
            value={String(expiry)}
            onChange={(e) => setExpiry(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="text-[11px] px-2 py-1 rounded font-mono cursor-pointer"
            style={{ background: "#1a1a1a", color: CYAN, border: `1px solid ${BORDER}` }}
          >
            <option value="all">ALL</option>
            {expiries.map((e) => (
              <option key={e} value={e}>{e}D</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span style={{ color: TEXT }}>{ticker.symbol}</span>
          <span style={{ color: CYAN }}>${ticker.spot.toFixed(2)}</span>
          <span style={{ color: GREEN }}>+23.18</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4">
        {tab === "heatmap" && <HeatmapTab spot={ticker.spot} vannaGrid={vannaGrid} charmGrid={charmGrid} expiries={expiries} expiryFilter={expiry} />}
        {tab === "strike" && <StrikeChartTab spot={ticker.spot} vannaGrid={vannaGrid} charmGrid={charmGrid} expiries={expiries} expiryFilter={expiry} setExpiryFilter={setExpiry} />}
        {tab === "surface" && <SurfaceTab spot={ticker.spot} vannaGrid={vannaGrid} charmGrid={charmGrid} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 text-[11px] uppercase tracking-wider transition-colors"
      style={{
        color: active ? CYAN : MUTED,
        borderBottom: active ? `2px solid ${CYAN}` : "2px solid transparent",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─────────── HEATMAP TAB ───────────
function HeatmapTab({
  spot, vannaGrid, charmGrid, expiries, expiryFilter,
}: {
  spot: number;
  vannaGrid: { strike: number; expiry: number; value: number }[];
  charmGrid: { strike: number; expiry: number; value: number }[];
  expiries: number[];
  expiryFilter: number | "all";
}) {
  const visibleExp = expiryFilter === "all" ? expiries : [expiryFilter as number];
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <HeatmapPanel
        title="VANNAEX HEATMAP"
        grid={vannaGrid}
        expiries={visibleExp}
        spot={spot}
        positiveRgb={[167, 139, 250]}   // purple-400 (vanna +)
        negativeRgb={[91, 33, 182]}     // purple-800 (vanna −)
      />
      <HeatmapPanel
        title="CHARMEX HEATMAP"
        grid={charmGrid}
        expiries={visibleExp}
        spot={spot}
        positiveRgb={[244, 114, 182]}   // pink-400 (charm +)
        negativeRgb={[219, 39, 119]}    // pink-600 (charm −)
      />
    </div>
  );
}

// Heat ramp: black → saturated peak (matches GEX/DEX style)
function rampBg(v: number, max: number, posRgb: number[], negRgb: number[]): string {
  if (!max || v === 0) return "#000000";
  const t = Math.min(1, Math.abs(v) / max);
  const a = 0.15 + 0.85 * Math.pow(t, 0.5);
  const peak = v > 0 ? posRgb : negRgb;
  const r = Math.round(peak[0] * a);
  const g = Math.round(peak[1] * a);
  const b = Math.round(peak[2] * a);
  return `rgb(${r},${g},${b})`;
}

function rampFg(v: number, max: number): string {
  if (!max || v === 0) return "#444";
  return Math.abs(v) / max > 0.55 ? "#ffffff" : "rgba(255,255,255,0.85)";
}

function HeatmapPanel({
  title, grid, expiries, spot, positiveRgb, negativeRgb,
}: {
  title: string;
  grid: { strike: number; expiry: number; value: number }[];
  expiries: number[];
  spot: number;
  positiveRgb: number[];
  negativeRgb: number[];
}) {
  const strikes = useMemo(
    () => Array.from(new Set(grid.map((g) => g.strike))).sort((a, b) => b - a),
    [grid]
  );
  const max = Math.max(...grid.map((g) => Math.abs(g.value)), 1);
  const cellMap = new Map(grid.map((g) => [`${g.strike}|${g.expiry}`, g.value]));

  return (
    <div className="flex flex-col min-h-0 rounded-lg overflow-hidden" style={{ background: "#000000", border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider" style={{ color: TEXT, borderBottom: `1px solid ${BORDER}`, background: PANEL_BG }}>{title}</div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 z-10" style={{ background: "#000000" }}>
            <tr>
              <th className="text-left px-2 py-1.5" style={{ color: MUTED, borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}` }}>Strike</th>
              {expiries.map((e) => (
                <th key={e} className="text-center px-2 py-1.5" style={{ color: MUTED, borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}` }}>{e}D</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strikes.map((s) => {
              const isSpot = Math.abs(s - spot) < 1;
              return (
                <tr key={s}>
                  <td
                    className="px-2 py-1 sticky left-0 z-[1]"
                    style={{
                      color: isSpot ? YELLOW : "#e5e7eb",
                      fontWeight: isSpot ? 700 : 500,
                      background: "#000000",
                      borderRight: `1px solid ${BORDER}`,
                      borderBottom: `1px solid ${BORDER}`,
                    }}
                  >
                    ${s}{isSpot && <span className="ml-1 text-[9px]">◀</span>}
                  </td>
                  {expiries.map((e) => {
                    const v = cellMap.get(`${s}|${e}`) ?? 0;
                    return (
                      <td
                        key={e}
                        className="text-center px-2 py-1 tabular-nums"
                        style={{
                          background: rampBg(v, max, positiveRgb, negativeRgb),
                          color: rampFg(v, max),
                          borderRight: `1px solid #0f0f0f`,
                          borderBottom: `1px solid #0f0f0f`,
                          fontWeight: Math.abs(v) / max > 0.55 ? 600 : 400,
                        }}
                        title={`Strike $${s} · ${e}D · ${formatNumber(v)}`}
                      >
                        {Math.abs(v) < max * 0.005 ? "·" : formatNumber(v, 1)}
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
  );
}



// ─────────── STRIKE CHART TAB ───────────
function StrikeChartTab({
  spot, vannaGrid, charmGrid, expiries, expiryFilter, setExpiryFilter,
}: {
  spot: number;
  vannaGrid: { strike: number; expiry: number; value: number }[];
  charmGrid: { strike: number; expiry: number; value: number }[];
  expiries: number[];
  expiryFilter: number | "all";
  setExpiryFilter: (e: number | "all") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <StrikeChartPanel title="VANNAEX BY STRIKE" grid={vannaGrid} spot={spot} expiries={expiries} expiryFilter={expiryFilter} setExpiryFilter={setExpiryFilter} />
      <StrikeChartPanel title="CHARMEX BY STRIKE" grid={charmGrid} spot={spot} expiries={expiries} expiryFilter={expiryFilter} setExpiryFilter={setExpiryFilter} />
    </div>
  );
}

function StrikeChartPanel({
  title, grid, spot, expiries, expiryFilter, setExpiryFilter,
}: {
  title: string;
  grid: { strike: number; expiry: number; value: number }[];
  spot: number;
  expiries: number[];
  expiryFilter: number | "all";
  setExpiryFilter: (e: number | "all") => void;
}) {
  const rows = useMemo(() => aggregateByStrike(grid, expiryFilter), [grid, expiryFilter]);
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <div className="flex flex-col min-h-0 rounded-lg overflow-hidden" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider" style={{ color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
        {title} · {expiryFilter === "all" ? "ALL" : `${expiryFilter}D`}
      </div>
      <div className="flex flex-wrap gap-1 px-3 py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <DteBtn active={expiryFilter === "all"} onClick={() => setExpiryFilter("all")}>ALL</DteBtn>
        {expiries.map((e) => (
          <DteBtn key={e} active={expiryFilter === e} onClick={() => setExpiryFilter(e)}>{e}D</DteBtn>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 relative">
        {rows.map((r) => {
          const isAbove = r.strike > spot;
          const color = isAbove ? RED : GREEN;
          const w = (Math.abs(r.value) / max) * 80;
          const isSpot = Math.abs(r.strike - spot) < 1;
          return (
            <div
              key={r.strike}
              className="grid grid-cols-[40px_1fr_60px] items-center gap-2"
              style={{ height: 18, marginBottom: 2 }}
              title={`$${r.strike} · ${formatNumber(r.value)}`}
            >
              <span className="text-[9px] text-right tabular-nums" style={{ color: isSpot ? YELLOW : MUTED, fontWeight: isSpot ? 700 : 400 }}>
                ${r.strike}
              </span>
              <div className="h-3 relative">
                {isSpot && (
                  <div className="absolute inset-x-0 top-1/2" style={{ borderTop: `2px dashed ${YELLOW}` }} />
                )}
                <div style={{ width: `${w}%`, height: "100%", background: color, opacity: 0.85, borderRadius: 2 }} />
              </div>
              <span className="text-[9px] tabular-nums" style={{ color }}>
                {formatNumber(r.value, 1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DteBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] px-2 py-1 rounded transition-colors"
      style={{
        background: active ? CYAN : "#1a1a1a",
        color: active ? "#000" : MUTED,
        border: "none",
        cursor: "pointer",
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
    </button>
  );
}

// ─────────── 3D SURFACE TAB ───────────
function SurfaceTab({
  spot, vannaGrid, charmGrid,
}: {
  spot: number;
  vannaGrid: { strike: number; expiry: number; value: number }[];
  charmGrid: { strike: number; expiry: number; value: number }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <Surface3DPanel title="VANNAEX · 3D SURFACE" grid={vannaGrid} spot={spot} positiveHex="#fbbf24" negativeHex="#a78bfa" />
      <Surface3DPanel title="CHARMEX · 3D SURFACE" grid={charmGrid} spot={spot} positiveHex="#10b981" negativeHex="#ef4444" />
    </div>
  );
}

function Surface3DPanel({
  title, grid, spot, positiveHex, negativeHex,
}: {
  title: string;
  grid: { strike: number; expiry: number; value: number }[];
  spot: number;
  positiveHex: string;
  negativeHex: string;
}) {
  const orbitRef = useRef<any>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [hover, setHover] = useState<{ strike: number; expiry: number; value: number } | null>(null);

  return (
    <div className="flex flex-col min-h-0 rounded-lg overflow-hidden relative" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider flex justify-between" style={{ color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
        <span>{title}</span>
        <div className="flex items-center gap-2">
          <IconBtn onClick={() => orbitRef.current?.dollyIn?.(1.2)}><ZoomIn size={14} /></IconBtn>
          <IconBtn onClick={() => orbitRef.current?.dollyOut?.(1.2)}><ZoomOut size={14} /></IconBtn>
          <IconBtn onClick={() => setAutoRotate((v) => !v)}><RotateCcw size={14} /></IconBtn>
          <IconBtn onClick={() => orbitRef.current?.reset?.()}><Home size={14} /></IconBtn>
          <IconBtn onClick={() => {}}><Maximize2 size={14} /></IconBtn>
        </div>
      </div>
      <div className="flex-1 relative">
        <Canvas camera={{ position: [8, 6, 8], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 5]} intensity={0.7} />
          <Surface grid={grid} spot={spot} positiveHex={positiveHex} negativeHex={negativeHex} onHover={setHover} />
          <gridHelper args={[10, 20, "#1f1f1f", "#1f1f1f"]} />
          <OrbitControls ref={orbitRef} enableRotate enableZoom autoRotate={autoRotate} minDistance={5} maxDistance={20} />
        </Canvas>
        {hover && (
          <div
            className="absolute top-3 left-3 px-3 py-2 text-[10px] font-mono rounded pointer-events-none"
            style={{ background: "rgba(0,0,0,0.85)", border: `1px solid ${BORDER}`, color: TEXT }}
          >
            <div style={{ color: CYAN }}>STRIKE ${hover.strike}</div>
            <div style={{ color: hover.value >= 0 ? positiveHex : negativeHex }}>Value: {formatNumber(hover.value)}</div>
            <div>DTE: {hover.expiry} days</div>
          </div>
        )}
        <div className="absolute bottom-2 left-3 text-[9px]" style={{ color: MUTED }}>STRIKES (X) · DTE (Z) · {title.split(" ")[0]} (Y)</div>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="transition-colors"
      style={{ color: MUTED, background: "transparent", border: "none", cursor: "pointer" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = CYAN)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = MUTED)}
    >
      {children}
    </button>
  );
}

function Surface({
  grid, spot, positiveHex, negativeHex, onHover,
}: {
  grid: { strike: number; expiry: number; value: number }[];
  spot: number;
  positiveHex: string;
  negativeHex: string;
  onHover: (h: { strike: number; expiry: number; value: number } | null) => void;
}) {
  const { geo, wireGeo, strikes, expiries } = useMemo(() => {
    const strikes = Array.from(new Set(grid.map((g) => g.strike))).sort((a, b) => a - b);
    const expiries = Array.from(new Set(grid.map((g) => g.expiry))).sort((a, b) => a - b);
    const w = strikes.length;
    const h = expiries.length;
    const map = new Map(grid.map((g) => [`${g.strike}|${g.expiry}`, g.value]));
    const max = Math.max(...grid.map((g) => Math.abs(g.value)), 1);

    const SX = 10, SZ = 6, SY = 3;
    const geo = new THREE.PlaneGeometry(SX, SZ, Math.max(1, w - 1), Math.max(1, h - 1));
    geo.rotateX(-Math.PI / 2);

    const pos = new THREE.Color(positiveHex);
    const neg = new THREE.Color(negativeHex);
    const colors: number[] = [];

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = map.get(`${strikes[i]}|${expiries[j]}`) ?? 0;
        const norm = v / max; // -1..1
        const idx = (j * w + i) * 3 + 1; // y component
        geo.attributes.position.array[idx] = norm * SY;
        const c = v >= 0 ? pos : neg;
        const intensity = 0.3 + Math.abs(norm) * 0.7;
        colors.push(c.r * intensity, c.g * intensity, c.b * intensity);
      }
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const wireGeo = new THREE.WireframeGeometry(geo);
    return { geo, wireGeo, strikes, expiries };
  }, [grid, positiveHex, negativeHex]);

  return (
    <group>
      <mesh
        geometry={geo}
        onPointerMove={(e) => {
          const face = e.face;
          if (!face) return;
          const w = strikes.length;
          const i = face.a % w;
          const j = Math.floor(face.a / w);
          const strike = strikes[Math.min(i, strikes.length - 1)];
          const expiry = expiries[Math.min(j, expiries.length - 1)];
          const v = grid.find((g) => g.strike === strike && g.expiry === expiry)?.value ?? 0;
          onHover({ strike, expiry, value: v });
        }}
        onPointerOut={() => onHover(null)}
      >
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading={false} />
      </mesh>
      <lineSegments geometry={wireGeo}>
        <lineBasicMaterial color="#374151" transparent opacity={0.3} />
      </lineSegments>
    </group>
  );
}

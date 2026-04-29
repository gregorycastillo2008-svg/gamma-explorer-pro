import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { DemoTicker, OptionContract } from "@/lib/gex";
import { bsGreeks, formatNumber } from "@/lib/gex";
import { ZoomIn, ZoomOut, RotateCcw, Camera, Home, Maximize2 } from "lucide-react";
import { VannaCharmSurfacePlot } from "./VannaCharmSurfacePlot";
import { VannaCharmTerrainPlot } from "./VannaCharmTerrainPlot";

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

  const filteredContracts = useMemo(
    () => contracts.filter((c) => c.expiry <= 3),
    [contracts]
  );

  const expiries = useMemo(
    () => Array.from(new Set(filteredContracts.map((c) => c.expiry))).sort((a, b) => a - b),
    [filteredContracts]
  );

  const vannaGrid = useMemo(() => buildGrid(ticker.spot, filteredContracts, "vanna"), [ticker.spot, filteredContracts]);
  const charmGrid = useMemo(() => buildGrid(ticker.spot, filteredContracts, "charm"), [ticker.spot, filteredContracts]);

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

      <div className="flex-1 min-h-0 p-4 bg-black">
        {tab === "heatmap" && <HeatmapTab spot={ticker.spot} vannaGrid={vannaGrid} charmGrid={charmGrid} expiries={expiries} expiryFilter={expiry} />}
        {tab === "strike" && <StrikeChartTab spot={ticker.spot} vannaGrid={vannaGrid} charmGrid={charmGrid} expiries={expiries} expiryFilter={expiry} setExpiryFilter={setExpiry} />}
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

  // Per-strike expiry breakdown (for tooltip)
  const breakdown = useMemo(() => {
    const m = new Map<number, { expiry: number; value: number }[]>();
    for (const g of grid) {
      if (expiryFilter !== "all" && g.expiry !== expiryFilter) continue;
      const arr = m.get(g.strike) ?? [];
      arr.push({ expiry: g.expiry, value: g.value });
      m.set(g.strike, arr);
    }
    return m;
  }, [grid, expiryFilter]);

  const [tooltip, setTooltip] = useState<
    | { strike: number; total: number; entries: { expiry: number; value: number }[]; x: number; y: number }
    | null
  >(null);

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
      <div
        className="flex-1 overflow-y-auto px-2 py-2 relative"
        onMouseLeave={() => setTooltip(null)}
      >
        {rows.map((r) => {
          const isAbove = r.strike > spot;
          const color = isAbove ? RED : GREEN;
          const w = (Math.abs(r.value) / max) * 80;
          const isSpot = Math.abs(r.strike - spot) < 1;
          return (
            <div
              key={r.strike}
              className="grid grid-cols-[40px_1fr_60px] items-center gap-2 cursor-crosshair"
              style={{ height: 18, marginBottom: 2 }}
              onMouseMove={(e) => {
                const host = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setTooltip({
                  strike: r.strike,
                  total: r.value,
                  entries: (breakdown.get(r.strike) ?? []).sort((a, b) => a.expiry - b.expiry),
                  x: e.clientX - host.left,
                  y: e.clientY - host.top,
                });
              }}
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

        {tooltip && (
          <div
            className="absolute pointer-events-none z-20 rounded px-2 py-1.5 text-[10px] font-mono leading-tight"
            style={{
              left: Math.min(tooltip.x + 12, 220),
              top: tooltip.y + 12,
              background: "rgba(0,0,0,0.92)",
              border: `1px solid ${CYAN}`,
              color: "#e5e7eb",
              boxShadow: `0 0 8px rgba(6,182,212,0.4)`,
              minWidth: 140,
            }}
          >
            <div style={{ color: YELLOW, fontWeight: 700 }}>STRIKE ${tooltip.strike}</div>
            <div style={{ color: tooltip.total >= 0 ? GREEN : RED }}>
              Total: {tooltip.total >= 0 ? "+" : ""}{formatNumber(tooltip.total)}
            </div>
            <div style={{ color: MUTED }}>Expiries: {tooltip.entries.length}</div>
            <div className="mt-1 pt-1" style={{ borderTop: `1px solid ${BORDER}` }}>
              {tooltip.entries.slice(0, 8).map((e) => (
                <div key={e.expiry} className="flex justify-between gap-3">
                  <span style={{ color: MUTED }}>{e.expiry}D</span>
                  <span style={{ color: e.value >= 0 ? GREEN : RED }}>{formatNumber(e.value, 1)}</span>
                </div>
              ))}
              {tooltip.entries.length > 8 && (
                <div style={{ color: MUTED }}>+{tooltip.entries.length - 8} more…</div>
              )}
            </div>
          </div>
        )}
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-full">
      <VannaCharmSurfacePlot />
      <VannaCharmTerrainPlot />
    </div>
  );
}

interface SurfHover {
  strike: number;
  dte: number;
  value: number;
  spotDist: number; // %
  x: number;
  y: number;
}

function Surface3DPanel({
  title, subtitle, grid, spot, variant, greekLabel,
}: {
  title: string;
  subtitle: string;
  grid: { strike: number; expiry: number; value: number }[];
  spot: number;
  variant: "matlab" | "terrain";
  greekLabel: string;
}) {
  const [hover, setHover] = useState<SurfHover | null>(null);
  const [elev, setElev] = useState(variant === "matlab" ? 28 : 26);
  const [azim, setAzim] = useState(variant === "matlab" ? 215 : 200);
  const [dist, setDist] = useState(variant === "matlab" ? 8.5 : 9.5);
  const ctlRef = useRef<{ reset: () => void } | null>(null);

  const apply = (e: number, a: number, d: number) => {
    setElev(e);
    setAzim(((Math.round(a) % 360) + 360) % 360);
    setDist(d);
  };

  const bg = variant === "matlab" ? "#fafafa" : "#dde3ee";
  const border = variant === "matlab" ? "#ddd" : "#ccc";

  return (
    <div className="flex flex-col min-h-0 rounded-lg overflow-hidden relative" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider flex justify-between items-center" style={{ color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <div>{title}</div>
          <div className="text-[9px] normal-case tracking-normal" style={{ color: MUTED }}>{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <IconBtn onClick={() => apply(elev, azim, Math.max(4, dist - 0.6))}><ZoomIn size={14} /></IconBtn>
          <IconBtn onClick={() => apply(elev, azim, Math.min(18, dist + 0.6))}><ZoomOut size={14} /></IconBtn>
          <IconBtn onClick={() => ctlRef.current?.reset()}><RotateCcw size={14} /></IconBtn>
          <IconBtn onClick={() => ctlRef.current?.reset()}><Home size={14} /></IconBtn>
          <IconBtn onClick={() => {}}><Maximize2 size={14} /></IconBtn>
        </div>
      </div>
      <div className="flex-1 relative" style={{ background: bg, borderTop: `1px solid ${border}` }}>
        <Canvas
          camera={{ fov: 42, near: 0.1, far: 1000 }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ scene }) => {
            scene.background = new THREE.Color(bg);
            if (variant === "terrain") scene.fog = new THREE.Fog(0xdde3ee, 18, 38);
          }}
        >
          <ambientLight intensity={variant === "matlab" ? 0.5 : 0.52} />
          <directionalLight position={[8, 16, 10]} intensity={1.0} color={variant === "matlab" ? 0xffffff : 0xfff5e0} />
          <directionalLight position={[-8, 6, -6]} intensity={0.45} color={variant === "matlab" ? 0xaaccff : 0xc0d8ff} />
          <directionalLight position={[0, -4, 12]} intensity={0.32} color={variant === "matlab" ? 0xffeedd : 0xffeecc} />
          <DataSurface variant={variant} grid={grid} spot={spot} setHover={setHover} />
          <CamRig elev={elev} azim={azim} dist={dist} ctlRef={ctlRef} onChange={apply} />
        </Canvas>

        {hover && (
          <div
            className="absolute pointer-events-none z-20 rounded px-2.5 py-2 text-[10px] font-mono leading-tight"
            style={{
              left: Math.min(hover.x + 14, 280),
              top: hover.y + 14,
              background: "rgba(0,0,0,0.92)",
              border: `1px solid ${CYAN}`,
              color: "#e5e7eb",
              boxShadow: `0 0 10px rgba(6,182,212,0.4)`,
              minWidth: 160,
            }}
          >
            <div style={{ color: YELLOW, fontWeight: 700 }}>STRIKE ${hover.strike}</div>
            <div className="flex justify-between gap-3"><span style={{ color: MUTED }}>DTE</span><span>{hover.dte}d</span></div>
            <div className="flex justify-between gap-3"><span style={{ color: MUTED }}>{greekLabel}EX</span><span style={{ color: hover.value >= 0 ? GREEN : RED }}>{formatNumber(hover.value, 2)}</span></div>
            <div className="flex justify-between gap-3"><span style={{ color: MUTED }}>Spot dist</span><span style={{ color: hover.spotDist >= 0 ? RED : GREEN }}>{hover.spotDist >= 0 ? "+" : ""}{hover.spotDist.toFixed(2)}%</span></div>
          </div>
        )}

        <div className="absolute bottom-2 left-0 right-0 flex flex-wrap items-center justify-center gap-3 px-3 text-[10px] font-mono pointer-events-none">
          <span style={{ color: variant === "matlab" ? "#888" : "#555" }}>🖱 drag · scroll · hover</span>
          <label className="flex items-center gap-1 pointer-events-auto" style={{ color: variant === "matlab" ? "#666" : "#555" }}>
            Elev
            <input type="range" min={5} max={80} value={Math.round(elev)} onChange={(e) => apply(+e.target.value, azim, dist)} className="w-16 accent-cyan-500" />
            <span style={{ color: variant === "matlab" ? "#444" : "#333" }}>{Math.round(elev)}°</span>
          </label>
          <label className="flex items-center gap-1 pointer-events-auto" style={{ color: variant === "matlab" ? "#666" : "#555" }}>
            Az
            <input type="range" min={0} max={360} value={Math.round(azim)} onChange={(e) => apply(elev, +e.target.value, dist)} className="w-16 accent-cyan-500" />
            <span style={{ color: variant === "matlab" ? "#444" : "#333" }}>{Math.round(azim)}°</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// MATLAB jet/parula colormap
function matlabColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0.00, [0.18, 0.00, 0.42]], [0.08, [0.10, 0.05, 0.65]], [0.18, [0.08, 0.25, 0.85]],
    [0.30, [0.05, 0.55, 0.90]], [0.42, [0.10, 0.78, 0.82]], [0.55, [0.20, 0.85, 0.65]],
    [0.65, [0.45, 0.90, 0.45]], [0.75, [0.78, 0.95, 0.20]], [0.85, [1.00, 0.95, 0.10]],
    [0.93, [1.00, 0.72, 0.05]], [1.00, [1.00, 0.55, 0.00]],
  ];
  for (let k = 0; k < stops.length - 1; k++) {
    const [t0, c0] = stops[k]; const [t1, c1] = stops[k + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2])];
    }
  }
  return [1, 0.55, 0];
}

// Topographic colormap (terrain)
function topoColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0.00, [0.28, 0.00, 0.50]], [0.08, [0.05, 0.05, 0.72]], [0.18, [0.00, 0.20, 0.85]],
    [0.30, [0.00, 0.55, 0.70]], [0.42, [0.05, 0.72, 0.35]], [0.54, [0.30, 0.80, 0.10]],
    [0.65, [0.65, 0.85, 0.05]], [0.75, [0.92, 0.88, 0.00]], [0.85, [1.00, 0.62, 0.00]],
    [0.93, [1.00, 0.25, 0.05]], [1.00, [0.90, 0.05, 0.05]],
  ];
  for (let k = 0; k < stops.length - 1; k++) {
    const [t0, c0] = stops[k]; const [t1, c1] = stops[k + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2])];
    }
  }
  return [0.9, 0.05, 0.05];
}

function DataSurface({
  variant, grid, spot, setHover,
}: {
  variant: "matlab" | "terrain";
  grid: { strike: number; expiry: number; value: number }[];
  spot: number;
  setHover: (h: SurfHover | null) => void;
}) {
  const built = useMemo(() => {
    if (!grid.length) return null;
    const strikes = Array.from(new Set(grid.map((g) => g.strike))).sort((a, b) => a - b);
    const expiries = Array.from(new Set(grid.map((g) => g.expiry))).sort((a, b) => a - b);
    const cols = strikes.length, rows = expiries.length;
    if (cols < 2 || rows < 2) return null;

    const map = new Map<string, number>();
    for (const g of grid) map.set(`${g.strike}|${g.expiry}`, g.value);
    const valueGrid: number[][] = [];
    for (let i = 0; i < cols; i++) {
      valueGrid.push([]);
      for (let j = 0; j < rows; j++) {
        valueGrid[i].push(map.get(`${strikes[i]}|${expiries[j]}`) ?? 0);
      }
    }

    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const v = valueGrid[i][j];
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    const range = Math.max(mx - mn, 1e-9);

    const SX = variant === "matlab" ? 5.2 : 5.6;
    const SZ = variant === "matlab" ? 5.2 : 5.6;
    const SY = variant === "matlab" ? 3.0 : 3.2;
    const baseY = variant === "matlab" ? -0.3 : -0.4;
    const colorFn = variant === "matlab" ? matlabColor : topoColor;

    const verts: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = (i / (cols - 1) - 0.5) * SX;
        const z = (j / (rows - 1) - 0.5) * SZ;
        const norm = (valueGrid[i][j] - mn) / range;
        const y = norm * SY + baseY;
        verts.push(x, y, z);
        const [r, g, b] = colorFn(norm);
        colors.push(r, g, b);
      }
    }
    const idxs: number[] = [];
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = i * rows + j + 1, c = (i + 1) * rows + j, d = (i + 1) * rows + j + 1;
      idxs.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(idxs);
    geometry.computeVertexNormals();

    const lineColor = variant === "matlab" ? 0x111111 : 0x000000;
    const lineOp = variant === "matlab" ? 0.28 : 0.12;
    const step = Math.max(1, Math.floor(Math.max(cols, rows) / 14));
    const gridLines: THREE.BufferGeometry[] = [];
    for (let j = 0; j < rows; j += step) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < cols; i++) {
        const k = (i * rows + j) * 3;
        pts.push(new THREE.Vector3(verts[k], verts[k + 1], verts[k + 2]));
      }
      gridLines.push(new THREE.BufferGeometry().setFromPoints(pts));
    }
    for (let i = 0; i < cols; i += step) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < rows; j++) {
        const k = (i * rows + j) * 3;
        pts.push(new THREE.Vector3(verts[k], verts[k + 1], verts[k + 2]));
      }
      gridLines.push(new THREE.BufferGeometry().setFromPoints(pts));
    }

    return { geometry, gridLines, strikes, expiries, valueGrid, cols, rows, lineColor, lineOp, baseY, SX, SZ, SY, variant };
  }, [grid, variant]);

  if (!built) return null;

  return (
    <group>
      <mesh
        geometry={built.geometry}
        onPointerMove={(e) => {
          const face = e.face;
          if (!face) return;
          const a = face.a;
          const i = Math.floor(a / built.rows);
          const j = a % built.rows;
          const strike = built.strikes[Math.min(i, built.cols - 1)];
          const dte = built.expiries[Math.min(j, built.rows - 1)];
          const value = built.valueGrid[Math.min(i, built.cols - 1)][Math.min(j, built.rows - 1)];
          setHover({
            strike, dte, value,
            spotDist: ((strike - spot) / spot) * 100,
            x: e.nativeEvent.offsetX,
            y: e.nativeEvent.offsetY,
          });
        }}
        onPointerOut={() => setHover(null)}
      >
        <meshPhongMaterial
          vertexColors
          side={THREE.DoubleSide}
          shininess={built.variant === "matlab" ? 120 : 55}
          specular={new THREE.Color(built.variant === "matlab" ? 0.6 : 0.35, built.variant === "matlab" ? 0.6 : 0.35, built.variant === "matlab" ? 0.6 : 0.25)}
        />
      </mesh>
      {built.gridLines.map((g, i) => (
        <line key={i}>
          <primitive object={g} attach="geometry" />
          <lineBasicMaterial color={built.lineColor} transparent opacity={built.lineOp} />
        </line>
      ))}
      {/* Floor plane for matlab style */}
      {built.variant === "matlab" && (
        <mesh position={[0, built.baseY - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[built.SX, built.SZ]} />
          <meshPhongMaterial color={0x22115a} transparent opacity={0.92} side={THREE.DoubleSide} shininess={10} />
        </mesh>
      )}
      {/* Reference plane for terrain */}
      {built.variant === "terrain" && (
        <mesh position={[0, built.baseY + built.SY * 0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[built.SX, built.SZ]} />
          <meshPhongMaterial color={0x8899cc} transparent opacity={0.38} side={THREE.DoubleSide} shininess={5} />
        </mesh>
      )}
    </group>
  );
}

function CamRig({
  elev, azim, dist, ctlRef, onChange,
}: {
  elev: number; azim: number; dist: number;
  ctlRef: React.MutableRefObject<{ reset: () => void } | null>;
  onChange: (e: number, a: number, d: number) => void;
}) {
  const { camera, gl } = useThree();
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const stateRef = useRef({ elev, azim, dist });
  stateRef.current = { elev, azim, dist };

  useEffect(() => {
    ctlRef.current = { reset: () => onChange(28, 215, 8.5) };
  }, [ctlRef, onChange]);

  useEffect(() => {
    const el = (elev * Math.PI) / 180;
    const az = (azim * Math.PI) / 180;
    camera.position.set(
      dist * Math.cos(el) * Math.sin(az),
      dist * Math.sin(el),
      dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(0, 0.5, 0);
  }, [elev, azim, dist, camera]);

  useEffect(() => {
    const dom = gl.domElement;
    const md = (e: MouseEvent) => { dragRef.current.active = true; dragRef.current.x = e.clientX; dragRef.current.y = e.clientY; };
    const mu = () => { dragRef.current.active = false; };
    const mm = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current.x = e.clientX; dragRef.current.y = e.clientY;
      const s = stateRef.current;
      onChange(Math.max(5, Math.min(80, s.elev + dy * 0.32)), s.azim - dx * 0.42, s.dist);
    };
    const wh = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      onChange(s.elev, s.azim, Math.max(4, Math.min(18, s.dist + e.deltaY * 0.014)));
    };
    dom.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("mousemove", mm);
    dom.addEventListener("wheel", wh, { passive: false });
    return () => {
      dom.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("mousemove", mm);
      dom.removeEventListener("wheel", wh);
    };
  }, [gl, onChange]);

  return null;
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


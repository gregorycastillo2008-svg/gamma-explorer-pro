import { useMemo, useState, useRef, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ReferenceLine, Cell, CartesianGrid, ResponsiveContainer,
} from "recharts";
import type { ExposurePoint, OptionContract } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";

type Tab = "GEX" | "DEX" | "VEX";

interface Props {
  exposures:         ExposurePoint[];
  spot:              number;
  gammaFlip?:        number | null;
  callWall?:         number;
  putWall?:          number;
  height?:           number | string;
  contracts?:        OptionContract[];
  collapsed?:        boolean;
  onCollapseToggle?: () => void;
  bg?:               string;
  solidColors?:      boolean;
}

const FONT   = "'Courier New', monospace";
const BG     = "#080810";
const BORDER = "#0d0d1a";

const DEXVEX_CFG = {
  DEX: { color: "#06b6d4", posColor: "rgba(6,182,212,0.88)",  negColor: "rgba(180,40,60,0.82)",  label: "Net Delta Exposure / Strike" },
  VEX: { color: "#facc15", posColor: "rgba(250,204,21,0.88)", negColor: "rgba(180,40,60,0.82)",  label: "Net Vega Exposure / Strike"  },
};

// ── SVG smooth path (cubic bezier, horizontal tangents) ───────────
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [nx, ny] = pts[i];
    const mx = (px + nx) / 2;
    d += ` C ${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${ny.toFixed(1)} ${nx.toFixed(1)},${ny.toFixed(1)}`;
  }
  return d;
}

function TipRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ fontSize: 8, color: "#2a2a44", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 10, color, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

// ── Custom SVG gamma chart ────────────────────────────────────────
interface SvgChartProps {
  chartData:          { strike: number; netGex: number }[];
  spot:               number;
  gammaFlip?:         number | null;
  maxAbsGex:          number;
  ivByStrike:         Map<number, number>;
  vwapByStrike:       Map<number, number>;
  nearestSpotStrike:  number;
  solidColors?:       boolean;
}

interface BarTip {
  clientX: number; clientY: number;
  strike: number; netGex: number; absNorm: number;
  vwap?: number;
}

function GammaSVGChart({
  chartData, gammaFlip, maxAbsGex,
  vwapByStrike, nearestSpotStrike, solidColors,
}: SvgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize]   = useState({ w: 640, h: 500 });
  const [tip, setTip]     = useState<BarTip | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize({ w: el.clientWidth || 640, h: el.clientHeight || 500 });
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Trigger animation on mount (rápido, 1 frame delay)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => { cancelAnimationFrame(raf); setMounted(false); };
  }, []);

  const { w, h } = size;

  // Layout constants (px)
  const LABEL_W   = 54;
  const RIGHT_M   = 6;
  const TOP_PAD   = 8;
  const BOT_PAD   = 8;
  const MIN_ROW_H = 18;                          // mínimo por fila → habilita scroll
  const CHART_W   = Math.max(1, w - LABEL_W - RIGHT_M);
  const n         = chartData.length;
  const ROW_H     = Math.max(MIN_ROW_H, n > 0 ? (h - TOP_PAD - BOT_PAD) / n : MIN_ROW_H);
  const svgH      = TOP_PAD + BOT_PAD + ROW_H * n; // puede superar h → scroll
  const CHART_H   = svgH - TOP_PAD - BOT_PAD;
  const CENTER_X  = LABEL_W + CHART_W / 2;
  const HALF_W    = CHART_W / 2;
  const BAR_H     = Math.max(2, ROW_H * 0.82);

  const rowY = (i: number) => TOP_PAD + (i + 0.5) * ROW_H;

  // VWAP x-mapping
  const vwapVals  = chartData.map(d => vwapByStrike.get(d.strike)).filter((v): v is number => v != null && v > 0);
  const hasVwap   = vwapVals.length > 1;
  const vwapMin   = hasVwap ? Math.min(...vwapVals) : 0;
  const vwapMax   = hasVwap ? Math.max(...vwapVals) : 1;
  const vwapRange = Math.max(0.001, vwapMax - vwapMin);
  const vwapToX   = (v: number) => LABEL_W + 4 + ((v - vwapMin) / vwapRange) * (CHART_W - 8);
  const vwapPts: [number, number][] = hasVwap
    ? chartData.map((d, i) => [vwapToX(vwapByStrike.get(d.strike) ?? vwapMin), rowY(i)])
    : [];

  const spotIdx  = chartData.findIndex(d => d.strike === nearestSpotStrike);
  const spotY    = spotIdx >= 0 ? rowY(spotIdx) : TOP_PAD + CHART_H / 2;
  const vwapSpot = vwapByStrike.get(nearestSpotStrike);

  const flipY = (() => {
    if (gammaFlip == null) return null;
    const fi = chartData.findIndex(d => Math.abs(d.strike - gammaFlip) <= 0.5);
    return fi >= 0 ? rowY(fi) : null;
  })();

  // Mouse hover handler — tooltip only appears when cursor is on a bar
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const ri   = Math.floor((my - TOP_PAD) / ROW_H);
    if (ri < 0 || ri >= chartData.length) { setTip(null); return; }
    const d = chartData[ri];
    if (Math.abs(d.netGex) < maxAbsGex * 0.004) { setTip(null); return; }
    const absNorm = Math.abs(d.netGex) / maxAbsGex;
    const barW    = absNorm * HALF_W;
    if (barW < 0.5) { setTip(null); return; }
    const isPos = d.netGex >= 0;
    const bx    = isPos ? CENTER_X : CENTER_X - barW;
    if (mx < bx || mx > bx + barW) { setTip(null); return; }
    setTip({
      clientX: e.clientX,
      clientY: e.clientY,
      strike: d.strike, netGex: d.netGex, absNorm,
      vwap: vwapByStrike.get(d.strike),
    });
  }

  const overlayFs = Math.min(Math.floor(Math.max(HALF_W, 60) * 0.52), 68);

  return (
    <div style={{ flex: 1, minHeight: 0, width: "100%", position: "relative" }}>

      {/* ── CALL / PUT fixed overlay — stays put while chart scrolls ── */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center",
        pointerEvents: "none", zIndex: 2, overflow: "hidden",
      }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {/* PUT half */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{
            fontSize: overlayFs, fontFamily: FONT, fontWeight: 900,
            color: "#3060cc", opacity: 0.11,
            letterSpacing: "0.14em", userSelect: "none",
          }}>PUT</span>
        </div>
        {/* CALL half */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{
            fontSize: overlayFs, fontFamily: FONT, fontWeight: 900,
            color: "#c05000", opacity: 0.11,
            letterSpacing: "0.14em", userSelect: "none",
          }}>CALL</span>
        </div>
        <div style={{ width: RIGHT_M, flexShrink: 0 }} />
      </div>

      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflowY: "auto", overflowX: "hidden", position: "relative" }}
      >
      <svg
        width={w} height={svgH}
        style={{ display: "block" }}
        shapeRendering="crispEdges"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTip(null)}
      >
        <defs>
          <style>{`
            @keyframes barGrowPos {
              from { transform: scaleX(0); opacity: 0; }
              to   { transform: scaleX(1); opacity: 1; }
            }
            @keyframes barGrowNeg {
              from { transform: scaleX(0); opacity: 0; }
              to   { transform: scaleX(1); opacity: 1; }
            }
          `}</style>
          {/* +GEX (derecha): centro oscuro → naranja → amarillo brillante en punta */}
          <linearGradient id="barPosGrad" gradientUnits="objectBoundingBox"
            x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#120600" stopOpacity="0.85" />
            <stop offset="28%"  stopColor="#6a1800" stopOpacity="1.0" />
            <stop offset="55%"  stopColor="#d04800" stopOpacity="1.0" />
            <stop offset="78%"  stopColor="#f0a000" stopOpacity="1.0" />
            <stop offset="100%" stopColor="#ffe040" stopOpacity="1.0" />
          </linearGradient>

          {/* -GEX (izquierda): cyan brillante en punta → azul → centro oscuro */}
          <linearGradient id="barNegGrad" gradientUnits="objectBoundingBox"
            x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#b0e8ff" stopOpacity="1.0" />
            <stop offset="22%"  stopColor="#00aaee" stopOpacity="1.0" />
            <stop offset="50%"  stopColor="#0055cc" stopOpacity="1.0" />
            <stop offset="75%"  stopColor="#001a55" stopOpacity="1.0" />
            <stop offset="100%" stopColor="#00050f" stopOpacity="0.85" />
          </linearGradient>

          {/* Glow cálido para barras positivas */}
          <filter id="barHotGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Glow frío para barras negativas */}
          <filter id="barColdGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Glow amarillo para VWAP */}
          <filter id="glowYellow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Dividers de fila ── */}
        {chartData.map((_, i) => (
          <line key={i}
            x1={LABEL_W} y1={TOP_PAD + i * ROW_H}
            x2={w - RIGHT_M} y2={TOP_PAD + i * ROW_H}
            stroke="#0b0b18" strokeWidth={0.5}
          />
        ))}

        {/* ── Highlight de fila hover ── */}
        {tip && (() => {
          const ri = chartData.findIndex(d => d.strike === tip.strike);
          if (ri < 0) return null;
          return (
            <rect
              x={LABEL_W} y={TOP_PAD + ri * ROW_H}
              width={CHART_W} height={ROW_H}
              fill="rgba(255,255,255,0.04)"
            />
          );
        })()}

        {/* ── Línea central (cero) ── */}
        <line x1={CENTER_X} y1={TOP_PAD} x2={CENTER_X} y2={TOP_PAD + CHART_H}
          stroke="#181828" strokeWidth={1} />

        {/* ── Barras de gamma con animación de entrada ── */}
        {chartData.map((d, i) => {
          if (Math.abs(d.netGex) < maxAbsGex * 0.004) return null;
          const absNorm  = Math.abs(d.netGex) / maxAbsGex;
          const barW     = absNorm * HALF_W;
          if (barW < 0.5) return null;
          const bTop     = rowY(i) - BAR_H / 2;
          const isPos    = d.netGex >= 0;
          const bx       = isPos ? CENTER_X : CENTER_X - barW;
          const isAtm    = d.strike === nearestSpotStrike;
          const isHot      = absNorm > 0.55;
          const isHovered  = tip?.strike === d.strike;
          const glowId     = isPos ? "url(#barHotGlow)" : "url(#barColdGlow)";
          const barFill    = solidColors
            ? (isPos ? "#00ff44" : "#ff2233")
            : (isPos ? "url(#barPosGrad)" : "url(#barNegGrad)");
          const tipColor   = solidColors
            ? (isPos ? "#00ff44" : "#ff2233")
            : (isPos ? "#ffe040" : "#b0e8ff");
          const hoverFill  = solidColors
            ? (isPos ? "rgba(0,255,68,0.12)"  : "rgba(255,34,51,0.12)")
            : (isPos ? "rgba(255,224,64,0.10)" : "rgba(176,232,255,0.10)");
          const hoverStroke = solidColors
            ? (isPos ? "#00ff4499" : "#ff223399")
            : (isPos ? "#ffe04099" : "#b0e8ff99");
          const delay      = mounted ? Math.min(i * 14, 400) : 0;

          return (
            <g
              key={d.strike}
              style={{
                transformBox: "fill-box",
                transformOrigin: isPos ? "left center" : "right center",
                animation: mounted
                  ? `${isPos ? "barGrowPos" : "barGrowNeg"} 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`
                  : "none",
              }}
            >
              <rect
                x={bx} y={bTop}
                width={Math.max(barW, 0.5)} height={BAR_H}
                fill={barFill}
                fillOpacity={solidColors ? (0.45 + absNorm * 0.55) : 1}
                rx={1.5}
                filter={isHot || isAtm || isHovered ? glowId : undefined}
              />
              {isHot && barW > 5 && (
                <rect
                  x={isPos ? CENTER_X + barW - 4 : CENTER_X - barW}
                  y={bTop} width={4} height={BAR_H}
                  fill={tipColor} fillOpacity={0.85}
                  rx={1} filter={glowId}
                />
              )}
              {/* Hover highlight outline */}
              {isHovered && (
                <rect
                  x={bx} y={bTop}
                  width={Math.max(barW, 0.5)} height={BAR_H}
                  fill={hoverFill}
                  stroke={hoverStroke}
                  strokeWidth={1}
                  rx={1.5}
                />
              )}
            </g>
          );
        })}

        {/* ── Strike labels — heatmap cell style ── */}
        {chartData.map((d, i) => {
          const isAtm   = d.strike === nearestSpotStrike;
          const cellTop = TOP_PAD + i * ROW_H;
          return (
            <g key={d.strike}>
              {/* Cell background */}
              <rect x={0} y={cellTop} width={LABEL_W} height={ROW_H}
                fill={isAtm ? "#071828" : "#030508"} />
              {/* ATM left accent line */}
              {isAtm && <rect x={0} y={cellTop} width={2} height={ROW_H} fill="#00c8ff" />}
              {/* SPOT badge (tiny, above number) */}
              {isAtm && (
                <text x={4} y={cellTop + ROW_H * 0.38}
                  fill="#00aadd" fontSize={5} fontFamily={FONT}
                  fontWeight={700} letterSpacing="0.07em">
                  SPOT
                </text>
              )}
              {/* Strike value */}
              <text
                x={LABEL_W - 3} y={rowY(i) + (isAtm ? 4 : 3.5)}
                textAnchor="end"
                fill={isAtm ? "#00ccff" : "#1a3050"}
                fontSize={isAtm ? 8.5 : 7.5}
                fontFamily={FONT}
                fontWeight={isAtm ? 700 : 400}
              >
                ${d.strike}
              </text>
            </g>
          );
        })}

        {/* ── SPOT line ── */}
        {spotIdx >= 0 && (
          <line x1={LABEL_W} y1={spotY} x2={w - RIGHT_M} y2={spotY}
            stroke="#fbbf2455" strokeWidth={0.8} strokeDasharray="3 4" />
        )}

        {/* ── Gamma flip line ── */}
        {flipY != null && (
          <line x1={LABEL_W} y1={flipY} x2={w - RIGHT_M} y2={flipY}
            stroke="#7c3aed55" strokeWidth={0.7} strokeDasharray="2 5" />
        )}

        {/* ── VWAP curve (amarillo, opacidad reducida) ── */}
        {vwapPts.length > 1 && (
          <>
            <path
              d={smoothPath(vwapPts)}
              fill="none" stroke="#f5d800" strokeWidth={1.4}
              strokeLinejoin="round" strokeLinecap="round"
              opacity={0.30}
              filter="url(#glowYellow)"
              shapeRendering="geometricPrecision"
            />
            {vwapSpot != null && vwapSpot > 0 && spotIdx >= 0 && (
              <text x={vwapToX(vwapSpot) + 5} y={spotY + 13}
                fill="#f5d800" fontSize={7} fontFamily={FONT}
                fontWeight={600} opacity={0.5} letterSpacing="0.04em">
                VWAP {vwapSpot.toFixed(2)}
              </text>
            )}
          </>
        )}

        {/* ── Headers ── */}
        <text x={LABEL_W + 6}               y={TOP_PAD - 1} fill="#3060bb" fontSize={7.5} fontFamily={FONT} fontWeight={700}>← PUT GEX</text>
        <text x={CENTER_X + CHART_W * 0.08} y={TOP_PAD - 1} fill="#c06000" fontSize={7.5} fontFamily={FONT} fontWeight={700}>CALL GEX →</text>
      </svg>

      {/* ── Tooltip hover — position:fixed tracks cursor precisely ── */}
      {tip && (() => {
        const isPos   = tip.netGex >= 0;
        const accent  = isPos ? "#ffe040" : "#b0e8ff";
        const accentD = isPos ? "#ffe04044" : "#b0e8ff44";
        const pct     = tip.absNorm * 100;
        const zone    = tip.absNorm > 0.75 ? "HOT" : tip.absNorm > 0.40 ? "WARM" : "COLD";
        const zoneColor = tip.absNorm > 0.75 ? "#ff4400" : tip.absNorm > 0.40 ? "#ffd000" : "#3a3a5a";
        const TW = 210;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const left = tip.clientX + 18 + TW > vpW ? tip.clientX - TW - 10 : tip.clientX + 18;
        const top  = Math.max(8, Math.min(tip.clientY - 48, vpH - 200));
        return (
          <div style={{
            position: "fixed", left, top,
            background: "#04040c",
            borderLeft: `3px solid ${accent}`,
            border: `1px solid ${accentD}`,
            borderLeftWidth: 3,
            borderLeftColor: accent,
            borderRadius: "0 4px 4px 0",
            padding: "9px 12px 9px 10px",
            pointerEvents: "none", zIndex: 9999,
            fontFamily: FONT, width: TW,
            boxShadow: `0 4px 32px #000a, 0 0 16px ${accentD}`,
          }}>
            {/* Strike + badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <div style={{ color: "#555", fontSize: 7, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 1 }}>STRIKE</div>
                <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>${tip.strike.toLocaleString()}</div>
              </div>
              <div style={{
                fontSize: 7, padding: "2px 6px", borderRadius: 2,
                background: `${accent}15`, color: accent,
                letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700,
                border: `1px solid ${accent}33`,
              }}>
                {isPos ? "CALL Γ" : "PUT Γ"}
              </div>
            </div>

            {/* NET GEX value */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ color: "#2a2a44", fontSize: 7, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>NET GEX</div>
              <div style={{ color: accent, fontSize: 13, fontWeight: 700 }}>{formatNumber(tip.netGex)}</div>
            </div>

            {/* Intensity bar */}
            <div style={{ marginBottom: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#2a2a44", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase" }}>INTENSITY</span>
                <span style={{ color: zoneColor, fontSize: 7, letterSpacing: "0.1em", fontWeight: 700 }}>{zone} · {pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 3, background: "#0e0e1e", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: isPos
                    ? `linear-gradient(to right, #7b00d4, #ffd000, #ff4400)`
                    : `linear-gradient(to right, #003388, #0088ff, #00ffcc)`,
                  borderRadius: 2,
                }} />
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "#0d0d20", margin: "0 0 6px" }} />

            {/* VWAP */}
            {tip.vwap != null && tip.vwap > 0 && (
              <TipRow label="VWAP" value={tip.vwap.toFixed(2)} color="#c8aa00" />
            )}
          </div>
        );
      })()}
      </div>{/* end containerRef */}
    </div>
  );
}

// ── Recharts tooltip (DEX / VEX tabs) ────────────────────────────
function DexVexTooltip({ active, payload, label, tab }: any) {
  if (!active || !payload?.length) return null;
  const cfg = DEXVEX_CFG[tab as "DEX" | "VEX"];
  return (
    <div style={{
      background: "rgba(8,8,16,0.98)", border: "1px solid #1e2224",
      borderRadius: 4, padding: "7px 12px", fontFamily: FONT,
      fontSize: 10, minWidth: 170, boxShadow: `0 0 14px ${cfg.color}44`,
    }}>
      <div style={{ color: "#333", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
        Strike {label}
      </div>
      {payload.map((p: any) => {
        const pos = (p.value ?? 0) >= 0;
        return (
          <div key={p.dataKey} style={{ color: pos ? cfg.posColor : cfg.negColor, fontWeight: 700, fontSize: 12 }}>
            {p.name}: {pos ? "+" : ""}{formatNumber(p.value)}
          </div>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────
export function GexNetHorizontalChart({
  exposures, spot, gammaFlip, height = "100%", contracts,
  collapsed, onCollapseToggle, bg, solidColors,
}: Props) {
  const [tab, setTab] = useState<Tab>("GEX");

  // Collapsed sidebar strip
  if (collapsed) {
    return (
      <div style={{
        width: 30, height,
        background: BG, border: `1px solid ${BORDER}`, borderRadius: 4,
        display: "flex", flexDirection: "column", alignItems: "center",
        fontFamily: FONT, overflow: "hidden",
      }}>
        <button
          onClick={onCollapseToggle}
          title="Expand GEX panel"
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "#ff4444", fontSize: 11, padding: "7px 0", width: "100%",
            textAlign: "center", lineHeight: 1,
          }}
        >▶</button>
        <div style={{
          writingMode: "vertical-rl", textOrientation: "mixed",
          transform: "rotate(180deg)",
          color: "#1a1a2e", fontSize: 7, letterSpacing: "0.22em",
          textTransform: "uppercase", fontWeight: 700, marginTop: 6,
          userSelect: "none",
        }}>GEX · GAMMA</div>
      </div>
    );
  }

  const { chartData, nearestSpotStrike, maxAbsGex } = useMemo(() => {
    const lo = spot * 0.88;
    const hi = spot * 1.12;
    const filtered = exposures
      .filter(d => d.strike >= lo && d.strike <= hi)
      .sort((a, b) => b.strike - a.strike);

    let nearest = filtered[0]?.strike ?? spot;
    let minDiff = Infinity;
    for (const d of filtered) {
      const diff = Math.abs(d.strike - spot);
      if (diff < minDiff) { minDiff = diff; nearest = d.strike; }
    }

    const data = filtered.map(d => ({
      strike: d.strike,
      netGex: d.netGex,
      dex:    d.dex ?? 0,
      vex:    d.vex ?? 0,
    }));

    const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.netGex)));
    return { chartData: data, nearestSpotStrike: nearest, maxAbsGex: maxAbs };
  }, [exposures, spot]);

  // OI-weighted IV per strike
  const ivByStrike = useMemo<Map<number, number>>(() => {
    const map = new Map<number, number>();
    if (contracts && contracts.length > 0) {
      const acc = new Map<number, { sw: number; w: number }>();
      for (const c of contracts) {
        if (c.strike < spot * 0.88 || c.strike > spot * 1.12) continue;
        const cur = acc.get(c.strike) ?? { sw: 0, w: 0 };
        cur.sw += c.iv * c.oi;
        cur.w  += c.oi;
        acc.set(c.strike, cur);
      }
      for (const [k, { sw, w }] of acc) {
        if (w > 0) map.set(k, sw / w);
      }
    } else {
      // Synthetic vol smile with negative skew
      for (const d of chartData) {
        const m     = d.strike / spot;
        const smile = 0.20 * (1 + 1.8 * Math.pow(m - 1, 2) + 0.25 * (m - 1));
        map.set(d.strike, Math.max(0.05, smile));
      }
    }
    return map;
  }, [contracts, chartData, spot]);

  // Cumulative OI-weighted premium proxy (VWAP substitute)
  const vwapByStrike = useMemo<Map<number, number>>(() => {
    const map = new Map<number, number>();
    let cumVol = 0, cumVal = 0;
    // Process top-to-bottom (chartData is sorted descending)
    if (contracts && contracts.length > 0) {
      const byStrike = new Map<number, { vol: number; val: number }>();
      for (const c of contracts) {
        if (c.strike < spot * 0.88 || c.strike > spot * 1.12) continue;
        const vol = (c.volume ?? 0) > 0 ? c.volume! : c.oi * 0.08;
        const mid = c.bid != null && c.ask != null
          ? (c.bid + c.ask) / 2
          : c.last != null && c.last > 0
            ? c.last
            : c.iv * Math.sqrt(Math.max(c.expiry, 1) / 365) * spot * 0.38;
        const cur = byStrike.get(c.strike) ?? { vol: 0, val: 0 };
        cur.vol += vol;
        cur.val += vol * mid;
        byStrike.set(c.strike, cur);
      }
      for (const d of chartData) {
        const v = byStrike.get(d.strike);
        if (v && v.vol > 0) {
          cumVol += v.vol;
          cumVal += v.val;
          map.set(d.strike, cumVol > 0 ? cumVal / cumVol : 0);
        }
      }
    } else {
      for (const d of chartData) {
        const iv = ivByStrike.get(d.strike) ?? 0.20;
        cumVol += 1;
        cumVal += iv * d.strike;
        map.set(d.strike, cumVal / cumVol);
      }
    }
    return map;
  }, [contracts, chartData, ivByStrike, spot]);

  return (
    <div style={{
      background: bg ?? BG, border: `1px solid ${BORDER}`, borderRadius: 4,
      padding: "8px 6px 6px", height,
      display: "flex", flexDirection: "column", fontFamily: FONT,
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 5, paddingLeft: 4, paddingRight: 4, flexShrink: 0,
      }}>
        <div>
          <div style={{ color: "#252535", fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 700 }}>
            GAMMA EXPOSURE · {tab}
          </div>
          {tab === "GEX" && (
            <div style={{ display: "flex", gap: 10, marginTop: 2, alignItems: "center" }}>
              <div style={{ width: 36, height: 5, borderRadius: 1, background: "linear-gradient(to right,#330066,#8800cc,#dd6600,#ffee00)" }} />
              <span style={{ fontSize: 7, color: "#555", letterSpacing: "0.06em" }}>FRÍO → CALIENTE</span>
              <span style={{ fontSize: 7, color: "#00b8cc", letterSpacing: "0.06em" }}>— IV</span>
              <span style={{ fontSize: 7, color: "#c8aa00", letterSpacing: "0.06em" }}>— VWAP</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {(["GEX", "DEX", "VEX"] as Tab[]).map(t => {
            const tc = t === "GEX" ? "#ff4444" : t === "DEX" ? "#06b6d4" : "#facc15";
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${tc}12` : "transparent",
                  border: `1px solid ${tab === t ? tc : "#161626"}`,
                  color: tab === t ? tc : "#252540",
                  borderRadius: 3, padding: "2px 8px",
                  fontSize: 8.5, fontFamily: FONT, cursor: "pointer",
                  fontWeight: tab === t ? 700 : 400, letterSpacing: "0.1em",
                }}
              >
                {t}
              </button>
            );
          })}
          {/* Collapse toggle */}
          {onCollapseToggle && (
            <button
              onClick={onCollapseToggle}
              title="Ocultar panel GEX"
              style={{
                background: "transparent", border: "1px solid #161626",
                color: "#252540", borderRadius: 3, padding: "2px 6px",
                fontSize: 9, fontFamily: FONT, cursor: "pointer",
                lineHeight: 1,
              }}
            >◀</button>
          )}
        </div>
      </div>

      {/* ── SPOT badge ── */}
      <div style={{ paddingLeft: 4, marginBottom: 4, flexShrink: 0 }}>
        <span style={{
          background: "#100c00", border: "1px solid #fbbf2440",
          borderRadius: 2, color: "#fbbf24", fontSize: 7.5,
          fontFamily: FONT, padding: "1px 7px", letterSpacing: "0.1em", fontWeight: 700,
        }}>
          SPOT ${spot}
        </span>
      </div>

      {/* ── Chart area ── */}
      {tab === "GEX" ? (
        <GammaSVGChart
          chartData={chartData}
          spot={spot}
          gammaFlip={gammaFlip}
          maxAbsGex={maxAbsGex}
          ivByStrike={ivByStrike}
          vwapByStrike={vwapByStrike}
          nearestSpotStrike={nearestSpotStrike}
          solidColors={solidColors}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical" data={chartData}
              margin={{ top: 2, right: 56, bottom: 2, left: 2 }}
              barCategoryGap="10%"
            >
              <CartesianGrid horizontal={false} stroke="#0a0a14" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatNumber(v, 1)}
                tick={{ fill: "#252530", fontSize: 8, fontFamily: FONT }}
                axisLine={{ stroke: "#141420" }}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <YAxis
                type="category"
                dataKey="strike"
                tick={({ x, y, payload }: any) => {
                  const isAtm = payload.value === nearestSpotStrike;
                  return (
                    <text
                      x={x - 3} y={y + 4} textAnchor="end"
                      fill={isAtm ? "#fbbf24" : "#1e2228"}
                      fontSize={isAtm ? 9 : 8}
                      fontFamily={FONT}
                      fontWeight={isAtm ? 700 : 400}
                    >
                      {payload.value}
                    </text>
                  );
                }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                content={({ active, payload, label }) => (
                  <DexVexTooltip active={active} payload={payload} label={label} tab={tab} />
                )}
                cursor={{ fill: "rgba(255,255,255,0.015)" }}
              />
              <ReferenceLine x={0} stroke="#181828" strokeWidth={1} />
              <ReferenceLine
                y={nearestSpotStrike}
                stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3 3"
                label={{ value: `$ ${spot}`, position: "right", fill: "#fbbf24", fontSize: 8, fontFamily: FONT }}
              />
              <Bar
                dataKey={tab === "DEX" ? "dex" : "vex"}
                name={tab}
                maxBarSize={22}
                isAnimationActive={false}
                radius={[0, 0, 0, 0]}
              >
                {chartData.map((d, i) => {
                  const val = tab === "DEX" ? d.dex : d.vex;
                  const cfg = DEXVEX_CFG[tab as "DEX" | "VEX"];
                  return <Cell key={i} fill={val >= 0 ? cfg.posColor : cfg.negColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

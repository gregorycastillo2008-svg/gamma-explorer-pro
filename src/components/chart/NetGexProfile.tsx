import { useEffect, useMemo, useRef, useState } from "react";
import type { StrikeRow } from "./GEXBarsPanel";

interface Props {
  symbol: string;
  spot: number;
  dte: number;
  rows: StrikeRow[];
}

const BG = "#0a0e17";
const GRID = "#1f2937";
const AXIS = "#8894a8";
const RED = "#ff4466";
const GREEN = "#00ff88";
const YELLOW = "#ffdd44";
const CYAN = "#22d3ee";

// Layout
const M = { top: 36, right: 90, bottom: 40, left: 70 };

interface Point { strike: number; netGex: number; callOI: number; putOI: number }

function fmtK(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

export function NetGexProfile({ symbol, spot, dte, rows }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 800 });
  const [hover, setHover] = useState<Point | null>(null);
  const [animT, setAnimT] = useState(0);

  // Resize observer
  useEffect(() => {
    if (!hostRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!hostRef.current) return;
      setSize({
        w: hostRef.current.clientWidth,
        h: hostRef.current.clientHeight,
      });
    });
    ro.observe(hostRef.current);
    setSize({
      w: hostRef.current.clientWidth,
      h: hostRef.current.clientHeight,
    });
    return () => ro.disconnect();
  }, []);

  // Bar load animation
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / 800);
      setAnimT(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setAnimT(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rows.length, symbol]);

  // Build points sorted ASC by strike
  const points: Point[] = useMemo(() => {
    return rows
      .map((r) => ({
        strike: r.strike,
        netGex: r.callGEX - r.putGEX,
        callOI: r.callOI,
        putOI: r.putOI,
      }))
      .sort((a, b) => a.strike - b.strike);
  }, [rows]);

  const callWall = useMemo(() => {
    let best: Point | null = null;
    for (const p of points) if (p.netGex > 0 && (!best || p.netGex > best.netGex)) best = p;
    return best;
  }, [points]);
  const putWall = useMemo(() => {
    let best: Point | null = null;
    for (const p of points) if (p.netGex < 0 && (!best || p.netGex < best.netGex)) best = p;
    return best;
  }, [points]);
  const volTrigger = useMemo(() => {
    // Strike where cumulative netGEX crosses 0 (gamma flip)
    let cum = 0;
    for (let i = 0; i < points.length; i++) {
      const before = cum;
      cum += points[i].netGex;
      if ((before <= 0 && cum > 0) || (before >= 0 && cum < 0)) return points[i].strike;
    }
    return spot;
  }, [points, spot]);

  // Scales
  const { w, h } = size;
  const innerW = Math.max(100, w - M.left - M.right);
  const innerH = Math.max(100, h - M.top - M.bottom);

  const minStrike = points.length ? points[0].strike : spot * 0.95;
  const maxStrike = points.length ? points[points.length - 1].strike : spot * 1.05;
  const yScale = (s: number) =>
    M.top + innerH - ((s - minStrike) / Math.max(1e-9, maxStrike - minStrike)) * innerH;

  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.netGex)));
  const xMid = M.left + innerW / 2;
  const xScale = (v: number) => xMid + (v / maxAbs) * (innerW / 2);

  // Y-axis ticks (~12)
  const yTicks = useMemo(() => {
    if (!points.length) return [] as number[];
    const span = maxStrike - minStrike;
    const step = niceStep(span / 12);
    const out: number[] = [];
    const start = Math.ceil(minStrike / step) * step;
    for (let v = start; v <= maxStrike; v += step) out.push(v);
    return out;
  }, [minStrike, maxStrike, points.length]);

  // X-axis ticks symmetric around 0
  const xTicks = useMemo(() => {
    const step = niceStep(maxAbs / 4);
    const out: number[] = [];
    for (let v = -Math.ceil(maxAbs / step) * step; v <= maxAbs; v += step) out.push(v);
    return out;
  }, [maxAbs]);

  // Smooth profile curves: probability-like envelope from |netGex| at each strike
  const callPath = useMemo(() => buildEnvelope(points, "call", xScale, yScale, M.left, innerW), [points, w, h, animT]);
  const putPath = useMemo(() => buildEnvelope(points, "put", xScale, yScale, M.left, innerW), [points, w, h, animT]);

  // Strikes to annotate (top 4 by |netGex|)
  const annotated = useMemo(() => {
    return [...points].sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex)).slice(0, 4);
  }, [points]);

  return (
    <div ref={hostRef} className="relative w-full h-full overflow-hidden" style={{ background: BG }}>
      <svg width={w} height={h} className="block font-mono">
        <defs>
          <linearGradient id="gex-green" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.55" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="gex-red" x1="1" x2="0" y1="0" y2="0">
            <stop offset="0%" stopColor={RED} stopOpacity="0.55" />
            <stop offset="100%" stopColor={RED} stopOpacity="1" />
          </linearGradient>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Title */}
        <text
          x={w / 2}
          y={20}
          textAnchor="middle"
          fill="#e5e7eb"
          fontSize={12}
          fontWeight={700}
          letterSpacing={1.5}
        >
          {symbol} NET GEX (OPEN INTEREST) ({dte} DTE)
        </text>

        {/* Grid: vertical (x) */}
        {xTicks.map((v, i) => (
          <line
            key={`vx-${i}`}
            x1={xScale(v)}
            x2={xScale(v)}
            y1={M.top}
            y2={M.top + innerH}
            stroke={GRID}
            strokeDasharray="2 4"
            strokeWidth={0.5}
          />
        ))}
        {/* Grid: horizontal (y) */}
        {yTicks.map((s, i) => (
          <line
            key={`hy-${i}`}
            x1={M.left}
            x2={M.left + innerW}
            y1={yScale(s)}
            y2={yScale(s)}
            stroke={GRID}
            strokeDasharray="2 4"
            strokeWidth={0.5}
          />
        ))}

        {/* Axis labels Y */}
        {yTicks.map((s, i) => (
          <text
            key={`ly-${i}`}
            x={M.left - 6}
            y={yScale(s) + 3}
            textAnchor="end"
            fill={AXIS}
            fontSize={9}
          >
            {s.toFixed(s >= 100 ? 0 : 1)}
          </text>
        ))}
        {/* Axis labels X */}
        {xTicks.map((v, i) => (
          <text
            key={`lx-${i}`}
            x={xScale(v)}
            y={M.top + innerH + 14}
            textAnchor="middle"
            fill={AXIS}
            fontSize={9}
          >
            {fmtK(v)}
          </text>
        ))}
        <text
          x={M.left + innerW / 2}
          y={M.top + innerH + 30}
          textAnchor="middle"
          fill={AXIS}
          fontSize={9}
        >
          GEX (OPEN INTEREST)
        </text>

        {/* PUTS / CALLS section labels */}
        <text x={M.left + innerW * 0.25} y={M.top - 6} textAnchor="middle" fill={AXIS} fontSize={9} letterSpacing={2}>
          PUTS
        </text>
        <text x={M.left + innerW * 0.75} y={M.top - 6} textAnchor="middle" fill={AXIS} fontSize={9} letterSpacing={2}>
          CALLS
        </text>

        {/* Center axis */}
        <line x1={xMid} x2={xMid} y1={M.top} y2={M.top + innerH} stroke={AXIS} strokeWidth={0.5} opacity={0.5} />

        {/* Bars */}
        {points.map((p) => {
          const y = yScale(p.strike) - 6;
          const pos = p.netGex >= 0;
          const x0 = xMid;
          const x1 = xScale(p.netGex * animT);
          const left = Math.min(x0, x1);
          const width = Math.abs(x1 - x0);
          if (width < 0.5) return null;
          return (
            <g key={`bar-${p.strike}`}>
              <rect
                x={left}
                y={y}
                width={width}
                height={12}
                rx={3}
                fill={pos ? "url(#gex-green)" : "url(#gex-red)"}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "crosshair" }}
              />
              {/* Bright leading edge */}
              <rect
                x={pos ? x1 - 1.5 : left}
                y={y}
                width={1.5}
                height={12}
                fill={pos ? GREEN : RED}
                opacity={0.9}
              />
              {/* Connector dotted line to envelope */}
              <line
                x1={x1}
                x2={pos ? M.left + innerW * 0.78 : M.left + innerW * 0.22}
                y1={y + 6}
                y2={y + 6}
                stroke={YELLOW}
                strokeOpacity={0.25}
                strokeDasharray="1 3"
                strokeWidth={0.5}
              />
            </g>
          );
        })}

        {/* Probability-style envelope curves */}
        {callPath && (
          <path
            d={callPath}
            fill="none"
            stroke={YELLOW}
            strokeWidth={1.5}
            opacity={0.9 * animT}
            filter="url(#glow)"
          />
        )}
        {putPath && (
          <path
            d={putPath}
            fill="none"
            stroke={YELLOW}
            strokeWidth={1.5}
            opacity={0.9 * animT}
            filter="url(#glow)"
          />
        )}

        {/* Critical lines */}
        {callWall && (
          <>
            <line
              x1={xScale(callWall.netGex)}
              x2={xScale(callWall.netGex)}
              y1={M.top}
              y2={M.top + innerH}
              stroke={YELLOW}
              strokeDasharray="4 3"
              strokeWidth={1}
              opacity={0.85}
            />
            <text
              x={xScale(callWall.netGex)}
              y={M.top + 12}
              textAnchor="middle"
              fill={YELLOW}
              fontSize={9}
              fontWeight={700}
            >
              CALL WALL: ${callWall.strike.toFixed(2)}
            </text>
          </>
        )}
        {putWall && (
          <>
            <line
              x1={xScale(putWall.netGex)}
              x2={xScale(putWall.netGex)}
              y1={M.top}
              y2={M.top + innerH}
              stroke={YELLOW}
              strokeDasharray="4 3"
              strokeWidth={1}
              opacity={0.85}
            />
            <text
              x={xScale(putWall.netGex)}
              y={M.top + 12}
              textAnchor="middle"
              fill={YELLOW}
              fontSize={9}
              fontWeight={700}
            >
              PUT WALL: ${putWall.strike.toFixed(2)}
            </text>
          </>
        )}

        {/* SPOT vertical reference at center axis (already at 0 GEX = spot) — show horizontal */}
        <line
          x1={M.left}
          x2={M.left + innerW}
          y1={yScale(spot)}
          y2={yScale(spot)}
          stroke={CYAN}
          strokeDasharray="4 3"
          strokeWidth={1}
          opacity={0.9}
        />
        <text
          x={M.left + innerW + 4}
          y={yScale(spot) + 3}
          fill={CYAN}
          fontSize={9}
          fontWeight={700}
        >
          SPOT ${spot.toFixed(2)}
        </text>

        {/* TOTAL VOL TRIGGER (gamma flip) */}
        <line
          x1={M.left}
          x2={M.left + innerW}
          y1={yScale(volTrigger)}
          y2={yScale(volTrigger)}
          stroke={YELLOW}
          strokeDasharray="2 5"
          strokeWidth={1}
          opacity={0.7}
        />
        <text
          x={M.left + 4}
          y={yScale(volTrigger) - 3}
          fill={YELLOW}
          fontSize={9}
        >
          TOTAL VOL TRIGGER: ${volTrigger.toFixed(2)}
        </text>

        {/* Annotations on biggest strikes */}
        {annotated.map((p) => {
          const pcr = p.callOI > 0 ? p.putOI / p.callOI : 0;
          const xLab = p.netGex >= 0 ? M.left + innerW - 8 : M.left + 8;
          const anchor = p.netGex >= 0 ? "end" : "start";
          return (
            <text
              key={`ann-${p.strike}`}
              x={xLab}
              y={yScale(p.strike) - 8}
              textAnchor={anchor as any}
              fill="#cbd5e1"
              fontSize={8}
            >
              <tspan fill={YELLOW}>${p.strike.toFixed(2)}</tspan>{" "}
              GEX:{" "}
              <tspan fill={p.netGex >= 0 ? GREEN : RED}>{fmtK(p.netGex)}</tspan>{" "}
              P/C: {pcr.toFixed(2)}
            </text>
          );
        })}

        {/* Tooltip */}
        {hover && (
          <g>
            <rect
              x={Math.min(w - 200, xScale(hover.netGex) + 8)}
              y={yScale(hover.strike) - 38}
              width={190}
              height={52}
              fill="rgba(0,0,0,0.92)"
              stroke={CYAN}
              strokeWidth={0.5}
              rx={3}
            />
            <text x={Math.min(w - 200, xScale(hover.netGex) + 8) + 6} y={yScale(hover.strike) - 24} fill={YELLOW} fontSize={9} fontWeight={700}>
              STRIKE ${hover.strike.toFixed(2)}
            </text>
            <text x={Math.min(w - 200, xScale(hover.netGex) + 8) + 6} y={yScale(hover.strike) - 12} fill={hover.netGex >= 0 ? GREEN : RED} fontSize={9}>
              NET GEX: {hover.netGex >= 0 ? "+" : ""}{fmtK(hover.netGex)}
            </text>
            <text x={Math.min(w - 200, xScale(hover.netGex) + 8) + 6} y={yScale(hover.strike) - 1} fill="#cbd5e1" fontSize={9}>
              Call OI: {fmtK(hover.callOI)}  Put OI: {fmtK(hover.putOI)}
            </text>
            <text x={Math.min(w - 200, xScale(hover.netGex) + 8) + 6} y={yScale(hover.strike) + 10} fill={AXIS} fontSize={9}>
              P/C: {(hover.callOI > 0 ? hover.putOI / hover.callOI : 0).toFixed(2)}
            </text>
          </g>
        )}

        {/* Watermark */}
        <text x={w - 10} y={h - 8} textAnchor="end" fill="#475569" fontSize={9} letterSpacing={2}>
          gex bot
        </text>
      </svg>
    </div>
  );
}

function niceStep(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / exp;
  let n = 1;
  if (f < 1.5) n = 1;
  else if (f < 3) n = 2;
  else if (f < 7) n = 5;
  else n = 10;
  return n * exp;
}

function buildEnvelope(
  points: Point[],
  side: "call" | "put",
  xScale: (v: number) => number,
  yScale: (s: number) => number,
  left: number,
  innerW: number,
): string | null {
  if (!points.length) return null;
  const xMid = left + innerW / 2;
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.netGex)));
  // Build catmull-like smoothed path through points
  const coords = points.map((p) => {
    const mag = Math.abs(p.netGex) / maxAbs;
    const x = side === "call" ? xMid + mag * (innerW / 2) * 0.85 : xMid - mag * (innerW / 2) * 0.85;
    return { x, y: yScale(p.strike) };
  });
  if (coords.length < 2) return null;
  let d = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const cx = (prev.x + cur.x) / 2;
    const cy = (prev.y + cur.y) / 2;
    d += ` Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)}`;
  }
  const last = coords[coords.length - 1];
  d += ` T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

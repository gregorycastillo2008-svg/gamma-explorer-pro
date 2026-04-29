import { useEffect, useMemo, useRef, useState } from "react";

interface ChainContract {
  ticker: string; strike: number; expiration: string; side: "call" | "put";
  bid: number; ask: number; last: number; iv: number; oi: number; volume: number;
  delta: number; gamma: number; theta: number; vega: number;
}

interface Props {
  symbol: string;
  spot: number;
  contracts: ChainContract[];
}

const BG = "#0a0e17";
const GRID = "#1a2030";
const AXIS = "#8894a8";
const YELLOW = "#ffdd44";
const CYAN = "#22d3ee";

// Distinct neon palette per expiration ordered by DTE
const PALETTE = [
  "#ff4466", // red
  "#ff7733", // orange
  "#ffaa00", // amber
  "#ffd84d", // yellow
  "#7df09b", // mint
  "#22e3a3", // cyan-green
  "#22d3ee", // cyan
  "#a855f7", // purple
  "#f472b6", // pink
  "#facc15",
];

const M = { top: 26, right: 90, bottom: 90, left: 56 };

interface StrikeAgg {
  strike: number;
  // segment per expiration index, gex (signed = call - put)
  segments: { expIdx: number; gex: number }[];
  totalNet: number; // sum signed
  totalAbs: number; // sum |gex| (used for bar length on each side)
  callOI: number;
  putOI: number;
}

interface ExpInfo {
  expiration: string;
  dte: number;
  color: string;
  label: string;
  totalGex: number;
  callOI: number;
  putOI: number;
  ivAvg: number;
  skewAvg: number;
}

function daysUntil(iso: string): number {
  const exp = new Date(iso + "T21:00:00Z").getTime();
  return Math.max(0, Math.round((exp - Date.now()) / 86_400_000));
}

function fmtVal(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

function expLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `(W)${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")} '${String(d.getUTCFullYear()).slice(2)}`;
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

export function NetGexProfile({ symbol, spot, contracts }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 900 });
  const [hover, setHover] = useState<{ strike: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!hostRef.current) return;
      setSize({ w: hostRef.current.clientWidth, h: hostRef.current.clientHeight });
    });
    ro.observe(hostRef.current);
    setSize({ w: hostRef.current.clientWidth, h: hostRef.current.clientHeight });
    return () => ro.disconnect();
  }, []);

  // --- Group expirations (top by total |gex|), assign colors
  const { expInfos, expIndex } = useMemo(() => {
    const expMap = new Map<string, ExpInfo>();
    for (const c of contracts) {
      const dte = daysUntil(c.expiration);
      const gex = (c.gamma || 0) * (c.oi || 0) * 100 * spot * spot * 0.01 * (c.side === "call" ? 1 : -1);
      const cur = expMap.get(c.expiration) ?? {
        expiration: c.expiration,
        dte,
        color: "",
        label: expLabel(c.expiration),
        totalGex: 0, callOI: 0, putOI: 0, ivAvg: 0, skewAvg: 0,
      };
      cur.totalGex += gex;
      if (c.side === "call") cur.callOI += c.oi || 0;
      else cur.putOI += c.oi || 0;
      cur.ivAvg += c.iv || 0;
      expMap.set(c.expiration, cur);
    }
    // Pick top N by gross |totalGex| (limit 8) ordered by DTE
    const all = Array.from(expMap.values()).sort((a, b) => Math.abs(b.totalGex) - Math.abs(a.totalGex));
    const picked = all.slice(0, 8).sort((a, b) => a.dte - b.dte);
    picked.forEach((e, i) => { e.color = PALETTE[i % PALETTE.length]; });
    const idx = new Map<string, number>();
    picked.forEach((e, i) => idx.set(e.expiration, i));
    return { expInfos: picked, expIndex: idx };
  }, [contracts, spot]);

  // --- Aggregate per strike with segments per expiration
  const strikes: StrikeAgg[] = useMemo(() => {
    const map = new Map<number, StrikeAgg>();
    for (const c of contracts) {
      const eIdx = expIndex.get(c.expiration);
      if (eIdx == null) continue; // not in top expirations
      const cur = map.get(c.strike) ?? {
        strike: c.strike, segments: [], totalNet: 0, totalAbs: 0, callOI: 0, putOI: 0,
      };
      const gex = (c.gamma || 0) * (c.oi || 0) * 100 * spot * spot * 0.01 * (c.side === "call" ? 1 : -1);
      const seg = cur.segments.find((s) => s.expIdx === eIdx);
      if (seg) seg.gex += gex;
      else cur.segments.push({ expIdx: eIdx, gex });
      cur.totalNet += gex;
      if (c.side === "call") cur.callOI += c.oi || 0;
      else cur.putOI += c.oi || 0;
      map.set(c.strike, cur);
    }
    // Filter strikes within ±15% of spot for chart density
    const arr = Array.from(map.values()).filter((s) => Math.abs(s.strike - spot) / spot < 0.15);
    arr.forEach((s) => { s.totalAbs = s.segments.reduce((a, b) => a + Math.abs(b.gex), 0); });
    return arr.sort((a, b) => a.strike - b.strike);
  }, [contracts, spot, expIndex]);

  // Walls + zero-gamma trigger
  const callWall = useMemo(() => {
    let best: StrikeAgg | null = null;
    for (const s of strikes) if (s.totalNet > 0 && (!best || s.totalNet > best.totalNet)) best = s;
    return best;
  }, [strikes]);
  const putWall = useMemo(() => {
    let best: StrikeAgg | null = null;
    for (const s of strikes) if (s.totalNet < 0 && (!best || s.totalNet < best.totalNet)) best = s;
    return best;
  }, [strikes]);
  const volTrigger = useMemo(() => {
    let cum = 0;
    for (let i = 0; i < strikes.length; i++) {
      const before = cum;
      cum += strikes[i].totalNet;
      if ((before <= 0 && cum > 0) || (before >= 0 && cum < 0)) return strikes[i].strike;
    }
    return spot;
  }, [strikes, spot]);

  // --- Layout
  const { w, h } = size;
  const innerW = Math.max(100, w - M.left - M.right);
  const innerH = Math.max(100, h - M.top - M.bottom);
  const xMid = M.left + innerW / 2;

  const minStrike = strikes.length ? strikes[0].strike : spot * 0.9;
  const maxStrike = strikes.length ? strikes[strikes.length - 1].strike : spot * 1.1;
  const yScale = (s: number) =>
    M.top + innerH - ((s - minStrike) / Math.max(1e-9, maxStrike - minStrike)) * innerH;

  const maxAbsTotal = Math.max(1, ...strikes.map((s) =>
    Math.max(
      s.segments.filter((x) => x.gex < 0).reduce((a, b) => a + Math.abs(b.gex), 0),
      s.segments.filter((x) => x.gex > 0).reduce((a, b) => a + b.gex, 0),
    )
  ));
  const xScale = (v: number) => xMid + (v / maxAbsTotal) * (innerW / 2) * 0.95;

  // Tick generation
  const yTicks = useMemo(() => {
    if (!strikes.length) return [];
    const span = maxStrike - minStrike;
    const step = niceStep(span / 18) || 1;
    const out: number[] = [];
    const start = Math.ceil(minStrike / step) * step;
    for (let v = start; v <= maxStrike + 1e-6; v += step) out.push(Number(v.toFixed(2)));
    return out;
  }, [minStrike, maxStrike, strikes.length]);

  const xTicks = useMemo(() => {
    const step = niceStep(maxAbsTotal / 4) || 1;
    const out: number[] = [];
    for (let v = -Math.ceil(maxAbsTotal / step) * step; v <= maxAbsTotal + 1e-6; v += step) {
      out.push(Number(v.toFixed(2)));
    }
    return out;
  }, [maxAbsTotal]);

  // Serpentine paths per expiration: line through (gexAtStrike, strike) for each strike
  const expPaths = useMemo(() => {
    return expInfos.map((info, idx) => {
      const pts = strikes.map((s) => {
        const seg = s.segments.find((x) => x.expIdx === idx);
        const v = seg ? seg.gex : 0;
        return { x: xScale(v), y: yScale(s.strike) };
      });
      if (pts.length < 2) return { d: "", color: info.color };
      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1], cur = pts[i];
        const cx = (prev.x + cur.x) / 2;
        const cy = (prev.y + cur.y) / 2;
        d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
      }
      const last = pts[pts.length - 1];
      d += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
      return { d, color: info.color };
    });
  }, [expInfos, strikes, xMid, innerW, innerH, w, h]);

  return (
    <div ref={hostRef} className="relative w-full h-full overflow-hidden" style={{ background: BG }}>
      <svg width={w} height={h} className="block font-mono">
        <defs>
          <filter id="ngex-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.8" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Title */}
        <text x={w / 2} y={16} textAnchor="middle" fill="#e5e7eb" fontSize={11} fontWeight={700} letterSpacing={1.5}>
          ${symbol} NET GEX (OPEN INTEREST)
        </text>

        {/* Section labels */}
        <text x={M.left + innerW * 0.25} y={M.top - 4} textAnchor="middle" fill="#475569" fontSize={20} fontWeight={300} letterSpacing={4}>
          PUTS
        </text>
        <text x={M.left + innerW * 0.75} y={M.top - 4} textAnchor="middle" fill="#475569" fontSize={20} fontWeight={300} letterSpacing={4}>
          CALLS
        </text>

        {/* Grid X */}
        {xTicks.map((v, i) => (
          <line key={`gx-${i}`} x1={xScale(v)} x2={xScale(v)} y1={M.top} y2={M.top + innerH}
            stroke={GRID} strokeDasharray="2 4" strokeWidth={0.5} />
        ))}
        {/* Grid Y */}
        {yTicks.map((s, i) => (
          <line key={`gy-${i}`} x1={M.left} x2={M.left + innerW} y1={yScale(s)} y2={yScale(s)}
            stroke={GRID} strokeDasharray="2 4" strokeWidth={0.4} />
        ))}

        {/* Axis labels Y */}
        {yTicks.map((s, i) => (
          <text key={`ly-${i}`} x={M.left - 6} y={yScale(s) + 3} textAnchor="end" fill={AXIS} fontSize={8.5}>
            ${s.toFixed(2)}
          </text>
        ))}
        <text
          x={14}
          y={M.top + innerH / 2}
          textAnchor="middle"
          fill={AXIS}
          fontSize={9}
          letterSpacing={2}
          transform={`rotate(-90, 14, ${M.top + innerH / 2})`}
        >
          STRIKE
        </text>

        {/* Axis labels X */}
        {xTicks.map((v, i) => (
          <text key={`lx-${i}`} x={xScale(v)} y={M.top + innerH + 14} textAnchor="middle" fill={AXIS} fontSize={9}>
            {fmtVal(v)}
          </text>
        ))}
        <text x={M.left + innerW / 2} y={M.top + innerH + 30} textAnchor="middle" fill={AXIS} fontSize={9} letterSpacing={2}>
          GEX (OPEN INTEREST)
        </text>

        {/* Center axis */}
        <line x1={xMid} x2={xMid} y1={M.top} y2={M.top + innerH} stroke={AXIS} strokeWidth={0.5} opacity={0.6} />

        {/* SEGMENTED BARS — stack per expiration on each side */}
        {strikes.map((s) => {
          const y = yScale(s.strike) - 4.5;
          // Sort segments by expIdx for consistent stacking
          const segs = [...s.segments].sort((a, b) => a.expIdx - b.expIdx);
          let leftCursor = xMid; // grows left for puts
          let rightCursor = xMid; // grows right for calls
          return (
            <g key={`bar-${s.strike}`}
               onMouseMove={(e) => {
                 const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                 setHover({ strike: s.strike, x: e.clientX - rect.left, y: e.clientY - rect.top });
               }}
               onMouseLeave={() => setHover(null)}
            >
              {segs.map((seg, i) => {
                if (seg.gex === 0) return null;
                const w = (Math.abs(seg.gex) / maxAbsTotal) * (innerW / 2) * 0.95;
                if (seg.gex < 0) {
                  const x = leftCursor - w;
                  leftCursor = x;
                  return (
                    <rect key={i} x={x} y={y} width={w} height={9} rx={1}
                      fill={expInfos[seg.expIdx].color} opacity={0.92} />
                  );
                } else {
                  const x = rightCursor;
                  rightCursor = x + w;
                  return (
                    <rect key={i} x={x} y={y} width={w} height={9} rx={1}
                      fill={expInfos[seg.expIdx].color} opacity={0.92} />
                  );
                }
              })}
            </g>
          );
        })}

        {/* Serpentine multi-expiration profile lines */}
        {expPaths.map((p, i) => p.d && (
          <path key={`exp-${i}`} d={p.d} fill="none" stroke={p.color} strokeWidth={1.2}
                strokeDasharray="3 3" opacity={0.85} filter="url(#ngex-glow)" />
        ))}

        {/* CALL WALL */}
        {callWall && (
          <>
            <line x1={M.left} x2={M.left + innerW} y1={yScale(callWall.strike)} y2={yScale(callWall.strike)}
              stroke={YELLOW} strokeDasharray="3 4" strokeWidth={0.8} opacity={0.65} />
            <text x={M.left + innerW - 4} y={yScale(callWall.strike) - 3} textAnchor="end" fill={YELLOW} fontSize={9} fontWeight={700}>
              CALL WALL: ${callWall.strike.toFixed(2)}
            </text>
          </>
        )}
        {/* PUT WALL */}
        {putWall && (
          <>
            <line x1={M.left} x2={M.left + innerW} y1={yScale(putWall.strike)} y2={yScale(putWall.strike)}
              stroke="#ff66aa" strokeDasharray="3 4" strokeWidth={0.8} opacity={0.65} />
            <text x={M.left + 4} y={yScale(putWall.strike) - 3} fill="#ff66aa" fontSize={9} fontWeight={700}>
              PUT WALL: ${putWall.strike.toFixed(2)}
            </text>
          </>
        )}
        {/* TOTAL VOL TRIGGER */}
        <line x1={M.left} x2={M.left + innerW} y1={yScale(volTrigger)} y2={yScale(volTrigger)}
          stroke={YELLOW} strokeDasharray="6 3" strokeWidth={1.2} opacity={0.85} />
        <text x={M.left + innerW - 4} y={yScale(volTrigger) + 12} textAnchor="end" fill={YELLOW} fontSize={9} fontWeight={700}>
          TOTAL VOL TRIGGER: ~${volTrigger.toFixed(2)}
        </text>

        {/* SPOT PRICE */}
        <line x1={M.left} x2={M.left + innerW} y1={yScale(spot)} y2={yScale(spot)}
          stroke={CYAN} strokeDasharray="4 3" strokeWidth={1} opacity={0.9} />
        <text x={M.left + 4} y={yScale(spot) - 3} fill={CYAN} fontSize={9} fontWeight={700}>
          SPOT PRICE: ${spot.toFixed(2)}
        </text>

        {/* Tooltip */}
        {hover && (() => {
          const s = strikes.find((x) => x.strike === hover.strike);
          if (!s) return null;
          const tx = Math.min(w - 220, hover.x + 10);
          const ty = Math.min(h - 80, hover.y + 10);
          return (
            <g>
              <rect x={tx} y={ty} width={210} height={62} fill="rgba(0,0,0,0.92)" stroke={CYAN} strokeWidth={0.5} rx={3} />
              <text x={tx + 6} y={ty + 14} fill={YELLOW} fontSize={10} fontWeight={700}>STRIKE ${s.strike.toFixed(2)}</text>
              <text x={tx + 6} y={ty + 27} fill={s.totalNet >= 0 ? "#00ff88" : "#ff4466"} fontSize={9}>
                NET GEX: {s.totalNet >= 0 ? "+" : ""}{fmtVal(s.totalNet)}
              </text>
              <text x={tx + 6} y={ty + 40} fill="#cbd5e1" fontSize={9}>Calls OI: {fmtVal(s.callOI)}  Puts OI: {fmtVal(s.putOI)}</text>
              <text x={tx + 6} y={ty + 53} fill={AXIS} fontSize={9}>P/C: {(s.callOI > 0 ? s.putOI / s.callOI : 0).toFixed(2)}</text>
            </g>
          );
        })()}

        {/* Watermark */}
        <text x={w - 10} y={h - 6} textAnchor="end" fill="#334155" fontSize={9} letterSpacing={2}>gex bot</text>
      </svg>

      {/* LEGEND BOX (bottom) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 px-2 py-1 font-mono"
        style={{
          bottom: 6,
          background: "rgba(8,12,20,0.92)",
          border: "1px solid #1f2937",
          borderRadius: 4,
          fontSize: 9,
          lineHeight: 1.5,
          color: "#cbd5e1",
          maxWidth: "92%",
        }}
      >
        {expInfos.map((e) => {
          const pcr = e.callOI > 0 ? e.putOI / e.callOI : 0;
          const pctCall = e.callOI + e.putOI > 0 ? (e.callOI / (e.callOI + e.putOI)) * 100 : 0;
          const pctPut = 100 - pctCall;
          return (
            <div key={e.expiration} className="flex items-center gap-2 whitespace-nowrap">
              <span style={{ display: "inline-block", width: 10, height: 8, background: e.color, borderRadius: 1 }} />
              <span className="text-slate-300" style={{ width: 96 }}>{e.label}</span>
              <span style={{ width: 56 }}>{e.dte} DTE</span>
              <span>GEX (OPEN INTEREST):</span>
              <span className="tabular-nums" style={{ color: e.totalGex >= 0 ? "#00ff88" : "#ff4466", width: 76, textAlign: "right" }}>
                {fmtVal(e.totalGex)}
              </span>
              <span style={{ color: AXIS }}>
                [{pctCall.toFixed(0)}%+|{pctPut.toFixed(0)}%-]
              </span>
              <span>P/C:</span>
              <span className="tabular-nums" style={{ color: YELLOW }}>{pcr.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

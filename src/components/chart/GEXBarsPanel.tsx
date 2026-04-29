import { useEffect, useMemo, useRef, useState } from "react";

function fmtGex(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${a.toFixed(0)}`;
}
function fmtOI(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

export interface StrikeRow {
  strike: number;
  callGEX: number;
  putGEX: number;
  callOI: number;
  putOI: number;
}

interface Props {
  rows: StrikeRow[];
  spot: number;
}

const ROW_H = 18;
const HALF = 180;
const STRIKE_W = 64;

export function GEXBarsPanel({ rows, spot }: Props) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.strike - a.strike), [rows]);
  const maxGEX = useMemo(
    () => Math.max(1, ...sorted.map((r) => Math.max(Math.abs(r.callGEX), Math.abs(r.putGEX)))),
    [sorted]
  );
  const maxOI = useMemo(() => Math.max(1, ...sorted.map((r) => r.callOI + r.putOI)), [sorted]);

  // Key strikes
  const callWall = useMemo(() => {
    let best: StrikeRow | null = null;
    for (const r of sorted) if (r.callGEX > 0 && (!best || r.callGEX > best.callGEX)) best = r;
    return best;
  }, [sorted]);
  const putWall = useMemo(() => {
    let best: StrikeRow | null = null;
    for (const r of sorted) if (r.putGEX > 0 && (!best || r.putGEX > best.putGEX)) best = r;
    return best;
  }, [sorted]);
  // Delta flip (gamma flip): cumulative net GEX crosses zero
  const deltaFlip = useMemo(() => {
    const asc = [...sorted].sort((a, b) => a.strike - b.strike);
    let cum = 0;
    for (let i = 0; i < asc.length; i++) {
      const before = cum;
      cum += asc[i].callGEX - asc[i].putGEX;
      if ((before <= 0 && cum > 0) || (before >= 0 && cum < 0)) return asc[i];
    }
    return null;
  }, [sorted]);

  // Spot interpolated row index
  const spotRowIndex = useMemo(() => {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].strike >= spot && sorted[i + 1].strike <= spot) {
        const span = sorted[i].strike - sorted[i + 1].strike || 1;
        const t = (sorted[i].strike - spot) / span;
        return i + t;
      }
    }
    return -1;
  }, [sorted, spot]);

  function rowIndexOf(strike: number): number {
    return sorted.findIndex((r) => r.strike === strike);
  }

  const callWallIdx = callWall ? rowIndexOf(callWall.strike) : -1;
  const putWallIdx = putWall ? rowIndexOf(putWall.strike) : -1;
  const flipIdx = deltaFlip ? rowIndexOf(deltaFlip.strike) : -1;

  const totalH = sorted.length * ROW_H;

  function HLine({
    idx, color, label, dashed = false,
  }: { idx: number; color: string; label: string; dashed?: boolean }) {
    if (idx < 0) return null;
    const top = idx * ROW_H + ROW_H / 2;
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: STRIKE_W,
          right: 0,
          top,
          height: 0,
          borderTop: `1.5px ${dashed ? "dashed" : "solid"} ${color}`,
          boxShadow: `0 0 6px ${color}`,
          zIndex: 6,
        }}
      >
        <span
          className="absolute -top-2 right-1 px-1 rounded text-[8px] font-bold tracking-wider"
          style={{ background: "#000", color, border: `1px solid ${color}` }}
        >
          {label}
        </span>
      </div>
    );
  }

  // Auto-scroll to spot so the gamma around price is visible immediately
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || spotRowIndex < 0) return;
    const target = spotRowIndex * ROW_H + ROW_H / 2 - el.clientHeight / 2;
    el.scrollTop = Math.max(0, target);
  }, [spotRowIndex, totalH]);

  const [hover, setHover] = useState<{ row: StrikeRow; x: number; y: number } | null>(null);

  return (
    <div className="relative h-full w-full font-mono text-[10px]" style={{ background: "#000" }}>
      <div
        ref={scrollerRef}
        className="overflow-y-auto h-full pr-1 relative"
        onMouseLeave={() => setHover(null)}
      >
        <div className="relative" style={{ minHeight: totalH }}>
          {/* Horizontal key-level lines */}
          <HLine idx={callWallIdx} color="#facc15" label={`CALL WALL ${callWall?.strike ?? ""}`} />
          <HLine idx={putWallIdx} color="#ef4444" label={`PUT WALL ${putWall?.strike ?? ""}`} />
          <HLine idx={flipIdx} color="#a855f7" label={`Δ FLIP ${deltaFlip?.strike ?? ""}`} dashed />
          {spotRowIndex >= 0 && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: STRIKE_W,
                right: 0,
                top: spotRowIndex * ROW_H + ROW_H / 2,
                height: 0,
                borderTop: "1.5px solid #06b6d4",
                boxShadow: "0 0 8px #06b6d4",
                zIndex: 7,
              }}
            >
              <span
                className="absolute -top-2 right-1 px-1 rounded text-[8px] font-bold tracking-wider text-black"
                style={{ background: "#06b6d4" }}
              >
                PRICE ${spot.toFixed(2)}
              </span>
            </div>
          )}

          {sorted.map((r, idx) => {
            // Sqrt scale so small strikes are still visible alongside big ones
            const scale = (v: number) => {
              const norm = Math.abs(v) / maxGEX;
              if (norm <= 0) return 0;
              const w = Math.sqrt(norm) * HALF;
              return Math.max(2, w);
            };
            const callW = r.callGEX !== 0 ? scale(r.callGEX) : 0;
            const putW = r.putGEX !== 0 ? scale(r.putGEX) : 0;
            const callSegs = Math.max(1, Math.floor(callW / 50));
            const putSegs = Math.max(1, Math.floor(putW / 50));
            const isAtm = Math.abs(r.strike - spot) < (sorted[0].strike - sorted[1]?.strike || 1) * 0.6;

            const isHover = hover?.row.strike === r.strike;
            return (
              <div
                key={r.strike}
                className="flex items-center group/row cursor-crosshair"
                style={{
                  height: ROW_H,
                  background: isHover ? "rgba(6,182,212,0.10)" : "transparent",
                  borderTop: isHover ? "1px solid rgba(6,182,212,0.4)" : "1px solid transparent",
                  borderBottom: isHover ? "1px solid rgba(6,182,212,0.4)" : "1px solid transparent",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => {
                  const host = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  setHover({ row: r, x: e.clientX - host.left, y: e.clientY - host.top });
                }}
                onMouseMove={(e) => {
                  const host = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  setHover({ row: r, x: e.clientX - host.left, y: e.clientY - host.top });
                }}
              >
                <div
                  className="text-right pr-1.5 tabular-nums shrink-0 transition-all duration-150 group-hover/row:text-cyan-400 group-hover/row:font-bold"
                  style={{
                    width: STRIKE_W,
                    color: isAtm ? "#06b6d4" : "#9ca3af",
                    fontWeight: isAtm ? 700 : 400,
                  }}
                >
                  ${r.strike.toFixed(r.strike >= 100 ? 0 : 1)}
                </div>

                {/* Puts side (negative — red gradient + glow) */}
                <div className="relative shrink-0" style={{ width: HALF, height: 10, marginTop: 2, marginBottom: 2 }}>
                  {putW > 0 && (
                    <div
                      className="absolute right-0 top-0 origin-right transition-all duration-150 ease-out group-hover/row:scale-y-[1.6] group-hover/row:brightness-150"
                      style={{
                        width: putW,
                        height: 10,
                        borderRadius: 2,
                        background: "linear-gradient(270deg, #ff4466 0%, #ff6688 100%)",
                        boxShadow: isHover
                          ? "0 0 14px #ff4466cc, 0 0 6px #ff4466"
                          : "0 0 8px #ff446644, 0 0 4px #ff446666",
                      }}
                    />
                  )}
                </div>

                {/* Calls side (positive — green gradient + glow) */}
                <div className="relative shrink-0" style={{ width: HALF, height: 10, marginTop: 2, marginBottom: 2 }}>
                  {callW > 0 && (
                    <div
                      className="absolute left-0 top-0 origin-left transition-all duration-150 ease-out group-hover/row:scale-y-[1.6] group-hover/row:brightness-150"
                      style={{
                        width: callW,
                        height: 10,
                        borderRadius: 2,
                        background: "linear-gradient(90deg, #00ff88 0%, #00ffaa 100%)",
                        boxShadow: isHover
                          ? "0 0 14px #00ff88cc, 0 0 6px #00ff88"
                          : "0 0 8px #00ff8844, 0 0 4px #00ff8866",
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {hover && (() => {
          const net = hover.row.callGEX - hover.row.putGEX;
          const dex = hover.row.callOI - hover.row.putOI; // proxy net dex (calls - puts OI)
          const FONT = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
          const C = { cyan: "#00e5ff", red: "#ff3d00", muted: "#666", text: "#e5e7eb", border: "#1f1f1f" };
          return (
            <div
              className="absolute pointer-events-none z-30 animate-fade-in"
              style={{
                left: Math.min(hover.x + 14, 220),
                top: hover.y + 14,
                background: "#000",
                border: `1px solid ${C.border}`,
                color: C.text,
                fontFamily: FONT,
                padding: "10px 12px",
                borderRadius: 4,
                minWidth: 200,
                boxShadow: "0 0 24px rgba(0,229,255,0.15)",
              }}
            >
              <div style={{ color: C.cyan, fontSize: 11, letterSpacing: "0.15em" }}>
                STRIKE ${hover.row.strike}
              </div>
              <div style={{ height: 1, background: C.border, margin: "6px 0" }} />
              <TooltipRow label="Call GEX" value={fmtGex(hover.row.callGEX)} color={C.cyan} muted={C.muted} />
              <TooltipRow label="Put GEX" value={fmtGex(hover.row.putGEX)} color={C.red} muted={C.muted} />
              <TooltipRow label="Net GEX" value={`${net >= 0 ? "+" : ""}${fmtGex(net)}`} color={net >= 0 ? C.cyan : C.red} bold muted={C.muted} />
              <div style={{ height: 1, background: C.border, margin: "6px 0" }} />
              <TooltipRow label="Calls OI" value={fmtOI(hover.row.callOI)} color={C.cyan} muted={C.muted} />
              <TooltipRow label="Puts OI" value={fmtOI(hover.row.putOI)} color={C.red} muted={C.muted} />
              <TooltipRow label="Net DEX" value={`${dex >= 0 ? "+" : ""}${fmtOI(Math.abs(dex))}`} color={dex >= 0 ? C.cyan : C.red} bold muted={C.muted} />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TooltipRow({ label, value, color, bold, muted }: { label: string; value: string; color: string; bold?: boolean; muted: string }) {
  return (
    <div className="flex justify-between text-[11px] py-0.5" style={{ gap: 12 }}>
      <span style={{ color: muted, letterSpacing: "0.05em" }} className="uppercase tracking-wider">{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

import { useMemo } from "react";

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

  return (
    <div className="relative h-full w-full font-mono text-[10px]" style={{ background: "#000" }}>
      <div className="overflow-y-auto h-full pr-1 relative">
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

            return (
              <div key={r.strike} className="flex items-center group/row" style={{ height: ROW_H }}>
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

                {/* Puts side */}
                <div className="relative shrink-0" style={{ width: HALF, height: 14 }}>
                  {putW > 0 && (
                    <div
                      className="absolute right-0 top-0 h-full rounded-sm overflow-hidden origin-right transition-all duration-150 ease-out group-hover/row:scale-y-[1.4] group-hover/row:brightness-125"
                      style={{
                        width: putW,
                        background: "linear-gradient(270deg, #ef4444, #dc2626)",
                        opacity: 0.9,
                        boxShadow: "0 0 6px rgba(239,68,68,0.35)",
                      }}
                    >
                      {Array.from({ length: putSegs }).map((_, i) => (
                        <div key={i} className="absolute top-0 h-full" style={{ right: `${((i + 1) / (putSegs + 1)) * putW}px`, width: 10, background: "#000", opacity: 0.55, borderLeft: "1px solid rgba(255,255,255,0.18)" }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Calls side */}
                <div className="relative shrink-0" style={{ width: HALF, height: 14 }}>
                  {callW > 0 && (
                    <div
                      className="absolute left-0 top-0 h-full rounded-sm overflow-hidden origin-left transition-all duration-150 ease-out group-hover/row:scale-y-[1.4] group-hover/row:brightness-125"
                      style={{
                        width: callW,
                        background: "linear-gradient(90deg, #10b981, #059669)",
                        opacity: 0.9,
                        boxShadow: "0 0 6px rgba(16,185,129,0.35)",
                      }}
                    >
                      {Array.from({ length: callSegs }).map((_, i) => (
                        <div key={i} className="absolute top-0 h-full" style={{ left: `${((i + 1) / (callSegs + 1)) * callW}px`, width: 10, background: "#000", opacity: 0.55, borderLeft: "1px solid rgba(255,255,255,0.18)" }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

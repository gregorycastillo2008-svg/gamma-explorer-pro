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

/**
 * Horizontal GEX bars: green for calls (above spot), red for puts (below).
 * Includes inner black breakpoint segments, blue OI percentile dots,
 * vertical yellow spot line, and left strike axis.
 */
export function GEXBarsPanel({ rows, spot }: Props) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.strike - a.strike), [rows]);
  const maxGEX = useMemo(
    () => Math.max(1, ...sorted.map((r) => Math.max(Math.abs(r.callGEX), Math.abs(r.putGEX)))),
    [sorted]
  );
  const maxOI = useMemo(() => Math.max(1, ...sorted.map((r) => r.callOI + r.putOI)), [sorted]);

  // Bars panel internal layout: half-width left for puts, half-width right for calls.
  const HALF = 180; // px each side

  return (
    <div className="relative h-full w-full font-mono text-[10px]" style={{ background: "#000" }}>
      {/* Vertical yellow spot line at center */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: `calc(64px + ${HALF}px)`,
          width: 2,
          background: "#fbbf24",
          opacity: 0.9,
          boxShadow: "0 0 8px rgba(251,191,36,0.9)",
          zIndex: 5,
        }}
      >
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold text-black"
          style={{ background: "#fbbf24", boxShadow: "0 0 6px rgba(251,191,36,0.7)" }}
        >
          ${spot.toFixed(2)}
        </div>
      </div>

      <div className="overflow-y-auto h-full pr-1">
        {sorted.map((r, idx) => {
          const isAbove = r.strike >= spot;
          const gexValue = isAbove ? Math.abs(r.callGEX) : Math.abs(r.putGEX);
          const barW = (gexValue / maxGEX) * HALF;
          const totalOI = r.callOI + r.putOI;
          const oiPct = (totalOI / maxOI) * 100;
          const dots = dotsCount(oiPct);
          const segs = Math.max(1, Math.floor(barW / 50));
          const isAtm = Math.abs(r.strike - spot) < (sorted[0].strike - sorted[1]?.strike || 1) * 0.6;

          return (
            <div key={r.strike} className="flex items-center" style={{ height: 18 }}>
              {/* Strike label */}
              <div
                className="text-right pr-1.5 tabular-nums shrink-0"
                style={{
                  width: 64,
                  color: isAtm ? "#06b6d4" : "#9ca3af",
                  fontWeight: isAtm ? 700 : 400,
                }}
              >
                ${r.strike.toFixed(r.strike >= 100 ? 0 : 1)}
              </div>

              {/* Puts side (left half) */}
              <div className="relative shrink-0" style={{ width: HALF, height: 14 }}>
                {!isAbove && (
                  <div
                    className="absolute right-0 top-0 h-full rounded-sm overflow-hidden"
                    style={{
                      width: barW,
                      background: "linear-gradient(270deg, #ef4444, #dc2626)",
                      opacity: 0.9,
                      boxShadow: "0 0 6px rgba(239,68,68,0.35)",
                    }}
                  >
                    {/* Black breakpoint segments */}
                    {Array.from({ length: segs }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full"
                        style={{
                          right: `${((i + 1) / (segs + 1)) * barW}px`,
                          width: 10,
                          background: "#000",
                          opacity: 0.55,
                          borderLeft: "1px solid rgba(255,255,255,0.18)",
                        }}
                      />
                    ))}
                    {/* OI dots */}
                    {Array.from({ length: dots }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          right: `${((i + 1) / (dots + 1)) * barW - 3}px`,
                          width: 6,
                          height: 6,
                          background: "#3b82f6",
                          border: "1px solid #1e40af",
                          boxShadow: "0 0 5px rgba(59,130,246,0.8)",
                          zIndex: 3,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Calls side (right half) */}
              <div className="relative shrink-0" style={{ width: HALF, height: 14 }}>
                {isAbove && (
                  <div
                    className="absolute left-0 top-0 h-full rounded-sm overflow-hidden"
                    style={{
                      width: barW,
                      background: "linear-gradient(90deg, #10b981, #059669)",
                      opacity: 0.9,
                      boxShadow: "0 0 6px rgba(16,185,129,0.35)",
                    }}
                  >
                    {Array.from({ length: segs }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full"
                        style={{
                          left: `${((i + 1) / (segs + 1)) * barW}px`,
                          width: 10,
                          background: "#000",
                          opacity: 0.55,
                          borderLeft: "1px solid rgba(255,255,255,0.18)",
                        }}
                      />
                    ))}
                    {Array.from({ length: dots }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          left: `${((i + 1) / (dots + 1)) * barW - 3}px`,
                          width: 6,
                          height: 6,
                          background: "#3b82f6",
                          border: "1px solid #1e40af",
                          boxShadow: "0 0 5px rgba(59,130,246,0.8)",
                          zIndex: 3,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dotsCount(oiPct: number): number {
  if (oiPct >= 70) return 8;
  if (oiPct >= 50) return 6;
  if (oiPct >= 30) return 4;
  if (oiPct >= 10) return 2;
  return 1;
}

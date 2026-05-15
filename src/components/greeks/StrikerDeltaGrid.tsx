import { useMemo, useState, useRef, useEffect } from "react";

interface RawContract {
  strike: number;
  expiration: string;
  side: "call" | "put";
  delta: number;
  oi: number;
  iv: number;
}
interface ChainResponse {
  symbol: string;
  spot: number;
  expirations: string[];
  contracts: RawContract[];
}

function daysBetween(iso: string): number {
  const exp = new Date(iso + "T21:00:00Z").getTime();
  return Math.max(0, Math.round((exp - Date.now()) / 86_400_000));
}
function dayOfWeek(iso: string): string {
  const d = new Date(iso + "T21:00:00Z");
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getUTCDay()];
}
function formatExpHeader(iso: string): string {
  const d = new Date(iso + "T21:00:00Z");
  const month = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getUTCMonth()];
  return `${month} ${d.getUTCDate().toString().padStart(2, "0")}`;
}

function formatM(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}K`;
  return n.toFixed(0);
}

interface Props {
  chain: ChainResponse;
  symbol: string;
}

const CONTRACT_SIZE = 100;

export function StrikerDeltaGrid({ chain, symbol }: Props) {
  const [hover, setHover] = useState<{ strike: number; exp: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to top on mount so the largest strikes (sorted high→low) are visible first
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  // Build matrix: dexValue[strike][expiration]
  const { strikes, expirations, matrix, maxAbs, totalAbs } = useMemo(() => {
    const expSet = new Set<string>();
    const strikeSet = new Set<number>();
    const m = new Map<string, number>();

    for (const c of chain.contracts) {
      const dex = c.delta * c.oi * CONTRACT_SIZE * chain.spot * (c.side === "call" ? 1 : -1);
      const key = `${c.strike}|${c.expiration}`;
      m.set(key, (m.get(key) ?? 0) + dex);
      expSet.add(c.expiration);
      strikeSet.add(c.strike);
    }

    const expirations = Array.from(expSet).sort();
    const strikes = Array.from(strikeSet).sort((a, b) => b - a); // high to low

    let maxAbs = 0;
    let totalAbs = 0;
    for (const v of m.values()) {
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
      totalAbs += a;
    }

    const matrix: Record<string, Record<string, number>> = {};
    for (const s of strikes) {
      matrix[s] = {};
      for (const e of expirations) {
        matrix[s][e] = m.get(`${s}|${e}`) ?? 0;
      }
    }
    return { strikes, expirations, matrix, maxAbs: maxAbs || 1, totalAbs: totalAbs || 1 };
  }, [chain]);

  // Spot row position
  const spotIdx = useMemo(() => {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < strikes.length - 1; i++) {
      const between = (strikes[i] >= chain.spot && strikes[i + 1] <= chain.spot);
      if (between) {
        bestIdx = i;
        break;
      }
      const d = Math.abs(strikes[i] - chain.spot);
      if (d < bestDiff) { bestDiff = d; bestIdx = i; }
    }
    return bestIdx;
  }, [strikes, chain.spot]);

  function cellColor(v: number): { bg: string; fg: string } {
    if (v === 0) return { bg: "transparent", fg: "#3a3a3a" };
    const intensity = Math.min(1, Math.abs(v) / maxAbs);
    // green for positive (calls dominant), red for negative (puts dominant)
    if (v > 0) {
      // teal/cyan-green like the image highlights
      const alpha = 0.15 + intensity * 0.65;
      return { bg: `rgba(45, 212, 191, ${alpha})`, fg: intensity > 0.4 ? "#0a0a0a" : "#5eead4" };
    } else {
      const alpha = 0.15 + intensity * 0.65;
      return { bg: `rgba(239, 68, 68, ${alpha})`, fg: intensity > 0.4 ? "#0a0a0a" : "#fca5a5" };
    }
  }

  return (
    <div className="border-t border-[#1f1f1f]" style={{ background: "#000" }}>
      <div className="px-3 py-2 flex items-center justify-between border-b border-[#1f1f1f]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.25em] text-emerald-400">STRIKER · DELTA EXPOSURE PER STRIKE</span>
          <span className="text-[9px] text-muted-foreground">·</span>
          <span className="text-[9px] font-mono text-muted-foreground">{symbol} ${chain.spot.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(45,212,191,0.8)" }} />Calls Δ+</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(239,68,68,0.8)" }} />Puts Δ−</span>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: "70vh" }}>
        <table className="w-full border-collapse" style={{ fontFamily: "ui-monospace, monospace" }}>
          <thead className="sticky top-0 z-10" style={{ background: "#000" }}>
            <tr>
              <th className="px-2 py-1.5 text-left text-[9px] font-bold tracking-widest text-muted-foreground border-b border-[#1f1f1f]" style={{ minWidth: 60 }}>STRIKE</th>
              {expirations.map((e) => {
                const dte = daysBetween(e);
                return (
                  <th key={e} className="px-1.5 py-1 text-center border-b border-[#1f1f1f]" style={{ minWidth: 64 }}>
                    <div className="text-[9px] font-bold text-emerald-400 tracking-wider">{dte}D</div>
                    <div className="text-[8px] text-muted-foreground">({dayOfWeek(e)}){formatExpHeader(e)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {strikes.map((s, idx) => {
              const isSpotRow = idx === spotIdx;
              return (
                <>
                  {isSpotRow && (
                    <tr key={`spot-${s}`}>
                      <td colSpan={expirations.length + 1} className="p-0">
                        <div className="relative h-px" style={{ background: "#06b6d4", boxShadow: "0 0 8px #06b6d4" }}>
                          <span className="absolute left-1 -top-2 px-1 text-[8px] font-bold text-cyan-300 bg-black">SPOT ${chain.spot.toFixed(2)}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr key={s}>
                    <td className="px-2 py-1 text-[10px] font-bold text-white tabular-nums sticky left-0 z-[5]" style={{ background: "#000", borderRight: "1px solid #1f1f1f" }}>
                      ${s}
                    </td>
                    {expirations.map((e) => {
                      const v = matrix[s][e];
                      const { bg, fg } = cellColor(v);
                      const isHover = hover && hover.strike === s && hover.exp === e;
                      return (
                        <td
                          key={e}
                          onMouseEnter={() => setHover({ strike: s, exp: e })}
                          onMouseLeave={() => setHover((h) => (h && h.strike === s && h.exp === e ? null : h))}
                          className="relative text-center text-[10px] font-bold tabular-nums cursor-default transition-all"
                          style={{
                            background: bg,
                            color: fg,
                            borderRight: "1px solid rgba(255,255,255,0.04)",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            outline: isHover ? "1px solid #10b981" : "none",
                            padding: "6px 4px",
                          }}
                        >
                          {formatM(v)}
                          {isHover && (
                            <div
                              className="absolute z-30 left-1/2 -translate-x-1/2 -top-2 -translate-y-full px-3 py-2 rounded-md font-mono text-[10px] pointer-events-none whitespace-nowrap text-left"
                              style={{
                                background: "rgba(0,0,0,0.95)",
                                border: "1px solid #10b981",
                                boxShadow: "0 6px 20px rgba(16,185,129,0.3)",
                                color: "#fff",
                              }}
                            >
                              <div className="font-bold mb-1 tracking-wider text-emerald-400">${s} · {daysBetween(e)}D</div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                                <span className="text-muted-foreground">Symbol</span><span className="text-right">{symbol}</span>
                                <span className="text-muted-foreground">Expiration</span><span className="text-right">{e}</span>
                                <span className="text-muted-foreground">DEX</span><span className={`text-right ${v >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatM(v)}</span>
                                <span className="text-muted-foreground">% del total</span><span className="text-amber-300 text-right">{((Math.abs(v) / totalAbs) * 100).toFixed(2)}%</span>
                                <span className="text-muted-foreground">Intensidad</span><span className="text-right">{((Math.abs(v) / maxAbs) * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

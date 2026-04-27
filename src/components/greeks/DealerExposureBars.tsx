import { useMemo, useState } from "react";

export interface DealerStrikeRow {
  strike: number;
  callOI: number;
  putOI: number;
  callGamma: number; // per-contract gamma (calls)
  putGamma: number;  // per-contract gamma (puts)
  callDelta: number;
  putDelta: number;
}

interface Props {
  rows: DealerStrikeRow[];
  spot: number;
  symbol: string;
  /** "GEX" = Gamma$ exposure, "DEX" = Delta$ exposure */
  mode?: "GEX" | "DEX";
  /** When true, the mode toggle is hidden and the chart fills its container */
  lockMode?: boolean;
  /** Optional title override */
  title?: string;
  /** When true, bars stretch to fill the entire card (no scroll, taller bars) */
  fullBleed?: boolean;
}

/**
 * Dealer Exposure per Strike - horizontal divergent bars (calls right, puts left).
 * Conventions used (standard dealer-positioning approximation):
 *   GEX$  = (callGamma * callOI - putGamma * putOI) * 100 * spot^2 * 0.01
 *   DEX$  = (callDelta * callOI + putDelta * putOI) * 100 * spot
 * Positive => dealers long gamma/delta at that strike (suppressive).
 * Negative => dealers short gamma/delta (amplifies moves).
 */
export function DealerExposureBars({ rows, spot, symbol, mode: modeProp, lockMode, title, fullBleed }: Props) {
  const [mode, setMode] = useState<"GEX" | "DEX">(modeProp ?? "GEX");
  const [hover, setHover] = useState<number | null>(null);
  const effectiveMode = lockMode ? (modeProp ?? "GEX") : mode;

  const data = useMemo(() => {
    return rows
      .map((r) => {
        const gex =
          (r.callGamma * r.callOI - r.putGamma * r.putOI) *
          100 *
          spot *
          spot *
          0.01;
        const dex = (r.callDelta * r.callOI + r.putDelta * r.putOI) * 100 * spot;
        return {
          strike: r.strike,
          value: effectiveMode === "GEX" ? gex : dex,
          gex, dex,
          callOI: r.callOI, putOI: r.putOI,
        };
      })
      .filter((d) => Number.isFinite(d.value))
      .sort((a, b) => b.strike - a.strike);
  }, [rows, effectiveMode, spot]);

  const totalAbs = data.reduce((s, d) => s + Math.abs(d.value), 0) || 1;

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <div
      className="font-mono"
      style={{ background: "#000", border: "1px solid #1f1f1f", borderRadius: 6 }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1f1f1f]" style={{ background: "#0a0a0a" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.2em] text-white">{title ?? "DEALER EXPOSURE / STRIKE"}</span>
          <span className="text-[9px] text-muted-foreground">·</span>
          <span className="text-[10px] font-bold text-foreground">{symbol}</span>
        </div>
        {!lockMode && (
          <div className="flex gap-1">
            {(["GEX", "DEX"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="h-5 px-2 text-[9px] font-bold rounded-sm border"
                style={{
                  background: mode === m ? "#10b981" : "#000",
                  color: mode === m ? "#000" : "#10b981",
                  borderColor: "#10b981",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Axis label */}
      <div className="grid grid-cols-[60px_1fr] px-2 py-1 text-[8px] text-muted-foreground border-b border-[#141414]">
        <div>STRIKE</div>
        <div className="grid grid-cols-3">
          <span className="text-left">PUTS −</span>
          <span className="text-center">0</span>
          <span className="text-right">+ CALLS</span>
        </div>
      </div>

      <div
        className={fullBleed ? "flex flex-col" : "overflow-y-auto"}
        style={fullBleed ? { height: 520 } : { maxHeight: 320 }}
      >
        {data.map((d) => {
          const pct = (Math.abs(d.value) / maxAbs) * 50;
          const isPos = d.value >= 0;
          const isAtm = Math.abs(d.strike - spot) < (data[0]?.strike - data[1]?.strike || 1) * 0.6;
          const isHover = hover === d.strike;
          const sharePct = ((Math.abs(d.value) / totalAbs) * 100).toFixed(2);
          return (
            <div
              key={d.strike}
              onMouseEnter={() => setHover(d.strike)}
              onMouseLeave={() => setHover((h) => (h === d.strike ? null : h))}
              className={`group grid grid-cols-[60px_1fr] items-center px-2 ${fullBleed ? "flex-1 py-1" : "py-[2px]"} hover:bg-white/5 cursor-default`}
              style={{ borderBottom: "1px solid #0a0a0a" }}
            >
              <div
                className="text-[10px] font-bold tabular-nums"
                style={{ color: isAtm ? "#06b6d4" : "#e5e7eb" }}
              >
                ${d.strike.toFixed(d.strike >= 100 ? 0 : 1)}
              </div>
              <div className={`relative ${fullBleed ? "h-full min-h-[18px]" : "h-3"} flex items-center`}>
                {/* center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#2a2a2a]" />
                {/* spot line */}
                {isAtm && <div className="absolute left-0 right-0 h-px bg-amber-500/40 top-1/2" />}
                {/* bar */}
                <div
                  className={`absolute ${fullBleed ? "h-[70%]" : "h-2.5"} rounded-sm transition-all`}
                  style={{
                    left: isPos ? "50%" : `${50 - pct}%`,
                    width: `${pct}%`,
                    background: isPos
                      ? "linear-gradient(90deg, #10b98155, #10b981)"
                      : "linear-gradient(90deg, #ef4444, #ef444455)",
                    boxShadow: isHover
                      ? `0 0 14px ${isPos ? "#10b981" : "#ef4444"}`
                      : `0 0 6px ${isPos ? "#10b98166" : "#ef444466"}`,
                    outline: isHover ? `1px solid ${isPos ? "#10b981" : "#ef4444"}` : "none",
                  }}
                />
                {/* hover tooltip */}
                {isHover && (
                  <div
                    className="absolute z-30 left-1/2 -translate-x-1/2 -top-2 -translate-y-full px-3 py-2 rounded-md font-mono text-[10px] pointer-events-none whitespace-nowrap text-left"
                    style={{
                      background: "rgba(0,0,0,0.95)",
                      border: `1px solid ${isPos ? "#10b981" : "#ef4444"}`,
                      boxShadow: `0 6px 20px ${isPos ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                      color: "#fff",
                    }}
                  >
                    <div className="font-bold mb-1 tracking-wider" style={{ color: isPos ? "#10b981" : "#ef4444" }}>
                      ${d.strike} · {symbol}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                      <span className="text-muted-foreground">{effectiveMode}</span>
                      <span className={`text-right ${isPos ? "text-emerald-400" : "text-red-400"}`}>{fmtCompact(d.value)}</span>
                      <span className="text-muted-foreground">GEX</span>
                      <span className={`text-right ${d.gex >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtCompact(d.gex)}</span>
                      <span className="text-muted-foreground">DEX</span>
                      <span className={`text-right ${d.dex >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtCompact(d.dex)}</span>
                      <span className="text-muted-foreground">Call OI</span>
                      <span className="text-emerald-300 text-right">{d.callOI.toLocaleString()}</span>
                      <span className="text-muted-foreground">Put OI</span>
                      <span className="text-red-300 text-right">{d.putOI.toLocaleString()}</span>
                      <span className="text-muted-foreground">% del total</span>
                      <span className="text-amber-300 text-right">{sharePct}%</span>
                    </div>
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

function fmtCompact(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

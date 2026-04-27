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
        return { strike: r.strike, value: mode === "GEX" ? gex : dex, callSide: 0, putSide: 0 };
      })
      .filter((d) => Number.isFinite(d.value))
      .sort((a, b) => b.strike - a.strike);
  }, [rows, mode, spot]);

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <div
      className="font-mono"
      style={{ background: "#000", border: "1px solid #1f1f1f", borderRadius: 6 }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1f1f1f]" style={{ background: "#0a0a0a" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.2em] text-white">DEALER EXPOSURE / STRIKE</span>
          <span className="text-[9px] text-muted-foreground">·</span>
          <span className="text-[10px] font-bold text-foreground">{symbol}</span>
        </div>
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

      <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
        {data.map((d) => {
          const pct = (Math.abs(d.value) / maxAbs) * 50; // half width
          const isPos = d.value >= 0;
          const isAtm = Math.abs(d.strike - spot) < (data[0]?.strike - data[1]?.strike || 1) * 0.6;
          return (
            <div
              key={d.strike}
              className="group grid grid-cols-[60px_1fr] items-center px-2 py-[2px] hover:bg-white/5"
              style={{ borderBottom: "1px solid #0a0a0a" }}
              title={`$${d.strike.toFixed(d.strike >= 100 ? 0 : 1)} · ${mode} ${fmtCompact(d.value)}`}
            >
              <div
                className="text-[10px] font-bold tabular-nums opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: isAtm ? "#06b6d4" : "#e5e7eb" }}
              >
                ${d.strike.toFixed(d.strike >= 100 ? 0 : 1)}
              </div>
              <div className="relative h-3 flex items-center">
                {/* center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#2a2a2a]" />
                {/* spot line */}
                {isAtm && <div className="absolute left-0 right-0 h-px bg-amber-500/40 top-1/2" />}
                {/* bar */}
                <div
                  className="absolute h-2.5 rounded-sm"
                  style={{
                    left: isPos ? "50%" : `${50 - pct}%`,
                    width: `${pct}%`,
                    background: isPos
                      ? "linear-gradient(90deg, #10b98155, #10b981)"
                      : "linear-gradient(90deg, #ef4444, #ef444455)",
                    boxShadow: `0 0 6px ${isPos ? "#10b98166" : "#ef444466"}`,
                  }}
                />
                {/* value tag — hidden by default, visible on hover */}
                <span
                  className="absolute text-[8px] font-bold tabular-nums opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    [isPos ? "left" : "right"]: `calc(${50 + pct}% + 4px)`,
                    color: isPos ? "#10b981" : "#ef4444",
                  } as any}
                >
                  {fmtCompact(d.value)}
                </span>
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

import { useMemo, useState, useEffect } from "react";
import { GreekCell } from "./GreekCell";
import { calculateAllGreeks, type Greeks } from "@/lib/greeks/greekCalculations";
import type { GreekType } from "./GreekTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight } from "lucide-react";

interface Props {
  symbol: string;
  spot: number;
  strikeStep: number;
  iv: number; // ATM IV approx (0..1)
}

const DTE_OPTIONS = [1, 7, 14, 30, 60, 90];

const GREEKS: { key: GreekType; label: string; sub: string }[] = [
  { key: "delta", label: "DELTA", sub: "Δ" },
  { key: "gamma", label: "GAMMA", sub: "Γ" },
  { key: "vega", label: "VEGA", sub: "ν" },
  { key: "theta", label: "THETA", sub: "Θ" },
  { key: "vanna", label: "VANNA", sub: "∂Δ/∂σ" },
  { key: "charm", label: "CHARM", sub: "∂Δ/∂t" },
];

export function GreekLadder({ symbol, spot, strikeStep, iv }: Props) {
  const [side, setSide] = useState<"call" | "put">("call");
  const [dte, setDte] = useState(7);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Build strike ladder around spot (±10 steps)
  const rows = useMemo(() => {
    const offsets = [-10, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 10];
    const data = offsets.map((off) => {
      const strike = Math.round((spot + off * strikeStep) / strikeStep) * strikeStep;
      // skew IV slightly with moneyness
      const m = (strike - spot) / spot;
      const localIv = Math.max(0.05, iv + Math.abs(m) * 0.6 - (m > 0 ? 0.03 : 0));
      const greeks = calculateAllGreeks({
        spot, strike, dte, iv: localIv, rate: 0.045, isCall: side === "call",
      });
      return { strike, off, greeks, iv: localIv };
    });
    return data.sort((a, b) => b.strike - a.strike);
  }, [spot, strikeStep, side, dte, iv]);

  // Per-greek arrays for intensity classification
  const allValues = useMemo(() => {
    const map: Record<GreekType, number[]> = { delta: [], gamma: [], vega: [], theta: [], vanna: [], charm: [] };
    rows.forEach((r) => GREEKS.forEach((g) => map[g.key].push(r.greeks[g.key])));
    return map;
  }, [rows]);

  // Insights
  const insights = useMemo(() => {
    const maxByAbs = (k: keyof Greeks) =>
      rows.reduce((best, r) => Math.abs(r.greeks[k]) > Math.abs(best.greeks[k]) ? r : best, rows[0]);
    const gMax = maxByAbs("gamma");
    const vMax = maxByAbs("vega");
    const tMax = maxByAbs("theta");
    const longCandidate = rows
      .filter((r) => (side === "call" ? r.greeks.delta >= 0.6 && r.greeks.delta <= 0.85 : r.greeks.delta <= -0.6 && r.greeks.delta >= -0.85))
      .sort((a, b) => Math.abs(b.greeks.delta) - Math.abs(a.greeks.delta))[0] ?? rows[0];
    return { gMax, vMax, tMax, longCandidate };
  }, [rows, side]);

  return (
    <div style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 10 }} className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f] bg-[#0f0f0f]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground tracking-wide">GREEK LADDER</h3>
            <span className="flex items-center gap-1 text-[10px] text-red-500 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {symbol} • Spot: <span className="text-yellow-400">${spot.toFixed(2)}</span> • {now.toLocaleTimeString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSide(side === "call" ? "put" : "call")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-[#2a2a2a] bg-black hover:bg-[#1a1a1a] transition-colors"
            style={{ color: side === "call" ? "#10b981" : "#ef4444" }}
          >
            <ArrowLeftRight className="w-3 h-3" />
            {side === "call" ? "Calls" : "Puts"}
          </button>
          <Select value={String(dte)} onValueChange={(v) => setDte(+v)}>
            <SelectTrigger className="h-8 w-[100px] bg-black border-[#2a2a2a] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-[#2a2a2a]">
              {DTE_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)} className="text-xs">{d} DTE</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full font-mono">
          <thead style={{ background: "#0f0f0f" }}>
            <tr>
              <th className="text-left px-3 py-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase border-b border-[#2a2a2a]">Strike</th>
              {GREEKS.map((g) => (
                <th key={g.key} className="text-center px-2 py-2 text-[10px] font-bold tracking-wider uppercase border-b border-[#2a2a2a]" style={{ color: "#9ca3af" }}>
                  <div>{g.label}</div>
                  <div className="text-[9px] text-muted-foreground font-normal normal-case">({g.sub})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isAtm = r.off === 0;
              const distColor =
                r.off > 5 ? "#22c55e" :
                r.off > 0 ? "#84cc16" :
                r.off === 0 ? "#06b6d4" :
                r.off >= -5 ? "#fbbf24" : "#f97316";
              const distLabel = isAtm ? "ATM" : r.off > 0 ? `↑${r.off}` : `↓${Math.abs(r.off)}`;
              return (
                <tr
                  key={r.strike}
                  className="hover:brightness-125 transition-all"
                  style={{
                    background: isAtm
                      ? "rgba(6, 182, 212, 0.12)"
                      : idx % 2 === 0 ? "#0a0a0a" : "#0d0d0d",
                    boxShadow: isAtm ? "inset 4px 0 0 #06b6d4, inset -4px 0 0 #06b6d4" : undefined,
                    borderBottom: "1px solid #1a1a1a",
                  }}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex flex-col">
                      <span style={{ color: isAtm ? "#06b6d4" : "#ffffff", fontWeight: "bold", fontSize: 13 }}>
                        ${r.strike.toFixed(strikeStep < 1 ? 1 : 0)} {isAtm && <span className="ml-1">←</span>}
                      </span>
                      <span style={{ color: distColor, fontSize: 9, fontWeight: 600 }}>
                        {distLabel} {isAtm && <span className="text-cyan-400">CURRENT</span>}
                      </span>
                    </div>
                  </td>
                  {GREEKS.map((g) => (
                    <GreekCell key={g.key} value={r.greeks[g.key]} type={g.key} allValues={allValues[g.key]} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Insights */}
      <div className="px-4 py-3 border-t border-[#1f1f1f] bg-[#0f0f0f]">
        <div className="text-[10px] font-bold tracking-wider text-cyan-400 uppercase mb-2">📊 Insights</div>
        <ul className="space-y-1 text-[11px] font-mono text-muted-foreground">
          <li>• <span className="text-foreground">Gamma máx:</span> ${insights.gMax.strike} ({insights.gMax.greeks.gamma.toFixed(4)}) — alta sensibilidad al precio</li>
          <li>• <span className="text-foreground">Vega máx:</span> ${insights.vMax.strike} ({insights.vMax.greeks.vega.toFixed(2)}) — máxima exposición a volatilidad</li>
          <li>• <span className="text-foreground">Theta máx:</span> ${insights.tMax.strike} ({insights.tMax.greeks.theta.toFixed(2)}/día) — máximo decay para vendedores</li>
          <li>• <span className="text-foreground">Ideal long {side}:</span> ${insights.longCandidate.strike} (Δ {insights.longCandidate.greeks.delta.toFixed(2)}) — alto delta, gamma controlado</li>
        </ul>
      </div>
    </div>
  );
}

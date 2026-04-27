import { VolatilityDataset } from "@/lib/mockVolatilityData";

interface Props { data: VolatilityDataset }

function flagColor(f: string) {
  if (f === "PUT")  return { bg: "rgba(239,68,68,0.12)", fg: "#ef4444" };
  if (f === "CALL") return { bg: "rgba(16,185,129,0.12)", fg: "#10b981" };
  return { bg: "rgba(251,191,36,0.10)", fg: "#fbbf24" };
}

export function VolatilityTable({ data }: Props) {
  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] uppercase tracking-[0.2em] text-[#9ca3af] font-jetbrains">VOLATILITY TABLE</span>
        <span className="text-[10px] font-jetbrains text-[#6b7280]">MILD · PUT · SK</span>
      </div>

      <div className="flex-1 overflow-auto border border-[#1f1f1f] rounded">
        <table className="w-full font-jetbrains text-[11px]" style={{ borderCollapse: "collapse" }}>
          <thead className="sticky top-0 z-10 bg-[#0a0a0a]">
            <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
              <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider text-[#6b7280]">Strike</th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-[#6b7280]">IV %</th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-[#6b7280]">OI Sk</th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-[#6b7280]">Flag</th>
            </tr>
          </thead>
          <tbody>
            {data.table.map((r) => {
              const isSpot = Math.abs(r.strike - data.spot) < 1;
              const c = flagColor(r.flag);
              return (
                <tr key={r.strike} style={{
                  borderBottom: "1px solid #131313",
                  background: isSpot ? "rgba(251,191,36,0.06)" : "transparent",
                }}>
                  <td className="px-3 py-1.5 tabular-nums" style={{ color: isSpot ? "#fbbf24" : "#e5e7eb", fontWeight: isSpot ? 700 : 400 }}>
                    ${r.strike.toFixed(0)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: r.iv > 20 ? "#10b981" : r.iv < 15 ? "#60a5fa" : "#e5e7eb" }}>
                    {r.iv.toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: r.oiSk >= 0 ? "#10b981" : "#ef4444" }}>
                    {r.oiSk >= 0 ? "+" : ""}{r.oiSk.toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: c.bg, color: c.fg }}>
                      {r.flag}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

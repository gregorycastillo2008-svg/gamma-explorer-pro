import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { VolatilityDataset } from "@/lib/mockVolatilityData";

interface Props { data: VolatilityDataset }

const tooltipStyle: React.CSSProperties = {
  background: "rgba(10,10,10,0.96)", border: "1px solid #1f1f1f",
  borderRadius: 6, fontSize: 11, fontFamily: "JetBrains Mono, monospace",
};

export function IVSkewChart({ data }: Props) {
  const series = data.skew.map((p) => ({ strike: p.strike, iv: +(p.iv * 100).toFixed(2) }));
  const atm = series.reduce((b, p) => Math.abs(p.strike - data.spot) < Math.abs(b.strike - data.spot) ? p : b, series[0]);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] uppercase tracking-[0.2em] text-[#9ca3af] font-jetbrains">IV Skew</span>
        <span className="text-[11px] font-bold font-jetbrains uppercase tracking-wider" style={{ color: "#fbbf24" }}>
          MILD PUT SKEW
        </span>
      </div>

      <div className="flex-1 grid grid-cols-[1fr_140px] gap-2 min-h-0">
        <div className="min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
              <XAxis
                dataKey="strike"
                tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickFormatter={(v) => `$${v}`}
                domain={["dataMin", "dataMax"]}
                type="number"
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickFormatter={(v) => `${v}%`}
                domain={["dataMin - 1", "dataMax + 1"]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(v) => `Strike $${v}`}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "IV"]}
              />
              <ReferenceLine x={atm.strike} stroke="#6b7280" strokeDasharray="4 4"
                label={{ value: "ATM", fill: "#9ca3af", fontSize: 10, position: "top" }} />
              <Line type="monotone" dataKey="iv" stroke="#10b981" strokeWidth={2} dot={false}
                style={{ filter: "drop-shadow(0 0 3px #10b981)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Side table */}
        <div className="overflow-y-auto border-l border-[#1f1f1f] pl-2">
          <div className="grid grid-cols-[1fr_1fr] gap-x-2 text-[10px] font-jetbrains text-[#6b7280] sticky top-0 bg-[#0a0a0a] py-1">
            <span className="text-right">IV %</span>
            <span className="text-right">Spot</span>
          </div>
          {data.table.slice(0, 14).map((r) => {
            const color = r.iv > 20 ? "#10b981" : r.iv < 15 ? "#60a5fa" : "#e5e7eb";
            return (
              <div key={r.strike} className="grid grid-cols-[1fr_1fr] gap-x-2 text-[10px] font-jetbrains tabular-nums py-0.5">
                <span className="text-right" style={{ color }}>{r.iv.toFixed(2)}</span>
                <span className="text-right text-[#6b7280]">${r.strike.toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

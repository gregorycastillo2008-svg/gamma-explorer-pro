import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { VolatilityDataset } from "@/lib/mockVolatilityData";

interface Props { data: VolatilityDataset }

const tooltipStyle: React.CSSProperties = {
  background: "rgba(10,10,10,0.96)", border: "1px solid #1f1f1f",
  borderRadius: 6, fontSize: 11, fontFamily: "JetBrains Mono, monospace",
};

export function RealizedVolatilityChart({ data }: Props) {
  const series = data.hvSeries.map((r) => ({ ...r, ts: r.date.getTime() }));
  const meanHv30 = series.reduce((s, r) => s + r.hv30, 0) / Math.max(1, series.length);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-[12px] uppercase tracking-[0.2em] text-[#9ca3af] font-jetbrains">
          REALIZED VOLATILITY — HV10 / HV20 / HV30
        </span>
        <div className="flex items-center gap-3 text-[10px] font-jetbrains">
          <Legend dot="#3b82f6" label="HV10" />
          <Legend dot="#e5e7eb" label="HV20" />
          <Legend dot="#fbbf24" label="HV30" />
          <Legend dot="#fb923c" label="ATM IV" />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 10, right: 16, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
              tickFormatter={(v: number) => format(new Date(v), "MMM dd")}
              minTickGap={32}
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
              tickFormatter={(v) => `${v}%`}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v: number) => format(new Date(v), "MMM dd, yyyy")}
              formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n.toUpperCase()]}
            />
            <ReferenceLine y={meanHv30} stroke="#6b7280" strokeDasharray="4 4"
              label={{ value: `mean ${meanHv30.toFixed(1)}%`, fill: "#9ca3af", fontSize: 9, position: "right" }} />
            <Line type="monotone" dataKey="hv10" stroke="#3b82f6" strokeWidth={1.6} dot={false} name="HV10" />
            <Line type="monotone" dataKey="hv20" stroke="#e5e7eb" strokeWidth={1.8} dot={false} name="HV20" />
            <Line type="monotone" dataKey="hv30" stroke="#fbbf24" strokeWidth={2}   dot={false} name="HV30" />
            <Line type="monotone" dataKey="iv"   stroke="#fb923c" strokeWidth={2} strokeDasharray="5 4" dot={false} name="ATM IV" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#9ca3af]">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

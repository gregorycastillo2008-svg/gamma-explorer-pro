import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, Cell, Tooltip } from "recharts";
import type { GexSnapshot } from "@/lib/gexSimData";

interface Props {
  snapshot: GexSnapshot;
  currentPrice: number;
}

export function GEXOverlay({ snapshot, currentPrice }: Props) {
  const data = useMemo(() => {
    const range = currentPrice * 0.04;
    return snapshot.gexByStrike
      .filter((s) => Math.abs(s.strike - currentPrice) <= range)
      .map((s) => ({
        strike: s.strike,
        callBn: Math.abs(s.callGEX) / 1e9,
        putBn: -Math.abs(s.putGEX) / 1e9,
        netBn: s.netGEX / 1e9,
        oiPct: s.oiPct,
        above: s.strike >= currentPrice,
      }))
      .sort((a, b) => a.strike - b.strike);
  }, [snapshot, currentPrice]);

  if (!data.length) return <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">No GEX data in range</div>;

  return (
    <div className="w-full" style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap={1}>
          <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false}
            tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}B`} />
          <YAxis type="category" dataKey="strike" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false}
            width={50} tickFormatter={(v) => `$${v}`} />
          <ReferenceLine x={0} stroke="#404040" />
          <ReferenceLine y={data.reduce((closest, d) => Math.abs(d.strike - currentPrice) < Math.abs(closest - currentPrice) ? d.strike : closest, data[0].strike)} stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: "#0a0a0a", border: "1px solid #06b6d4", borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: "#06b6d4" }}
            formatter={(value: number, name: string) => [`${Math.abs(value).toFixed(2)}B`, name === "putBn" ? "Put GEX" : name === "callBn" ? "Call GEX" : "Net"]}
            labelFormatter={(label) => `Strike $${label}`}
          />
          <Bar dataKey="putBn" stackId="gex" radius={[0, 0, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.above ? "#ef444466" : "#ef4444"} />)}
          </Bar>
          <Bar dataKey="callBn" stackId="gex" radius={[0, 0, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.above ? "#10b981" : "#10b98166"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

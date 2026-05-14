import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, CartesianGrid } from "recharts";

import type { OptionContract } from "@/lib/gex";

interface Props {
  contracts: OptionContract[];
  spot: number;
  strikeStep: number;
}

/**
 * P/C Skew by Strike — Put/Call ratio per strike from REAL options data.
 * Uses volume when available, falls back to OI. Ratio > 1 = put-heavy strike.
 */
export function PCSkewByStrike({ contracts, spot, strikeStep }: Props) {
  const data = useMemo(() => {
    const map = new Map<number, { call: number; put: number }>();
    for (const c of contracts) {
      // Prefer volume (real flow); fall back to OI when missing
      const w = (c as any).volume && (c as any).volume > 0 ? (c as any).volume : c.oi;
      if (!w) continue;
      const cur = map.get(c.strike) ?? { call: 0, put: 0 };
      if (c.type === "call") cur.call += w;
      else cur.put += w;
      map.set(c.strike, cur);
    }
    // Window ±15 strike steps around spot for readability
    const lo = spot - strikeStep * 20;
    const hi = spot + strikeStep * 20;
    return Array.from(map.entries())
      .filter(([k]) => k >= lo && k <= hi)
      .sort(([a], [b]) => a - b)
      .map(([strike, v]) => {
        const ratio = v.call > 0 ? v.put / v.call : v.put > 0 ? 6 : 0;
        return {
          strike,
          ratio: Math.min(ratio, 6),
          callVol: v.call,
          putVol: v.put,
        };
      });
  }, [contracts, spot, strikeStep]);

  const putHeavy = data.filter((d) => d.ratio > 1).length;
  const callHeavy = data.filter((d) => d.ratio > 0 && d.ratio < 1).length;

  const MONO = "JetBrains Mono, ui-monospace, monospace";
  const TICK = { fill: "#6b7280", fontSize: 9, fontFamily: MONO };

  return (
    <div style={{
      background: "#111111",
      border: "1px solid #111111",
      borderRadius: 6,
      overflow: "hidden",
      height: "100%",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        background: "#161616",
        borderBottom: "1px solid #111111",
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#e0e0e0", textTransform: "uppercase" }}>
            P/C Skew by Strike
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: "#6b7280" }}>
            Put/Call ratio per strike · &gt;1 = put-heavy
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 12px 4px", flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.1em" }}>● Call-heavy: {callHeavy}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.1em" }}>● Put-heavy: {putHeavy}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: "#6b7280", marginLeft: "auto" }}>spot ${spot.toFixed(0)}</span>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 18, left: 8 }}>
            <CartesianGrid stroke="#111111" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="strike"
              tick={TICK}
              axisLine={{ stroke: "#111111" }}
              tickLine={false}
              tickFormatter={(v) => String(v)}
            />
            <YAxis
              domain={[0, 6]}
              tick={TICK}
              axisLine={false}
              tickLine={false}
              label={{ value: "Put/Call", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 9, fontFamily: MONO }}
            />
            <Tooltip
              contentStyle={{ background: "#1e1e1e", border: "1px solid #111111", borderRadius: 4, fontFamily: MONO, fontSize: 11 }}
              labelStyle={{ color: "#a0a0a0" }}
              itemStyle={{ color: "#e0e0e0" }}
              formatter={(value: any, _name, p: any) => [
                `${Number(value).toFixed(2)}  (P:${p.payload.putVol.toLocaleString()} / C:${p.payload.callVol.toLocaleString()})`,
                "P/C",
              ]}
              labelFormatter={(l) => `Strike $${l}`}
            />
            <ReferenceLine y={1} stroke="#4b5563" strokeDasharray="3 3" />
            <ReferenceLine x={Math.round(spot / strikeStep) * strikeStep} stroke="#a78bfa" strokeDasharray="2 2" />
            <Bar dataKey="ratio" radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.strike} fill={d.ratio > 1 ? "#ef4444" : "#22c55e"} fillOpacity={0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

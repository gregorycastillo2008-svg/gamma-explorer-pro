import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, CartesianGrid } from "recharts";
import { Panel } from "./Panel";
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

  return (
    <Panel
      title="P/C Skew by Strike"
      subtitle="Put/Call ratio per strike · >1 = put-heavy"
      className="h-full flex flex-col"
    >
      <div className="flex items-center gap-3 px-2 pb-2 text-[10px] font-mono uppercase tracking-wider">
        <span className="text-call">● Call-heavy: {callHeavy}</span>
        <span className="text-put">● Put-heavy: {putHeavy}</span>
        <span className="text-muted-foreground ml-auto">spot ${spot.toFixed(0)}</span>
      </div>
      <div className="flex-1 min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 18, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="strike"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
              tickFormatter={(v) => String(v)}
            />
            <YAxis
              domain={[0, 6]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
              label={{ value: "Put/Call Ratio", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
              formatter={(value: any, _name, p: any) => [
                `${Number(value).toFixed(2)}  (P:${p.payload.putVol.toLocaleString()} / C:${p.payload.callVol.toLocaleString()})`,
                "P/C",
              ]}
              labelFormatter={(l) => `Strike $${l}`}
            />
            <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <ReferenceLine x={Math.round(spot / strikeStep) * strikeStep} stroke="hsl(var(--primary))" strokeDasharray="2 2" />
            <Bar dataKey="ratio" radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.strike} fill={d.ratio > 1 ? "hsl(var(--put))" : "hsl(var(--call))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

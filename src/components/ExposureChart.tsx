import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import type { ExposurePoint } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";

interface Props {
  data: ExposurePoint[];
  spot: number;
  callWall?: number;
  putWall?: number;
  flip?: number | null;
  metric: "netGex" | "dex" | "vex" | "vanna" | "charm";
}

const labels: Record<Props["metric"], string> = {
  netGex: "Net Gamma Exposure",
  dex: "Delta Exposure",
  vex: "Vega Exposure",
  vanna: "Vanna Exposure",
  charm: "Charm Exposure",
};

export function ExposureChart({ data, spot, callWall, putWall, flip, metric }: Props) {
  const chartData = data.map((d) => ({
    strike: d.strike,
    value: d[metric],
    isPositive: d[metric] >= 0,
  }));

  return (
    <div className="w-full h-[420px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{labels[metric]} por strike</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-call" />Positivo</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-put" />Negativo</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="strike" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatNumber(Number(v), 1)} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => formatNumber(v)}
            labelFormatter={(l) => `Strike ${l}`}
          />
          <ReferenceLine x={spot} stroke="hsl(var(--primary))" strokeWidth={2} label={{ value: `Spot ${spot}`, fill: "hsl(var(--primary))", fontSize: 11, position: "top" }} />
          {metric === "netGex" && (
            <>
              <ReferenceLine x={callWall} stroke="hsl(var(--call))" strokeDasharray="4 4" label={{ value: "Call Wall", fill: "hsl(var(--call))", fontSize: 10, position: "insideTopRight" }} />
              <ReferenceLine x={putWall} stroke="hsl(var(--put))" strokeDasharray="4 4" label={{ value: "Put Wall", fill: "hsl(var(--put))", fontSize: 10, position: "insideTopLeft" }} />
              {flip != null && (
                <ReferenceLine x={flip} stroke="hsl(var(--flip))" strokeDasharray="2 2" label={{ value: "Flip", fill: "hsl(var(--flip))", fontSize: 10, position: "insideBottom" }} />
              )}
            </>
          )}
          <Bar dataKey="value" radius={[3, 3, 0, 0]} shape={(props: any) => {
            const fill = props.payload.isPositive ? "hsl(var(--call))" : "hsl(var(--put))";
            return <rect {...props} fill={fill} />;
          }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

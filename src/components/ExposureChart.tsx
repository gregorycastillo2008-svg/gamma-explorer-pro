import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, CartesianGrid, LabelList } from "recharts";
import type { ExposurePoint } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";
import { HoverBar } from "@/components/terminal/HoverBar";

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

const symbol: Record<Props["metric"], string> = {
  netGex: "Γ",
  dex: "Δ",
  vex: "ν",
  vanna: "∂Δ/∂σ",
  charm: "∂Δ/∂t",
};

export function ExposureChart({ data, spot, callWall, putWall, flip, metric }: Props) {
  // Focus on strikes near spot (±8%) so bars are wide and readable
  const lo = spot * 0.92;
  const hi = spot * 1.08;
  const chartData = data
    .filter((d) => d.strike >= lo && d.strike <= hi)
    .sort((a, b) => a.strike - b.strike)
    .map((d) => ({
      strike: d.strike,
      value: d[metric],
      isPositive: d[metric] >= 0,
    }));

  // Find absolute extremes for marker overlay
  const maxPos = chartData.reduce((m, p) => (p.value > (m?.value ?? -Infinity) ? p : m), null as null | (typeof chartData)[number]);
  const maxNeg = chartData.reduce((m, p) => (p.value < (m?.value ?? Infinity) ? p : m), null as null | (typeof chartData)[number]);
  const sym = symbol[metric];

  return (
    <div className="w-full h-full min-h-[300px] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{labels[metric]} por strike</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-call" />Positivo</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-put" />Negativo</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Spot ${spot}</span>
          <span className="flex items-center gap-1.5"><span className="text-call">★</span>Max +{sym}</span>
          <span className="flex items-center gap-1.5"><span className="text-put">★</span>Max −{sym}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 28, right: 20, left: 10, bottom: 0 }} barCategoryGap="12%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="strike" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={25} tickMargin={2} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatNumber(Number(v), 1)} width={55} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => formatNumber(v)}
            labelFormatter={(l) => `Strike ${l}`}
          />
          {/* zero line */}
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
          {/* SPOT — vertical line through current price */}
          <ReferenceLine
            x={spot}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeDasharray="4 3"
            label={{ value: `▼ SPOT ${spot}`, fill: "hsl(var(--primary))", fontSize: 11, position: "top" }}
          />
          {metric === "netGex" && (
            <>
              <ReferenceLine x={callWall} stroke="hsl(var(--call))" strokeDasharray="4 4" label={{ value: "Call Wall", fill: "hsl(var(--call))", fontSize: 10, position: "insideTopRight" }} />
              <ReferenceLine x={putWall} stroke="hsl(var(--put))" strokeDasharray="4 4" label={{ value: "Put Wall", fill: "hsl(var(--put))", fontSize: 10, position: "insideTopLeft" }} />
              {flip != null && (
                <ReferenceLine x={flip} stroke="hsl(var(--flip))" strokeDasharray="2 2" label={{ value: "Flip", fill: "hsl(var(--flip))", fontSize: 10, position: "insideBottom" }} />
              )}
            </>
          )}
          {/* Highlight extremes */}
          {maxPos && maxPos.value > 0 && (
            <ReferenceDot
              x={maxPos.strike}
              y={maxPos.value}
              r={6}
              fill="hsl(var(--call))"
              stroke="#fff"
              strokeWidth={1.5}
              label={{ value: `★ MAX +${sym}`, position: "top", fill: "hsl(var(--call))", fontSize: 10, fontWeight: 600 }}
            />
          )}
          {maxNeg && maxNeg.value < 0 && (
            <ReferenceDot
              x={maxNeg.strike}
              y={maxNeg.value}
              r={6}
              fill="hsl(var(--put))"
              stroke="#fff"
              strokeWidth={1.5}
              label={{ value: `★ MAX −${sym}`, position: "bottom", fill: "hsl(var(--put))", fontSize: 10, fontWeight: 600 }}
            />
          )}
          <Bar dataKey="value" radius={[3, 3, 0, 0]} shape={(props: any) => {
            const fill = props.payload.isPositive ? "hsl(var(--call))" : "hsl(var(--put))";
            return <rect {...props} fill={fill} />;
          }} />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

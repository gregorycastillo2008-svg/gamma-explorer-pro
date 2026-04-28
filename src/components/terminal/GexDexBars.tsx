import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceDot, Cell } from "recharts";
import { ExposurePoint, formatNumber } from "@/lib/gex";
import { HoverBar } from "./HoverBar";

interface Props {
  data: ExposurePoint[];
  spot: number;
  callWall: number;
  putWall: number;
  flip: number | null;
  metric: "netGex" | "dex";
}

export function GexDexBars({ data, spot, callWall, putWall, flip, metric }: Props) {
  // Split positive / negative into two series so colors are stable
  const chartData = data
    .slice()
    .sort((a, b) => a.strike - b.strike)
    .map((p) => {
      const v = p[metric];
      return {
        strike: p.strike,
        positive: v >= 0 ? v : 0,
        negative: v < 0 ? v : 0,
        callOI: p.callOI,
        putOI: p.putOI,
        raw: v,
      };
    });

  // Pico positivo y negativo para marcadores ★
  const maxPos = chartData.reduce((m, p) => (p.raw > (m?.raw ?? -Infinity) ? p : m), null as null | (typeof chartData)[number]);
  const maxNeg = chartData.reduce((m, p) => (p.raw < (m?.raw ?? Infinity) ? p : m), null as null | (typeof chartData)[number]);
  const sym = metric === "netGex" ? "Γ" : "Δ";

  const TooltipBody = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const v = d.raw as number;
    return (
      <div className="rounded border border-border bg-popover/95 backdrop-blur px-3 py-2 text-xs font-mono shadow-lg">
        <div className="font-semibold text-foreground mb-1">Strike ${label}</div>
        <div className={v >= 0 ? "text-call" : "text-put"}>
          {metric === "netGex" ? "Net GEX" : "Net DEX"}: ${formatNumber(v)}
        </div>
        <div className="text-muted-foreground mt-1">Call OI: <span className="text-call">{formatNumber(d.callOI, 0)}</span></div>
        <div className="text-muted-foreground">Put OI: <span className="text-put">{formatNumber(d.putOI, 0)}</span></div>
      </div>
    );
  };

  return (
    <div className="w-full h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} stackOffset="sign">
          <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.35} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => formatNumber(Number(v), 1)}
          />
          <YAxis
            type="category"
            dataKey="strike"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "monospace" }}
            width={56}
            interval={0}
          />
          <ReferenceLine x={0} stroke="hsl(var(--border))" />
          {/* SPOT horizontal — current price level across the chart */}
          <ReferenceLine
            y={spot}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeDasharray="4 3"
            label={{ value: `▶ SPOT ${spot}`, fill: "hsl(var(--primary))", fontSize: 10, position: "right", fontWeight: 600 }}
          />
          {metric === "netGex" && (
            <>
              <ReferenceLine y={callWall} stroke="hsl(var(--call))" strokeDasharray="2 4" label={{ value: "Call Wall", fill: "hsl(var(--call))", fontSize: 9, position: "right" }} />
              <ReferenceLine y={putWall} stroke="hsl(var(--put))" strokeDasharray="2 4" label={{ value: "Put Wall", fill: "hsl(var(--put))", fontSize: 9, position: "right" }} />
              {flip != null && <ReferenceLine y={flip} stroke="hsl(var(--warning))" strokeDasharray="1 3" label={{ value: "Flip", fill: "hsl(var(--warning))", fontSize: 9, position: "right" }} />}
            </>
          )}
          {/* Marcadores ★ en gamma máxima positiva y negativa */}
          {maxPos && maxPos.raw > 0 && (
            <ReferenceDot
              x={maxPos.raw}
              y={maxPos.strike}
              r={6}
              fill="hsl(var(--call))"
              stroke="#fff"
              strokeWidth={1.5}
              label={{ value: `★ MAX +${sym}`, position: "right", fill: "hsl(var(--call))", fontSize: 10, fontWeight: 700 }}
            />
          )}
          {maxNeg && maxNeg.raw < 0 && (
            <ReferenceDot
              x={maxNeg.raw}
              y={maxNeg.strike}
              r={6}
              fill="hsl(var(--put))"
              stroke="#fff"
              strokeWidth={1.5}
              label={{ value: `★ MAX −${sym}`, position: "left", fill: "hsl(var(--put))", fontSize: 10, fontWeight: 700 }}
            />
          )}
          <Tooltip content={<TooltipBody />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
          <Bar dataKey="negative" stackId="x" radius={[0, 0, 0, 0]} shape={(p: any) => <HoverBar {...p} fill="hsl(var(--put))" orientation="horizontal" />} />
          <Bar dataKey="positive" stackId="x" radius={[0, 0, 0, 0]} shape={(p: any) => <HoverBar {...p} fill="hsl(var(--call))" orientation="horizontal" />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

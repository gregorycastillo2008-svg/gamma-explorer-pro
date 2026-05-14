import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  CartesianGrid, ResponsiveContainer,
} from "recharts";
import type { ExposurePoint } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";

interface Props {
  exposures: ExposurePoint[];
  spot: number;
}

const CALL_COLOR = "rgba(0, 204, 136, 0.62)";
const PUT_COLOR  = "rgba(255, 68, 102, 0.62)";
const CALL_GLOW  = "rgba(0, 204, 136, 0.95)";
const PUT_GLOW   = "rgba(255, 68, 102, 0.95)";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const callOI: number = payload.find((p: any) => p.dataKey === "callOI")?.value ?? 0;
  const putOI:  number = payload.find((p: any) => p.dataKey === "putOI")?.value ?? 0;
  const total = callOI + putOI;
  const pcr = putOI > 0 && callOI > 0 ? (putOI / callOI).toFixed(2) : "—";
  return (
    <div
      style={{
        background: "rgba(10,10,10,0.97)",
        border: "1px solid #2a2a2a",
        borderRadius: 4,
        padding: "8px 12px",
        fontFamily: "'Courier New', monospace",
        fontSize: 11,
        minWidth: 160,
        boxShadow: "0 0 14px rgba(6,182,212,0.15)",
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
        Strike ${label}
      </div>
      <div style={{ color: CALL_GLOW, fontWeight: 700 }}>▲ Call OI: {formatNumber(callOI, 0)}</div>
      <div style={{ color: PUT_GLOW,  fontWeight: 700 }}>▼ Put  OI: {formatNumber(putOI, 0)}</div>
      <div style={{ color: "#6b7280", marginTop: 4, fontSize: 9 }}>
        Total: {formatNumber(total, 0)} · P/C {pcr}
      </div>
    </div>
  );
}

export function CallPutOIChart({ exposures, spot }: Props) {
  const { chartData, spotStrike } = useMemo(() => {
    const lo = spot * 0.90;
    const hi = spot * 1.10;
    const filtered = exposures
      .filter((d) => d.strike >= lo && d.strike <= hi)
      .sort((a, b) => a.strike - b.strike);

    let nearest = filtered[0]?.strike ?? spot;
    let minDiff = Infinity;
    for (const d of filtered) {
      const diff = Math.abs(d.strike - spot);
      if (diff < minDiff) { minDiff = diff; nearest = d.strike; }
    }

    return {
      chartData: filtered.map((d) => ({
        strike: d.strike,
        callOI: d.callOI,
        putOI:  d.putOI,
      })),
      spotStrike: nearest,
    };
  }, [exposures, spot]);

  const maxOI = useMemo(
    () => Math.max(...chartData.flatMap((d) => [d.callOI, d.putOI]), 1),
    [chartData]
  );

  const totalCall = chartData.reduce((s, d) => s + d.callOI, 0);
  const totalPut  = chartData.reduce((s, d) => s + d.putOI, 0);
  const pcr = totalPut > 0 && totalCall > 0 ? (totalPut / totalCall).toFixed(2) : "—";

  return (
    <div
      style={{
        background: "#1f1f1f",
        border: "1px solid #2a2a2a",
        borderRadius: 4,
        padding: "10px 8px 8px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Courier New', monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          paddingLeft: 4,
          paddingRight: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
          Call vs Put OI · Spot ${spot}
        </span>
        <div style={{ display: "flex", gap: 14, fontSize: 9, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CALL_COLOR, display: "inline-block" }} />
            <span style={{ color: CALL_GLOW, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Call OI</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: PUT_COLOR, display: "inline-block" }} />
            <span style={{ color: PUT_GLOW, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Put OI</span>
          </span>
          <span style={{ color: "#444", fontSize: 9 }}>P/C {pcr}</span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap={18} barGap={3}>
            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#0d0d0d" />
            <XAxis
              dataKey="strike"
              tick={{ fill: "#444", fontSize: 9, fontFamily: "'Courier New', monospace" }}
              axisLine={{ stroke: "#1a1a1a" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={22}
            />
            <YAxis
              tickFormatter={(v) => formatNumber(v, 0)}
              tick={{ fill: "#444", fontSize: 9, fontFamily: "'Courier New', monospace" }}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={[0, maxOI * 1.08]}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.025)" }} />
            <ReferenceLine
              x={spotStrike}
              stroke="#a78bfa"
              strokeWidth={3}
              label={{
                value: `▼ SPOT ${spot}`,
                fill: "#a78bfa",
                fontSize: 9,
                fontFamily: "'Courier New', monospace",
                fontWeight: 700,
                position: "top",
              }}
            />
            <Bar dataKey="callOI" fill={CALL_COLOR} radius={[2, 2, 0, 0]} maxBarSize={11} />
            <Bar dataKey="putOI"  fill={PUT_COLOR}  radius={[2, 2, 0, 0]} maxBarSize={11} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

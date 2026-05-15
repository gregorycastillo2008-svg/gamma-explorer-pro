import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { VolatilityDataset } from "@/lib/mockVolatilityData";

interface Props { data: VolatilityDataset }

const tooltipStyle: React.CSSProperties = {
  background: "rgba(10,10,10,0.96)", border: "1px solid #1f1f1f",
  borderRadius: 6, fontSize: 11, fontFamily: "JetBrains Mono, monospace",
};

const LABEL = "text-[10px] uppercase tracking-[0.18em] text-[#6b7280] font-jetbrains";

export function PutCallSkewPanel({ data }: Props) {
  const m = data.metrics;
  // Marker position 0..100 based on skew angle (-45..+45)
  const markerPos = Math.max(2, Math.min(98, 50 + (m.skewAngle / 45) * 50));

  // Dynamic labels derived from real data
  const rr       = m.riskReversal;
  const absRR    = Math.abs(rr);
  const isPut    = rr > 0;
  const isCall   = rr < -0.3;
  const isFlat   = absRR <= 0.3;
  const strength = absRR > 5 ? "STRONG" : absRR > 1.5 ? "MODERATE" : absRR > 0.3 ? "MILD" : "FLAT";
  const side     = isFlat ? "FLAT" : isPut ? "PUT" : "CALL";
  const skewTitle  = isFlat ? "FLAT SKEW" : `${strength} ${side} SKEW`;
  const titleColor = isPut ? "#ef4444" : isCall ? "#3b82f6" : "#fbbf24";
  const ivRegime   = m.atmIV > 25 ? "HIGH" : m.atmIV > 15 ? "MEDIUM" : "LOW";

  // Bottom bar labels
  const callSideStrength = isCall ? strength : isPut ? "LOW" : "NEUTRAL";
  const putSideStrength  = isPut  ? strength : isCall ? "LOW" : "NEUTRAL";

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] uppercase tracking-[0.2em] text-[#9ca3af] font-jetbrains">PUT/CALL SKEW</span>
        <span className="text-[12px] font-bold font-jetbrains uppercase tracking-wider" style={{ color: titleColor }}>
          {skewTitle} · {Math.abs(m.skewAngle).toFixed(0)}°
        </span>
      </div>

      {/* 2x2 metrics */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2">
          <div className={LABEL}>ATM 1Y</div>
          <div className="text-lg font-bold font-jetbrains tabular-nums" style={{ color: "#ef4444" }}>
            {m.atmIV.toFixed(2)}%
          </div>
        </div>
        <div className="rounded border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2">
          <div className={LABEL}>25Δ RR</div>
          <div className="text-lg font-bold font-jetbrains tabular-nums"
            style={{ color: m.riskReversal >= 0 ? "#10b981" : "#ef4444" }}>
            {m.riskReversal >= 0 ? "+" : ""}{m.riskReversal.toFixed(2)}
          </div>
        </div>
        <div className="rounded border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2">
          <div className={LABEL}>5% OTM Put</div>
          <div className="text-lg font-bold font-jetbrains tabular-nums" style={{ color: "#ef4444" }}>
            +{(m.atmIV * 0.93).toFixed(2)}
          </div>
        </div>
        <div className="rounded border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2">
          <div className={LABEL}>10% OTM Put</div>
          <div className="text-lg font-bold font-jetbrains tabular-nums" style={{ color: "#ef4444" }}>
            +{(m.atmIV * 0.93 * 1.06).toFixed(2)}
          </div>
        </div>
      </div>

      <div className="text-[12px] font-jetbrains text-[#e5e7eb] mb-1">
        P/C IV Ratio:{" "}
        <span className="font-bold tabular-nums" style={{ color: m.pcRatio > 1.1 ? "#ef4444" : m.pcRatio < 0.9 ? "#3b82f6" : "#fbbf24" }}>
          {m.pcRatio.toFixed(3)}
        </span>
        <span className="text-[10px] text-[#6b7280] ml-2">
          {m.pcRatio > 1.1 ? "puts costlier (bearish bias)" : m.pcRatio < 0.9 ? "calls costlier (bullish bias)" : "balanced"}
        </span>
      </div>
      <div className="text-[10px] font-jetbrains text-[#6b7280] mb-2">
        30D SKEW · IV Regime: <span style={{ color: ivRegime === "HIGH" ? "#ef4444" : ivRegime === "MEDIUM" ? "#fbbf24" : "#10b981" }}>({ivRegime})</span>
        &nbsp;· RR: <span style={{ color: titleColor }}>{rr >= 0 ? "+" : ""}{rr.toFixed(2)}</span>
      </div>

      {/* Skew gradient bar */}
      <div className="relative h-3 rounded mb-1" style={{
        background: "linear-gradient(90deg, #3b82f6 0%, #10b981 30%, #fbbf24 60%, #ef4444 100%)",
      }}>
        <div
          className="absolute -top-1 -translate-x-1/2"
          style={{ left: `${markerPos}%`, color: "#ffffff", fontSize: 10, lineHeight: 1 }}
        >▼</div>
      </div>
      <div className="flex justify-between text-[9px] font-jetbrains mb-3">
        <span style={{ color: isCall ? titleColor : "#4b5563" }}>CALL SKEW ({callSideStrength})</span>
        <span style={{ color: isPut  ? titleColor : "#4b5563" }}>PUT SKEW ({putSideStrength})</span>
      </div>

      {/* Combined chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.putIvBars} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
            <XAxis dataKey="dte" tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }} />
            <YAxis yAxisId="left" tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => `${v}%`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v.toFixed(2)}${n === "rr" ? "" : "%"}`, n.toUpperCase()]} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
            <Bar yAxisId="left" dataKey="putIv" fill="#ef4444" fillOpacity={0.8} radius={[4, 4, 0, 0]} name="Put IV 5%" />
            <Line yAxisId="left" type="monotone" dataKey="callIv" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} name="Call IV 5%" />
            <Line yAxisId="right" type="monotone" dataKey="rr" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Risk Reversal" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { VolatilityDataset } from "@/lib/mockVolatilityData";

interface Props { data: VolatilityDataset }

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(8,12,20,0.97)",
  border: "1px solid #1e2d42",
  borderRadius: 6,
  fontSize: 11,
  fontFamily: "JetBrains Mono, monospace",
  color: "#e0e6ed",
};

function skewColor(label: string): string {
  if (label.includes("STRONG PUT"))  return "#f43f5e";
  if (label.includes("MILD PUT"))    return "#f59e0b";
  if (label.includes("CALL"))        return "#60a5fa";
  return "#6b7280";
}

function CustomTooltip({ active, payload, label, spot }: any) {
  if (!active || !payload?.length) return null;
  const moneyness = ((label - spot) / spot * 100).toFixed(1);
  const sign = +moneyness >= 0 ? "+" : "";
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ borderBottom: "1px solid #1e2d42", paddingBottom: 4, marginBottom: 4, color: "#8894a8", fontSize: 10 }}>
        Strike ${label}  <span style={{ color: +moneyness < 0 ? "#f43f5e" : "#00ff88" }}>({sign}{moneyness}%)</span>
      </div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{p.value?.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}

export function IVSkewChart({ data }: Props) {
  const { spot, putSkew, callSkew, skewLabel, metrics } = data;

  // Merge put and call series into one array keyed by strike
  const strikeSet = new Set<number>([
    ...putSkew.map(p => p.strike),
    ...callSkew.map(p => p.strike),
  ]);
  const series = Array.from(strikeSet).sort((a, b) => a - b).map(k => {
    const p = putSkew.find(x => x.strike === k);
    const c = callSkew.find(x => x.strike === k);
    return {
      strike: k,
      putIV:  p ? +(p.iv * 100).toFixed(2) : undefined,
      callIV: c ? +(c.iv * 100).toFixed(2) : undefined,
    };
  });

  const atmStrike = series.reduce((b, p) => Math.abs(p.strike - spot) < Math.abs(b.strike - spot) ? p : b, series[0]);
  const rr = metrics.riskReversal;
  const rrSign = rr >= 0 ? "+" : "";
  const labelColor = skewColor(skewLabel);

  // Table rows — use putSkew (puts show the clearest skew)
  const tableRows = putSkew.filter((_, i) => i % 2 === 0).slice(0, 14);

  return (
    <div className="h-full w-full flex flex-col" style={{ fontFamily: "JetBrains Mono, monospace" }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8894a8" }}>IV Skew</span>
          <span style={{ fontSize: 10, color: "#4a5a74", marginLeft: 8 }}>30D · Real Data</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#4a5a74" }}>RR {rrSign}{rr.toFixed(1)}pp</span>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: labelColor, textTransform: "uppercase",
            padding: "2px 6px", border: `1px solid ${labelColor}40`,
            borderRadius: 4, background: `${labelColor}12`,
          }}>
            {skewLabel}
          </span>
        </div>
      </div>

      {/* ── Legend pills ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 6, fontSize: 10, color: "#6b7a94" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 2, background: "#00e5a0", display: "inline-block", borderRadius: 1 }} />
          Put IV
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 2, background: "#3b82f6", display: "inline-block", borderRadius: 1 }} />
          Call IV
        </span>
      </div>

      {/* ── Chart + Table ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 130px", gap: 8, minHeight: 0 }}>
        <div style={{ minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 4, left: -12, bottom: 4 }}>
              <defs>
                <linearGradient id="putAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00e5a0" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#00e5a0" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" strokeOpacity={0.6} />

              <XAxis
                dataKey="strike"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fill: "#4a5a74", fontSize: 9, fontFamily: "JetBrains Mono" }}
                tickFormatter={(v) => `$${v}`}
                tickCount={6}
              />
              <YAxis
                tick={{ fill: "#4a5a74", fontSize: 9, fontFamily: "JetBrains Mono" }}
                tickFormatter={(v) => `${v}%`}
                domain={["dataMin - 1", "dataMax + 1"]}
              />

              <Tooltip
                content={<CustomTooltip spot={spot} />}
                cursor={{ stroke: "#2a3a54", strokeWidth: 1 }}
              />

              {/* ATM reference */}
              <ReferenceLine
                x={atmStrike.strike}
                stroke="#4a5a74"
                strokeDasharray="4 3"
                label={{ value: "ATM", fill: "#6b7a94", fontSize: 9, position: "insideTopLeft" }}
              />

              {/* Put IV area fill */}
              <Area
                type="monotone"
                dataKey="putIV"
                stroke="none"
                fill="url(#putAreaGrad)"
                connectNulls
                dot={false}
                activeDot={false}
                name="Put IV"
              />
              {/* Put IV line */}
              <Line
                type="monotone"
                dataKey="putIV"
                stroke="#00e5a0"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="Put IV"
                style={{ filter: "drop-shadow(0 0 4px #00e5a080)" }}
              />
              {/* Call IV line */}
              <Line
                type="monotone"
                dataKey="callIV"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="Call IV"
                style={{ filter: "drop-shadow(0 0 4px #3b82f680)" }}
                strokeDasharray="5 3"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ── Side table ─────────────────────────────────────────────── */}
        <div style={{ overflowY: "auto", borderLeft: "1px solid #1a2535", paddingLeft: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 4px", fontSize: 9, color: "#4a5a74", position: "sticky", top: 0, background: "#0a0a0a", paddingBottom: 4 }}>
            <span style={{ textAlign: "right" }}>Put IV</span>
            <span style={{ textAlign: "right" }}>Strike</span>
          </div>
          {tableRows.map((r) => {
            const mono = (r.strike - spot) / spot;
            const isAtm = Math.abs(mono) < 0.01;
            const color = isAtm ? "#ffffff" : r.strike < spot ? "#00e5a0" : "#3b82f6";
            return (
              <div key={r.strike} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 4px",
                fontSize: 10, fontFamily: "JetBrains Mono", fontVariantNumeric: "tabular-nums",
                padding: "2px 0",
                background: isAtm ? "#0d1827" : "transparent",
                borderRadius: isAtm ? 3 : 0,
              }}>
                <span style={{ textAlign: "right", color, fontWeight: isAtm ? 700 : 400 }}>
                  {(r.iv * 100).toFixed(2)}%
                </span>
                <span style={{ textAlign: "right", color: isAtm ? "#e0e6ed" : "#4a5a74" }}>
                  ${r.strike.toFixed(0)}
                </span>
              </div>
            );
          })}

          {/* RR summary */}
          <div style={{ marginTop: 8, borderTop: "1px solid #1a2535", paddingTop: 6, fontSize: 9, color: "#4a5a74" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>25Δ RR</span>
              <span style={{ color: rr > 0 ? "#f59e0b" : "#60a5fa", fontWeight: 700 }}>
                {rrSign}{rr.toFixed(1)}pp
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span>ATM IV</span>
              <span style={{ color: "#e0e6ed", fontWeight: 700 }}>{metrics.atmIV.toFixed(1)}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span>P/C Ratio</span>
              <span style={{ color: metrics.pcRatio > 1.05 ? "#f43f5e" : "#6b7a94", fontWeight: 700 }}>
                {metrics.pcRatio.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

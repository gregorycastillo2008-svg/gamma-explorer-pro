import { useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from "recharts";
import type { DealerStrikeRow } from "./DealerExposureBars";

interface Props {
  rows: DealerStrikeRow[];
  spot: number;
  symbol: string;
  updatedAt: Date;
}

const MONO = "JetBrains Mono, ui-monospace, monospace";

function fmtCompact(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "+";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
  return `${s}${a.toFixed(0)}`;
}

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div style={{
      background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 4,
      padding: "6px 10px", fontFamily: MONO, fontSize: 10, lineHeight: 1.6,
    }}>
      <div style={{ color: "#e0e0e0", fontWeight: 700, marginBottom: 2, letterSpacing: "0.06em" }}>
        ${label}
      </div>
      <div style={{ color: v >= 0 ? "#22c55e" : "#ef4444" }}>DEX {fmtCompact(v)}</div>
    </div>
  );
}

const TICK = { fontSize: 8, fill: "#6b7280", fontFamily: MONO };
const GRID_STYLE = { stroke: "#1a1a1a" };

export function DeltaStrikerPanel({ rows, spot, symbol, updatedAt }: Props) {
  // Descending by strike for bar chart (high at top)
  const barData = useMemo(
    () =>
      rows
        .map((r) => {
          const dex = (r.callDelta * r.callOI + r.putDelta * r.putOI) * 100 * spot;
          return { strike: r.strike, dex: Number.isFinite(dex) ? dex : 0 };
        })
        .filter((d) => d.dex !== 0)
        .sort((a, b) => b.strike - a.strike),
    [rows, spot],
  );

  // Ascending by strike for area chart (left = low strike)
  const areaData = useMemo(() => [...barData].sort((a, b) => a.strike - b.strike), [barData]);

  const chartH = Math.max(220, barData.length * 20);

  return (
    <div style={{ background: "#0d0d0d", borderRadius: 6, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        background: "#161616", borderBottom: "1px solid #1f1f1f",
        padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em",
          color: "#e0e0e0", textTransform: "uppercase", fontWeight: 700,
        }}>
          Striker Delta · Delta Exposure · {symbol}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 9, color: "#6b7280",
          background: "#1a1a1a", border: "1px solid #2a2a2a",
          borderRadius: 3, padding: "1px 7px",
        }}>
          {updatedAt.toLocaleTimeString()}
        </span>
      </div>

      {/* Two-column chart grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", background: "#111111" }}>

        {/* LEFT: Striker Delta — horizontal bars */}
        <div style={{ background: "#0d0d0d", padding: "12px 8px 12px 12px" }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: "0.15em",
            color: "#6b7280", marginBottom: 8, textTransform: "uppercase",
          }}>
            Striker Delta
          </div>
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              layout="vertical"
              data={barData}
              margin={{ top: 2, right: 16, bottom: 2, left: 44 }}
            >
              <CartesianGrid horizontal={false} {...GRID_STYLE} />
              <XAxis
                type="number"
                tickFormatter={fmtCompact}
                tick={TICK}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="strike"
                tick={{ ...TICK, fontSize: 9, fill: "#a0a0a0" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
                width={44}
              />
              <RTooltip
                content={<TooltipBox />}
                cursor={{ fill: "rgba(255,255,255,0.025)" }}
              />
              <ReferenceLine x={0} stroke="#2a2a2a" strokeWidth={1} />
              <Bar dataKey="dex" maxBarSize={12} radius={[0, 2, 2, 0]}>
                {barData.map((d, i) => (
                  <Cell key={i} fill={d.dex >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.82} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Separator */}
        <div style={{ background: "#111111" }} />

        {/* RIGHT: Delta Exposure — area chart */}
        <div style={{ background: "#0d0d0d", padding: "12px 12px 12px 8px" }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: "0.15em",
            color: "#6b7280", marginBottom: 8, textTransform: "uppercase",
          }}>
            Delta Exposure
          </div>
          <ResponsiveContainer width="100%" height={chartH}>
            <AreaChart
              data={areaData}
              margin={{ top: 2, right: 8, bottom: 2, left: 12 }}
            >
              <defs>
                <linearGradient id="dexAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#4a9eff" stopOpacity={0.30} />
                  <stop offset="100%" stopColor="#4a9eff" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} {...GRID_STYLE} />
              <XAxis
                dataKey="strike"
                tick={{ ...TICK, fontSize: 9, fill: "#a0a0a0" }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                tickFormatter={fmtCompact}
                tick={TICK}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <RTooltip
                content={<TooltipBox />}
                cursor={{ stroke: "rgba(74,158,255,0.2)", strokeWidth: 1 }}
              />
              <ReferenceLine y={0} stroke="#2a2a2a" strokeWidth={1} />
              <Area
                type="monotone"
                dataKey="dex"
                stroke="#4a9eff"
                strokeWidth={2}
                fill="url(#dexAreaGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "#4a9eff", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

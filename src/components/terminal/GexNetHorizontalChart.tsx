import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ReferenceLine, Cell, CartesianGrid, ResponsiveContainer,
} from "recharts";
import type { ExposurePoint } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";

type Tab = "GEX" | "DEX" | "VEX";

interface Props {
  exposures: ExposurePoint[];
  spot: number;
  gammaFlip?: number | null;
  callWall?: number;
  putWall?: number;
  height?: number;
}

const FONT   = "'Courier New', monospace";
const BG     = "#030404";
const BORDER = "#111416";

const TAB_CFG: Record<Tab, { color: string; posColor: string; negColor: string; subtitle: string }> = {
  GEX: { color: "#00ff88", posColor: "rgba(0,255,136,0.88)",  negColor: "rgba(255,68,102,0.82)",  subtitle: "Net Gamma Exposure / Strike" },
  DEX: { color: "#06b6d4", posColor: "rgba(6,182,212,0.88)",  negColor: "rgba(255,68,102,0.82)",  subtitle: "Net Delta Exposure / Strike" },
  VEX: { color: "#facc15", posColor: "rgba(250,204,21,0.88)", negColor: "rgba(255,68,102,0.82)",  subtitle: "Net Vega Exposure / Strike" },
};

/* ── Tooltip ─────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label, tab }: any) {
  if (!active || !payload?.length) return null;
  const cfg = TAB_CFG[tab as Tab];
  return (
    <div style={{
      background: "rgba(3,4,4,0.98)", border: "1px solid #1e2224",
      borderRadius: 4, padding: "7px 12px", fontFamily: FONT,
      fontSize: 10, minWidth: 170,
      boxShadow: `0 0 14px ${cfg.color}22`,
    }}>
      <div style={{ color: "#555", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
        Strike {label}
      </div>
      {payload.map((p: any) => {
        const pos = (p.value ?? 0) >= 0;
        return (
          <div key={p.dataKey} style={{ color: pos ? cfg.posColor : cfg.negColor, fontWeight: 700, fontSize: 12 }}>
            {p.name}: {pos ? "+" : ""}{formatNumber(p.value)}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
export function GexNetHorizontalChart({ exposures, spot, gammaFlip, height = 400 }: Props) {
  const [tab, setTab] = useState<Tab>("GEX");

  const { chartData, nearestSpotStrike } = useMemo(() => {
    const lo = spot * 0.88;
    const hi = spot * 1.12;
    const filtered = exposures
      .filter(d => d.strike >= lo && d.strike <= hi)
      .sort((a, b) => b.strike - a.strike);

    let nearest = filtered[0]?.strike ?? spot;
    let minDiff = Infinity;
    for (const d of filtered) {
      const diff = Math.abs(d.strike - spot);
      if (diff < minDiff) { minDiff = diff; nearest = d.strike; }
    }

    return {
      chartData: filtered.map(d => ({
        strike: d.strike,
        call:   d.callGex,
        put:    d.putGex,
        dex:    d.dex   ?? 0,
        vex:    d.vex   ?? 0,
        netGex: d.netGex,
      })),
      nearestSpotStrike: nearest,
    };
  }, [exposures, spot]);

  const cfg = TAB_CFG[tab];

  /* shared axis / grid props */
  const xProps = {
    type: "number" as const,
    tickFormatter: (v: number) => formatNumber(v, 1),
    tick: { fill: "#2a2e30", fontSize: 8, fontFamily: FONT },
    axisLine: { stroke: "#161a1b" },
    tickLine: false as const,
    domain: ["auto", "auto"] as ["auto", "auto"],
  };

  const yProps = {
    type: "category" as const,
    dataKey: "strike",
    tick: ({ x, y, payload }: any) => {
      const isSpot = payload.value === nearestSpotStrike;
      return (
        <text
          x={x - 3} y={y + 4} textAnchor="end"
          fill={isSpot ? "#fbbf24" : "#2e3335"}
          fontSize={isSpot ? 9 : 8}
          fontFamily={FONT}
          fontWeight={isSpot ? 700 : 400}
        >
          {payload.value}
        </text>
      );
    },
    axisLine: false as const,
    tickLine: false as const,
    width: 42,
  };

  const refLines = (
    <>
      <ReferenceLine x={0} stroke="#161a1b" strokeWidth={1} />
      <ReferenceLine
        y={nearestSpotStrike}
        stroke="#fbbf24" strokeWidth={1} strokeDasharray="3 3"
        label={{ value: `$ ${spot}`, position: "right", fill: "#fbbf24", fontSize: 8, fontFamily: FONT }}
      />
      {gammaFlip != null && (
        <ReferenceLine
          y={gammaFlip}
          stroke="#a78bfa" strokeWidth={1} strokeDasharray="2 4"
          label={{ value: "FLIP", position: "right", fill: "#a78bfa", fontSize: 8, fontFamily: FONT }}
        />
      )}
    </>
  );

  return (
    <div style={{
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 5,
      padding: "10px 6px 8px", height,
      display: "flex", flexDirection: "column", fontFamily: FONT,
    }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6, paddingLeft: 4, paddingRight: 6 }}>
        <div>
          <div style={{ color: "#3e4446", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700 }}>
            HORIZONTAL GEX · {tab}
          </div>
          <div style={{ color: "#252829", fontSize: 7, marginTop: 1, letterSpacing: "0.08em" }}>{cfg.subtitle}</div>
        </div>
        {/* Tab buttons */}
        <div style={{ display: "flex", gap: 3 }}>
          {(["GEX", "DEX", "VEX"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? `${TAB_CFG[t].color}14` : "transparent",
                border: `1px solid ${tab === t ? TAB_CFG[t].color : "#1e2224"}`,
                color: tab === t ? TAB_CFG[t].color : "#3a3f41",
                borderRadius: 3, padding: "2px 9px",
                fontSize: 9, fontFamily: FONT, cursor: "pointer",
                fontWeight: tab === t ? 700 : 400, letterSpacing: "0.1em",
                transition: "all 0.12s",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* SPOT badge */}
      <div style={{ paddingLeft: 4, marginBottom: 5 }}>
        <span style={{
          background: "#130f00", border: "1px solid #fbbf24",
          borderRadius: 3, color: "#fbbf24", fontSize: 8,
          fontFamily: FONT, padding: "1px 8px", letterSpacing: "0.1em",
          fontWeight: 700,
        }}>
          SPOT ${spot}
        </span>
      </div>

      {/* ── Chart ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          {tab === "GEX" ? (
            /* GEX: single bar per strike — positive goes right (green), negative goes left (red) */
            <BarChart
              layout="vertical" data={chartData}
              margin={{ top: 2, right: 56, bottom: 2, left: 2 }}
              barCategoryGap="20%"
            >
              <CartesianGrid horizontal={false} stroke="#0b0e0e" />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              <Tooltip
                content={<CustomTooltip tab={tab} />}
                cursor={{ fill: "rgba(255,255,255,0.018)" }}
              />
              {refLines}
              <Bar dataKey="netGex" name="Net GEX" maxBarSize={14} isAnimationActive={false} radius={[0, 2, 2, 0]}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.netGex >= 0 ? cfg.posColor : cfg.negColor}
                    style={{ filter: d.strike === nearestSpotStrike ? `drop-shadow(0 0 4px ${d.netGex >= 0 ? cfg.posColor : cfg.negColor})` : "none" }}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            /* DEX / VEX: single bar, colored by sign */
            <BarChart
              layout="vertical" data={chartData}
              margin={{ top: 2, right: 56, bottom: 2, left: 2 }}
              barCategoryGap="22%"
            >
              <CartesianGrid horizontal={false} stroke="#0b0e0e" />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              <Tooltip
                content={<CustomTooltip tab={tab} />}
                cursor={{ fill: "rgba(255,255,255,0.018)" }}
              />
              {refLines}
              <Bar
                dataKey={tab === "DEX" ? "dex" : "vex"}
                name={tab}
                maxBarSize={14}
                isAnimationActive={false}
                radius={[0, 2, 2, 0]}
              >
                {chartData.map((d, i) => {
                  const val = tab === "DEX" ? d.dex : d.vex;
                  return <Cell key={i} fill={val >= 0 ? cfg.posColor : cfg.negColor} />;
                })}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

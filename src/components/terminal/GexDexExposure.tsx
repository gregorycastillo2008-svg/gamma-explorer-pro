import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Magnet, Shield } from "lucide-react";
import {
  computeExposures, computeKeyLevels, formatNumber,
  DemoTicker, OptionContract,
} from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

// ─────── ALTARIS PALETTE (hard-coded per spec) ───────
const C = {
  bg:        "#0a0a0a",
  border:    "#1f1f1f",
  grid:      "#1a1a1a",
  text:      "#e5e7eb",
  muted:     "#666",
  cyan:      "#00e5ff",
  red:       "#ff3d00",
  purple:    "#a78bfa",
  greenPos:  "#00ff88",
};

const FONT = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;

export function GexDexExposure({ ticker, contracts }: Props) {
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState<"8" | "15" | "all">("all");

  // ─── 1. Process exposure dataset ───
  const { rows, netDexB, netGexB, gammaFlip, topHighGex } = useMemo(() => {
    const exposures = computeExposures(ticker.spot, contracts);
    const levels = computeKeyLevels(exposures);

    // Range filter — user-selectable
    const filtered = rangeMode === "all"
      ? [...exposures].sort((a, b) => a.strike - b.strike)
      : (() => {
          const pct = rangeMode === "8" ? 0.08 : 0.15;
          const lo = ticker.spot * (1 - pct);
          const hi = ticker.spot * (1 + pct);
          return exposures.filter(e => e.strike >= lo && e.strike <= hi).sort((a, b) => a.strike - b.strike);
        })();

    const rows = filtered.map((e) => ({
      strike: e.strike,
      callGex: e.callGex,
      putGex: e.putGex,
      netGex: e.netGex,
      dex: e.dex,
      // chart units in billions for readability
      dexB: +(e.dex / 1e9).toFixed(3),
      netGexB: +(e.netGex / 1e9).toFixed(3),
    }));

    const netDexB = +(exposures.reduce((s, p) => s + p.dex, 0) / 1e9).toFixed(2);
    const netGexB = +(levels.totalGex / 1e9).toFixed(2);

    // Top 5 high-gex strikes (by absolute gamma exposure)
    const topHighGex = [...exposures]
      .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
      .slice(0, 5)
      .map((p) => {
        // Wall = strike opposing price (resistance/support); Magnet = near spot pinning
        const dist = Math.abs(p.strike - ticker.spot) / ticker.spot;
        const role: "wall" | "magnet" = dist > 0.015 ? "wall" : "magnet";
        return {
          strike: p.strike,
          netGex: p.netGex,
          netGexB: +(p.netGex / 1e9).toFixed(2),
          role,
          side: p.strike >= ticker.spot ? "above" : "below",
        };
      });

    return {
      rows,
      netDexB,
      netGexB,
      gammaFlip: levels.gammaFlip,
      topHighGex,
    };
  }, [ticker, contracts, rangeMode]);

  // Closest strike to spot (for purple SPOT reference line)
  const spotStrike = useMemo(() => {
    if (!rows.length) return ticker.spot;
    return rows.reduce((closest, r) =>
      Math.abs(r.strike - ticker.spot) < Math.abs(closest.strike - ticker.spot) ? r : closest,
    rows[0]).strike;
  }, [rows, ticker.spot]);

  // Max absolute |dex| for opacity / glow scaling
  const maxAbs = useMemo(
    () => Math.max(...rows.map((r) => Math.abs(r.dexB)), 0.001),
    [rows],
  );

  // ─── 2. Custom tooltip ───
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    return (
      <div
        style={{
          background: "#000",
          border: `1px solid ${C.border}`,
          color: C.text,
          fontFamily: FONT,
          padding: "10px 12px",
          borderRadius: 4,
          minWidth: 200,
          boxShadow: "0 0 24px rgba(0,229,255,0.15)",
        }}
      >
        <div style={{ color: C.cyan, fontSize: 11, letterSpacing: "0.15em" }}>
          STRIKE ${r.strike}
        </div>
        <div style={{ height: 1, background: C.border, margin: "6px 0" }} />
        <Row label="Call GEX" value={formatNumber(r.callGex)} color={C.cyan} />
        <Row label="Put GEX"  value={formatNumber(r.putGex)}  color={C.red} />
        <Row label="Net GEX"  value={formatNumber(r.netGex)}  color={r.netGex >= 0 ? C.cyan : C.red} bold />
        <div style={{ height: 1, background: C.border, margin: "6px 0" }} />
        <Row label="Net DEX" value={`${r.dexB >= 0 ? "+" : ""}${r.dexB}B`} color={r.dexB >= 0 ? C.cyan : C.red} bold />
      </div>
    );
  };

  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        fontFamily: FONT,
      }}
      className="rounded-lg w-full h-full flex flex-col overflow-hidden"
    >
      {/* ─── HEADER (Net DEX · Spot · Gamma Flip) ─── */}
      <div
        className="px-6 py-4 grid grid-cols-3 gap-6 shrink-0"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <Metric
          label="Net DEX Exposure"
          value={`${netDexB >= 0 ? "+" : ""}${netDexB.toFixed(1)}B`}
          tone={netDexB >= 0 ? "pos" : "neg"}
          glow
        />
        <Metric
          label="Spot Price"
          value={`$${ticker.spot.toFixed(2)}`}
          sub={ticker.symbol}
        />
        <Metric
          label="Gamma Flip / Zero GEX"
          value={gammaFlip != null ? `$${gammaFlip}` : "—"}
          sub={`Net GEX ${netGexB >= 0 ? "+" : ""}${netGexB}B`}
          tone="flip"
        />
      </div>

      {/* ─── BODY: Chart (left) + Top High-Gex Strikes (right) ─── */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px]">
        {/* Histogram */}
        <div
          className="relative p-4"
          style={{ borderRight: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span
              style={{ color: C.muted, fontSize: 10, letterSpacing: "0.2em" }}
              className="uppercase font-bold"
            >
              ↳ Net DEX Histogram · per Strike · {rows.length} strikes
            </span>
            <div className="flex items-center gap-4">
              {/* Range selector */}
              <div className="flex gap-1">
                {(["8", "15", "all"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setRangeMode(m)}
                    style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 3,
                      fontFamily: FONT, letterSpacing: "0.1em",
                      background: rangeMode === m ? C.cyan : "transparent",
                      color: rangeMode === m ? "#000" : C.muted,
                      border: `1px solid ${rangeMode === m ? C.cyan : C.border}`,
                      cursor: "pointer",
                    }}
                  >
                    {m === "all" ? "ALL" : `±${m}%`}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 text-[10px] uppercase tracking-wider">
                <Legend color={C.cyan} label="Bullish DEX" />
                <Legend color={C.red}  label="Bearish DEX" />
                <Legend color={C.purple} label="Spot" dashed />
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height="92%">
            <BarChart
              data={rows}
              margin={{ top: 16, right: 12, left: 4, bottom: 8 }}
              barCategoryGap={1}
              onMouseMove={(s: any) => setHoverStrike(s?.activeLabel ?? null)}
              onMouseLeave={() => setHoverStrike(null)}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={C.grid}
                vertical={false}
              />
              <XAxis
                dataKey="strike"
                stroke={C.muted}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: C.border }}
                interval="preserveStartEnd"
                tick={{ fontFamily: FONT }}
              />
              <YAxis
                stroke={C.muted}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tick={{ fontFamily: FONT }}
                tickFormatter={(v) => `${v}B`}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,229,255,0.06)" }}
                content={renderTooltip}
              />

              {/* SPOT vertical purple dashed */}
              <ReferenceLine
                x={spotStrike}
                stroke={C.purple}
                strokeDasharray="5 5"
                strokeWidth={1.2}
                label={{
                  position: "top",
                  value: `SPOT $${ticker.spot.toFixed(2)}`,
                  fill: C.purple,
                  fontSize: 10,
                  fontFamily: FONT,
                }}
              />

              {/* Gamma Flip vertical (if exists & inside range) */}
              {gammaFlip != null && (
                <ReferenceLine
                  x={gammaFlip}
                  stroke={C.greenPos}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  label={{
                    position: "insideTopRight",
                    value: "γ FLIP",
                    fill: C.greenPos,
                    fontSize: 9,
                    fontFamily: FONT,
                  }}
                />
              )}

              <ReferenceLine y={0} stroke={C.border} />

              <Bar dataKey="dexB" radius={[2, 2, 0, 0]}>
                {rows.map((r, i) => {
                  const intensity = Math.abs(r.dexB) / maxAbs;
                  const isExtreme = intensity > 0.7;
                  const isHover = hoverStrike === r.strike;
                  const fill = r.dexB >= 0 ? C.cyan : C.red;
                  return (
                    <Cell
                      key={i}
                      fill={fill}
                      fillOpacity={isHover ? 0.95 : 0.6}
                      stroke={isExtreme ? fill : "transparent"}
                      strokeWidth={isExtreme ? 1 : 0}
                      style={
                        isExtreme
                          ? { filter: `drop-shadow(0 0 6px ${fill})` }
                          : undefined
                      }
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top High-Gex Strikes panel */}
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <div>
            <div
              style={{ color: C.cyan, fontSize: 10, letterSpacing: "0.2em" }}
              className="font-bold uppercase"
            >
              Top High-Gex Strikes
            </div>
            <div style={{ color: C.muted, fontSize: 10 }}>
              Top 5 absolute gamma concentration
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {topHighGex.map((s, idx) => {
              const positive = s.netGex >= 0;
              const accent = positive ? C.cyan : C.red;
              const RoleIcon = s.role === "magnet" ? Magnet : Shield;
              const SideIcon = s.side === "above" ? ArrowUpRight : ArrowDownRight;
              return (
                <div
                  key={s.strike}
                  className="rounded p-3 flex flex-col gap-1.5 transition-colors"
                  style={{
                    background: "#000",
                    border: `1px solid ${C.border}`,
                    boxShadow:
                      idx === 0
                        ? `0 0 16px ${accent}33, inset 0 0 8px ${accent}22`
                        : "none",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      style={{ color: C.text, fontSize: 13, fontWeight: 700 }}
                    >
                      ${s.strike}
                    </span>
                    <span
                      className="flex items-center gap-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        color: accent,
                        background: `${accent}15`,
                        border: `1px solid ${accent}40`,
                      }}
                    >
                      <RoleIcon className="h-2.5 w-2.5" />
                      {s.role === "magnet" ? "Magnet" : "Wall"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span style={{ color: C.muted }} className="uppercase tracking-wider">
                      Net Gex
                    </span>
                    <span style={{ color: accent, fontWeight: 600 }}>
                      {s.netGexB >= 0 ? "+" : ""}{s.netGexB}B
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px]" style={{ color: C.muted }}>
                    <SideIcon className="h-2.5 w-2.5" />
                    {s.side === "above" ? "Resistance" : "Support"} · {(Math.abs(s.strike - ticker.spot)).toFixed(0)} pts from spot
                  </div>
                  {/* Glow bar */}
                  <div
                    className="h-0.5 rounded-full mt-1"
                    style={{
                      background: accent,
                      opacity: 0.6,
                      boxShadow: `0 0 6px ${accent}`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────── Sub-components ───────
function Metric({
  label, value, sub, tone, glow,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | "flip";
  glow?: boolean;
}) {
  const color = tone === "pos" ? C.cyan : tone === "neg" ? C.red : tone === "flip" ? "#a78bfa" : C.text;
  return (
    <div className="flex flex-col">
      <span
        style={{ color: C.muted, fontSize: 10, letterSpacing: "0.18em" }}
        className="uppercase font-bold"
      >
        {label}
      </span>
      <span
        style={{
          color,
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.1,
          textShadow: glow ? `0 0 12px ${color}80` : undefined,
        }}
        className="mt-1"
      >
        {value}
      </span>
      {sub && (
        <span style={{ color: C.muted, fontSize: 10 }} className="uppercase tracking-wider mt-0.5">
          {sub}
        </span>
      )}
    </div>
  );
}

function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span style={{ color: C.muted }} className="uppercase tracking-wider">
        {label}
      </span>
      <span style={{ color, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ color: C.muted }} className="flex items-center gap-1.5">
      <span
        style={{
          width: 12,
          height: 0,
          borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
          display: "inline-block",
          boxShadow: dashed ? "none" : `0 0 6px ${color}`,
        }}
      />
      {label}
    </span>
  );
}

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";
import {
  computeExposures, computeKeyLevels, formatNumber,
  DemoTicker, OptionContract,
} from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

// ─── gexstream-inspired palette ───
const C = {
  bg:        "#1a1a1a",
  panel:     "#0f0f0f",
  border:    "#2a2a2a",
  grid:      "#262626",
  text:      "#e5e7eb",
  muted:     "#888",
  green:     "#00ff88",   // positive gamma (above spot, calls)
  red:       "#ff3355",   // negative gamma (below spot, puts)
  yellow:    "#ffd000",   // spot price line
  blue:      "#3b82f6",
  purple:    "#a78bfa",
};
const FONT = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;

type Metric = "GEX" | "DEX" | "VEX";

export function HorizontalGEXChart({ ticker, contracts }: Props) {
  const [metric, setMetric] = useState<Metric>("GEX");
  const [zoom, setZoom] = useState<number>(40); // # of strikes visible
  const [expiryFilter, setExpiryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Available expiries
  const expiries = useMemo(() => {
    const set = new Set<number>();
    contracts.forEach((c) => set.add(c.expiry));
    return Array.from(set).sort((a, b) => a - b);
  }, [contracts]);

  // Filter by expiry
  const filteredContracts = useMemo(() => {
    if (expiryFilter === "all") return contracts;
    return contracts.filter((c) => String(c.expiry) === expiryFilter);
  }, [contracts, expiryFilter]);

  // ─── compute exposures + per-strike volume / OI ───
  const { rows, callWall, putWall } = useMemo(() => {
    const exposures = computeExposures(ticker.spot, filteredContracts);
    const levels = computeKeyLevels(exposures);

    // Aggregate call/put volume + OI per strike
    const sideMap = new Map<number, { callOI: number; putOI: number; callVol: number; putVol: number }>();
    for (const c of filteredContracts) {
      const cur = sideMap.get(c.strike) ?? { callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
      // No real volume in demo data → estimate as 30% of OI
      const vol = Math.round(c.oi * 0.3);
      if (c.type === "call") { cur.callOI += c.oi; cur.callVol += vol; }
      else { cur.putOI += c.oi; cur.putVol += vol; }
      sideMap.set(c.strike, cur);
    }

    // Center on spot, take ±zoom/2 strikes
    const half = Math.max(8, Math.floor(zoom / 2));
    const sorted = [...exposures].sort((a, b) => a.strike - b.strike);
    const spotIdx = sorted.findIndex((e) => e.strike >= ticker.spot);
    const start = Math.max(0, spotIdx - half);
    const end = Math.min(sorted.length, spotIdx + half);
    const sliced = sorted.slice(start, end);

    const rows = sliced.map((e) => {
      const sides = sideMap.get(e.strike) ?? { callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
      const value =
        metric === "GEX" ? e.netGex :
        metric === "DEX" ? e.dex :
        e.vex;
      // Per-side magnitudes for the metric (so red & green can be drawn at the same strike row)
      const callSide =
        metric === "GEX" ? e.callGex :
        metric === "DEX" ? Math.max(0, e.dex) :
        Math.max(0, e.vex);
      const putSide =
        metric === "GEX" ? e.putGex :
        metric === "DEX" ? Math.min(0, e.dex) :
        Math.min(0, e.vex);
      return {
        strike: e.strike,
        value,
        shares: value / ticker.spot,
        // split bars: red goes left (negative), green goes right (positive) — drawn at same row
        callShares: Math.max(0, callSide) / ticker.spot,   // green, right side
        putShares: -Math.abs(putSide) / ticker.spot,        // red, left side
        callOI: sides.callOI,
        putOI: sides.putOI,
        callVol: sides.callVol,
        putVol: sides.putVol,
        netGex: e.netGex,
        dex: e.dex,
        callGex: e.callGex,
        putGex: e.putGex,
        aboveSpot: e.strike >= ticker.spot,
      };
    });

    return { rows, callWall: levels.callWall, putWall: levels.putWall };
  }, [ticker, filteredContracts, metric, zoom]);

  const maxAbs = useMemo(
    () => Math.max(
      ...rows.map((r) => Math.max(Math.abs(r.callShares), Math.abs(r.putShares))),
      1,
    ),
    [rows],
  );

  // Selected strike detail
  const detail = useMemo(() => {
    if (selected == null) return null;
    const r = rows.find((x) => x.strike === selected);
    if (!r) return null;
    const distPct = ((r.strike - ticker.spot) / ticker.spot) * 100;
    const totalOI = r.callOI + r.putOI;
    // Classification
    let cls: { label: string; color: string };
    if (r.strike === callWall || r.strike === putWall) {
      cls = { label: "GAMMA WALL", color: C.yellow };
    } else if (totalOI > 8000) {
      cls = { label: "HVN · High Volume Node", color: C.green };
    } else {
      cls = { label: "LVN · Low Volume Node", color: C.muted };
    }
    return { r, distPct, totalOI, cls };
  }, [selected, rows, ticker.spot, callWall, putWall]);

  // ─── tooltip ───
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    const isCall = r.aboveSpot;
    return (
      <div
        style={{
          background: "#000",
          border: `1px solid ${isCall ? C.green : C.red}`,
          color: C.text,
          fontFamily: FONT,
          padding: "10px 12px",
          borderRadius: 4,
          minWidth: 220,
          boxShadow: `0 0 24px ${isCall ? C.green : C.red}33`,
        }}
      >
        <div style={{ color: isCall ? C.green : C.red, fontSize: 11, letterSpacing: "0.15em" }}>
          STRIKE ${r.strike} · {isCall ? "CALL SIDE" : "PUT SIDE"}
        </div>
        <div style={{ height: 1, background: C.border, margin: "6px 0" }} />
        <Row label={`${metric} (shares/$)`} value={formatNumber(r.shares)} color={r.shares >= 0 ? C.green : C.red} bold />
        <Row label="Call OI" value={formatNumber(r.callOI, 0)} color={C.green} />
        <Row label="Put OI"  value={formatNumber(r.putOI, 0)}  color={C.red} />
        <Row label="Net GEX" value={formatNumber(r.netGex)} color={r.netGex >= 0 ? C.green : C.red} />
      </div>
    );
  };

  return (
    <div
      className="w-full h-full flex flex-col rounded-lg overflow-hidden"
      style={{ background: C.bg, border: `1px solid ${C.border}`, fontFamily: FONT }}
    >
      {/* ─── TOOLBAR ─── */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0 flex-wrap"
        style={{ borderBottom: `1px solid ${C.border}`, background: C.panel }}
      >
        <span style={{ color: C.muted, fontSize: 10, letterSpacing: "0.2em" }} className="uppercase font-bold">
          Horizontal GEX · {ticker.symbol}
        </span>

        {/* Metric toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {(["GEX", "DEX", "VEX"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="px-2.5 py-1 text-[10px] font-bold tracking-wider transition-colors"
              style={{
                background: metric === m ? C.green : "transparent",
                color: metric === m ? "#000" : C.muted,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Expiry */}
        <div className="flex items-center gap-1.5">
          <span style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider">EXP</span>
          <select
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value)}
            className="bg-transparent text-[10px] px-2 py-1 rounded outline-none cursor-pointer"
            style={{ color: C.text, border: `1px solid ${C.border}`, fontFamily: FONT }}
          >
            <option value="all" style={{ background: C.bg }}>ALL</option>
            {expiries.map((e) => (
              <option key={e} value={String(e)} style={{ background: C.bg }}>{e}D</option>
            ))}
          </select>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2 ml-auto">
          <span style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider">Strikes</span>
          <input
            type="range" min={10} max={80} step={2}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ accentColor: C.green }}
            className="w-28"
          />
          <span style={{ color: C.text, fontSize: 10 }} className="font-bold w-6 text-right">{rows.length}</span>
        </div>

        {/* Spot ref */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}40` }}>
          <span style={{ background: C.yellow }} className="h-2 w-2 rounded-full" />
          <span style={{ color: C.yellow, fontSize: 10, fontWeight: 700 }}>SPOT ${ticker.spot.toFixed(2)}</span>
        </div>
      </div>

      {/* ─── BODY ─── */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_300px]">
        {/* Chart */}
        <div className="relative p-3" style={{ borderRight: `1px solid ${C.border}` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={rows}
              margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              barCategoryGap={1}
              onMouseMove={(s: any) => setHover(s?.activeLabel ?? null)}
              onMouseLeave={() => setHover(null)}
            >
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[-maxAbs, maxAbs]}
                stroke={C.muted}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: C.border }}
                tick={{ fontFamily: FONT }}
                tickFormatter={(v) => formatNumber(v)}
                label={{
                  value: "shares per $ move",
                  position: "insideBottom",
                  offset: -2,
                  fill: C.muted,
                  fontSize: 9,
                  fontFamily: FONT,
                }}
              />
              <YAxis
                type="category"
                dataKey="strike"
                stroke={C.muted}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: C.border }}
                tick={{ fontFamily: FONT, fill: C.text }}
                width={56}
                interval={0}
                reversed={false}
              />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={renderTooltip} />

              {/* Center axis */}
              <ReferenceLine x={0} stroke={C.border} strokeWidth={1} />

              {/* Yellow dashed SPOT line — placed at the strike closest to spot */}
              <ReferenceLine
                y={rows.reduce(
                  (best, r) => (Math.abs(r.strike - ticker.spot) < Math.abs(best - ticker.spot) ? r.strike : best),
                  rows[0]?.strike ?? ticker.spot,
                )}
                stroke={C.yellow}
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  position: "right",
                  value: `$${ticker.spot.toFixed(2)}`,
                  fill: C.yellow,
                  fontSize: 10,
                  fontFamily: FONT,
                  fontWeight: 700,
                }}
              />

              {/* RED first → renders BEHIND (puts, left side) */}
              <Bar
                dataKey="putShares"
                barSize={10}
                radius={[2, 0, 0, 2]}
                onClick={(d: any) => setSelected(d?.strike ?? null)}
                cursor="pointer"
                isAnimationActive={false}
              >
                {rows.map((r, i) => {
                  const isWall = r.strike === putWall;
                  const isHover = hover === r.strike;
                  const isSel = selected === r.strike;
                  const intensity = Math.abs(r.putShares) / maxAbs;
                  return (
                    <Cell
                      key={`p-${i}`}
                      fill={C.red}
                      fillOpacity={isHover || isSel ? 0.95 : isWall ? 0.9 : 0.55 + intensity * 0.3}
                      stroke={isSel ? C.yellow : isWall ? C.red : "transparent"}
                      strokeWidth={isSel ? 1.5 : isWall ? 1 : 0}
                      style={isWall || isSel ? { filter: `drop-shadow(0 0 6px ${isSel ? C.yellow : C.red})` } : undefined}
                    />
                  );
                })}
              </Bar>

              {/* GREEN second → renders ON TOP (calls, right side) */}
              <Bar
                dataKey="callShares"
                barSize={10}
                radius={[0, 2, 2, 0]}
                onClick={(d: any) => setSelected(d?.strike ?? null)}
                cursor="pointer"
                isAnimationActive={false}
              >
                {rows.map((r, i) => {
                  const isWall = r.strike === callWall;
                  const isHover = hover === r.strike;
                  const isSel = selected === r.strike;
                  const intensity = Math.abs(r.callShares) / maxAbs;
                  return (
                    <Cell
                      key={`c-${i}`}
                      fill={C.green}
                      fillOpacity={isHover || isSel ? 0.95 : isWall ? 0.9 : 0.55 + intensity * 0.3}
                      stroke={isSel ? C.yellow : isWall ? C.green : "transparent"}
                      strokeWidth={isSel ? 1.5 : isWall ? 1 : 0}
                      style={isWall || isSel ? { filter: `drop-shadow(0 0 6px ${isSel ? C.yellow : C.green})` } : undefined}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ─── STRIKE DETAIL PANEL ─── */}
        <div className="p-4 overflow-y-auto flex flex-col gap-3" style={{ background: C.panel }}>
          <div>
            <div style={{ color: C.green, fontSize: 10, letterSpacing: "0.2em" }} className="font-bold uppercase">
              Strike Detail
            </div>
            <div style={{ color: C.muted, fontSize: 10 }}>Click a bar to inspect</div>
          </div>

          {!detail && (
            <div
              className="rounded p-4 text-center text-[11px]"
              style={{ background: "#000", border: `1px dashed ${C.border}`, color: C.muted }}
            >
              No strike selected
            </div>
          )}

          {detail && (
            <div className="rounded p-3 flex flex-col gap-2.5"
              style={{ background: "#000", border: `1px solid ${detail.r.aboveSpot ? C.green : C.red}` }}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>${detail.r.strike}</span>
                <span
                  className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: detail.cls.color, background: `${detail.cls.color}15`, border: `1px solid ${detail.cls.color}40` }}
                >
                  {detail.cls.label}
                </span>
              </div>

              <DetailRow label="Distance from Spot"
                value={`${detail.distPct >= 0 ? "+" : ""}${detail.distPct.toFixed(2)}%`}
                color={detail.distPct >= 0 ? C.green : C.red} />

              <Divider />

              <DetailRow label="Call OI" value={formatNumber(detail.r.callOI, 0)} color={C.green} />
              <DetailRow label="Put OI"  value={formatNumber(detail.r.putOI, 0)}  color={C.red} />
              <DetailRow label="Call Vol" value={formatNumber(detail.r.callVol, 0)} color={C.green} dim />
              <DetailRow label="Put Vol"  value={formatNumber(detail.r.putVol, 0)}  color={C.red} dim />

              <Divider />

              <DetailRow label="Total Gamma" value={formatNumber(detail.r.netGex)}
                color={detail.r.netGex >= 0 ? C.green : C.red} bold />
              <DetailRow label="Total Delta" value={formatNumber(detail.r.dex)}
                color={detail.r.dex >= 0 ? C.green : C.red} bold />
              <DetailRow label="Call GEX" value={formatNumber(detail.r.callGex)} color={C.green} dim />
              <DetailRow label="Put GEX"  value={formatNumber(detail.r.putGex)}  color={C.red} dim />

              <button
                onClick={() => setSelected(null)}
                className="mt-1 text-[9px] uppercase tracking-wider py-1 rounded"
                style={{ color: C.muted, border: `1px solid ${C.border}` }}
              >
                Clear selection
              </button>
            </div>
          )}

          {/* Walls quick ref */}
          <div className="mt-1">
            <div style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider mb-1.5">Key Walls</div>
            <button
              onClick={() => setSelected(callWall)}
              className="w-full flex justify-between items-center px-2.5 py-1.5 rounded mb-1 text-[11px]"
              style={{ background: "#000", border: `1px solid ${C.green}40`, color: C.green }}
            >
              <span>Call Wall</span><span className="font-bold">${callWall}</span>
            </button>
            <button
              onClick={() => setSelected(putWall)}
              className="w-full flex justify-between items-center px-2.5 py-1.5 rounded text-[11px]"
              style={{ background: "#000", border: `1px solid ${C.red}40`, color: C.red }}
            >
              <span>Put Wall</span><span className="font-bold">${putWall}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span style={{ color: C.muted }} className="uppercase tracking-wider">{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function DetailRow({ label, value, color, bold, dim }: { label: string; value: string; color: string; bold?: boolean; dim?: boolean }) {
  return (
    <div className="flex justify-between items-center text-[11px]">
      <span style={{ color: C.muted, opacity: dim ? 0.7 : 1 }} className="uppercase tracking-wider text-[10px]">{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 500, opacity: dim ? 0.85 : 1 }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border }} />;
}

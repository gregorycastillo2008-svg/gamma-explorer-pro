import { useMemo, useState, useRef, useEffect } from "react";
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

const C = {
  bg:        "#0a0a0a",
  panel:     "#070707",
  border:    "#1e1e1e",
  grid:      "#141414",
  text:      "#e5e7eb",
  muted:     "#555",
  green:     "#00ff44",
  greenMax:  "#00ff00",
  red:       "#ff2233",
  redMax:    "#ff0000",
  yellow:    "#ffd000",
  orange:    "#ff9900",
  purple:    "#c084fc",
  cyan:      "#00e5ff",
  white:     "#ffffff",
  blue:      "#3b82f6",
};
const FONT  = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
const BAR_H = 28; // px per bar row — más gruesas

type Metric = "GEX" | "DEX" | "VEX";

export function HorizontalGEXChart({ ticker, contracts }: Props) {
  const [metric, setMetric]           = useState<Metric>("GEX");
  const [zoom, setZoom]               = useState<number>(0);
  const [expiryFilter, setExpiryFilter] = useState<string>("all");
  const [selected, setSelected]       = useState<number | null>(null);
  const [hover, setHover]             = useState<number | null>(null);
  const scrollRef                     = useRef<HTMLDivElement>(null);

  const expiries = useMemo(() => {
    const set = new Set<number>();
    contracts.forEach((c) => set.add(c.expiry));
    return Array.from(set).sort((a, b) => a - b);
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    if (expiryFilter === "all") return contracts;
    return contracts.filter((c) => String(c.expiry) === expiryFilter);
  }, [contracts, expiryFilter]);

  const { rows, callWall, putWall, majorWall, maxPain, volTrigger, gammaFlip, deltaZeroStrike } = useMemo(() => {
    const exposures = computeExposures(ticker.spot, filteredContracts);
    const levels    = computeKeyLevels(exposures);

    const sideMap = new Map<number, { callOI: number; putOI: number; callVol: number; putVol: number }>();
    for (const c of filteredContracts) {
      const cur = sideMap.get(c.strike) ?? { callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
      const vol = Math.round(c.oi * 0.3);
      if (c.type === "call") { cur.callOI += c.oi; cur.callVol += vol; }
      else                   { cur.putOI  += c.oi; cur.putVol  += vol; }
      sideMap.set(c.strike, cur);
    }

    const sorted = [...exposures].sort((a, b) => a.strike - b.strike);

    const sliced = zoom === 0 ? sorted : (() => {
      const half    = Math.max(8, Math.floor(zoom / 2));
      const spotIdx = sorted.findIndex((e) => e.strike >= ticker.spot);
      const start   = Math.max(0, spotIdx - half);
      const end     = Math.min(sorted.length, spotIdx + half);
      return sorted.slice(start, end);
    })();

    const rows = sliced.map((e) => {
      const sides = sideMap.get(e.strike) ?? { callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
      const value = metric === "GEX" ? e.netGex : metric === "DEX" ? e.dex : e.vex;
      return {
        strike: e.strike, value, shares: value / ticker.spot,
        callOI: sides.callOI, putOI: sides.putOI,
        callVol: sides.callVol, putVol: sides.putVol,
        netGex: e.netGex, dex: e.dex,
        callGex: e.callGex, putGex: e.putGex,
        aboveSpot: e.strike >= ticker.spot,
      };
    });

    let cumDex = 0, deltaZeroStrike: number | null = null;
    const dexSorted = [...rows].sort((a, b) => a.strike - b.strike);
    for (let i = 0; i < dexSorted.length; i++) {
      const prev = cumDex;
      cumDex += dexSorted[i].dex;
      if (i > 0 && ((prev < 0 && cumDex >= 0) || (prev > 0 && cumDex <= 0))) {
        deltaZeroStrike = dexSorted[i].strike; break;
      }
    }
    if (deltaZeroStrike === null && dexSorted.length > 0) {
      deltaZeroStrike = dexSorted.reduce((best, r) =>
        Math.abs(r.dex) < Math.abs(best.dex) ? r : best).strike;
    }

    return { rows, callWall: levels.callWall, putWall: levels.putWall,
      majorWall: levels.majorWall, maxPain: levels.maxPain,
      volTrigger: levels.volTrigger, gammaFlip: levels.gammaFlip, deltaZeroStrike };
  }, [ticker, filteredContracts, metric, zoom]);

  // Auto-scroll al spot cuando cargan los datos
  useEffect(() => {
    if (!scrollRef.current || rows.length === 0) return;
    const spotIdx = rows.findIndex((r) => r.strike >= ticker.spot);
    if (spotIdx < 0) return;
    const ratio     = spotIdx / rows.length;
    const el        = scrollRef.current;
    const chartH    = rows.length * BAR_H + 48;
    const targetTop = ratio * chartH - el.clientHeight / 2;
    el.scrollTop    = Math.max(0, targetTop);
  }, [rows, ticker.spot]);

  const maxAbs = useMemo(
    () => Math.max(...rows.map((r) => Math.abs(r.shares)), 1), [rows]);

  const { maxPosStrike, maxNegStrike } = useMemo(() => {
    let maxPosStrike: number | null = null, maxNegStrike: number | null = null;
    let maxPosVal = -Infinity, maxNegVal = Infinity;
    for (const r of rows) {
      if (r.shares > maxPosVal) { maxPosVal = r.shares; maxPosStrike = r.strike; }
      if (r.shares < maxNegVal) { maxNegVal = r.shares; maxNegStrike = r.strike; }
    }
    return { maxPosStrike, maxNegStrike };
  }, [rows]);

  const detail = useMemo(() => {
    if (selected == null) return null;
    const r = rows.find((x) => x.strike === selected);
    if (!r) return null;
    const distPct = ((r.strike - ticker.spot) / ticker.spot) * 100;
    const totalOI = r.callOI + r.putOI;
    let cls: { label: string; color: string };
    if (r.strike === callWall || r.strike === putWall)
      cls = { label: "GAMMA WALL", color: C.yellow };
    else if (totalOI > 8000)
      cls = { label: "HVN · High Volume Node", color: C.green };
    else
      cls = { label: "LVN · Low Volume Node", color: C.muted };
    return { r, distPct, totalOI, cls };
  }, [selected, rows, ticker.spot, callWall, putWall]);

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    const isPos = r.shares >= 0;
    const borderColor = r.strike === maxPosStrike ? C.greenMax : r.strike === maxNegStrike ? C.redMax : isPos ? C.green : C.red;
    return (
      <div style={{ background: "#000", border: `1px solid ${borderColor}`, color: C.text,
        fontFamily: FONT, padding: "10px 12px", borderRadius: 4, minWidth: 230,
        boxShadow: `0 0 28px ${borderColor}44` }}>
        <div style={{ color: borderColor, fontSize: 11, letterSpacing: "0.15em", marginBottom: 4 }}>
          {r.strike === maxPosStrike || r.strike === maxNegStrike ? "★ " : ""}
          STRIKE ${r.strike} · {isPos ? "CALL SIDE" : "PUT SIDE"}
        </div>
        <div style={{ height: 1, background: C.border, margin: "6px 0" }} />
        <Row label={`${metric} (shares/$)`} value={formatNumber(r.shares)} color={isPos ? C.green : C.red} bold />
        <Row label="Call OI" value={formatNumber(r.callOI, 0)} color={C.green} />
        <Row label="Put OI"  value={formatNumber(r.putOI, 0)}  color={C.red} />
        <Row label="Net GEX" value={formatNumber(r.netGex)} color={r.netGex >= 0 ? C.green : C.red} />
        <Row label="Net DEX" value={formatNumber(r.dex)}    color={r.dex >= 0 ? C.cyan : C.red} />
      </div>
    );
  };

  const chartH    = Math.max(320, rows.length * BAR_H + 48);
  const spotStrike = rows.reduce(
    (best, r) => (Math.abs(r.strike - ticker.spot) < Math.abs(best - ticker.spot) ? r.strike : best),
    rows[0]?.strike ?? ticker.spot);

  return (
    <div className="w-full h-full flex flex-col rounded-lg overflow-hidden"
      style={{ background: C.bg, border: `1px solid ${C.border}`, fontFamily: FONT }}>

      {/* ─── TOOLBAR ─── */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0 flex-wrap"
        style={{ borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        <span style={{ color: "#4a5580", fontSize: 10, letterSpacing: "0.2em" }} className="uppercase font-bold">
          Horizontal GEX · {ticker.symbol}
        </span>

        <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {(["GEX", "DEX", "VEX"] as Metric[]).map((m) => (
            <button key={m} onClick={() => setMetric(m)}
              className="px-2.5 py-1 text-[10px] font-bold tracking-wider transition-colors"
              style={{ background: metric === m ? C.green : "transparent", color: metric === m ? "#000" : C.muted }}>
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider">EXP</span>
          {[{ v: "all", l: "ALL", sub: "" }, ...expiries.map(e => ({
            v: String(e), l: `${e}D`,
            sub: e === 0 ? "HOY" : e === 1 ? "MAÑANA" : e === 2 ? "PASADO MÑN" : e === 7 ? "WEEKLY" : e === 14 ? "2-WEEK" : e === 30 ? "MONTHLY" : "",
          }))].map(({ v, l, sub }) => (
            <button key={v} onClick={() => setExpiryFilter(v)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center",
                fontSize: 9, padding: "2px 7px", borderRadius: 3, fontFamily: FONT,
                letterSpacing: "0.08em", cursor: "pointer",
                background: expiryFilter === v ? C.green : "transparent",
                color: expiryFilter === v ? "#000" : C.muted,
                border: `1px solid ${expiryFilter === v ? C.green : C.border}` }}>
              <span style={{ fontWeight: 700 }}>{l}</span>
              {sub && <span style={{ fontSize: 7, opacity: 0.75 }}>{sub}</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider">Vista</span>
          <button onClick={() => setZoom(0)}
            style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, fontFamily: FONT,
              letterSpacing: "0.1em", background: zoom === 0 ? C.green : "transparent",
              color: zoom === 0 ? "#000" : C.muted,
              border: `1px solid ${zoom === 0 ? C.green : C.border}`, cursor: "pointer" }}>
            ALL
          </button>
          <input type="range" min={10} max={80} step={2}
            value={zoom === 0 ? 10 : zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ accentColor: C.green }} className="w-24" />
          <span style={{ color: C.text, fontSize: 10 }} className="font-bold w-12 text-right">
            {zoom === 0 ? `ALL (${rows.length})` : rows.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded"
          style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}40` }}>
          <span style={{ background: C.yellow }} className="h-2 w-2 rounded-full" />
          <span style={{ color: C.yellow, fontSize: 10, fontWeight: 700 }}>SPOT ${ticker.spot.toFixed(2)}</span>
        </div>
      </div>

      {/* ─── BODY ─── */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px]">

        {/* Chart — scrollable */}
        <div
          ref={scrollRef}
          className="relative overflow-y-auto overflow-x-hidden"
          style={{ borderRight: `1px solid ${C.border}` }}
        >
          <div style={{ height: chartH, padding: "6px 6px 8px 0" }}>
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart layout="vertical" data={rows}
                margin={{ top: 8, right: 160, left: 8, bottom: 24 }}
                barCategoryGap={2}
                onMouseMove={(s: any) => setHover(s?.activeLabel ?? null)}
                onMouseLeave={() => setHover(null)}>
                <defs>
                  <filter id="glowGreen" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="glowRed" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                <CartesianGrid stroke={C.grid} strokeDasharray="2 6" horizontal={false} />

                <XAxis type="number" domain={[-maxAbs * 1.05, maxAbs * 1.05]}
                  stroke={C.muted} fontSize={9} tickLine={false}
                  axisLine={{ stroke: C.border }} tick={{ fontFamily: FONT }}
                  tickFormatter={(v) => formatNumber(v)}
                  label={{ value: "shares per $ move", position: "insideBottom",
                    offset: -4, fill: C.muted, fontSize: 9, fontFamily: FONT }} />

                <YAxis type="category" dataKey="strike" stroke={C.muted} fontSize={10}
                  tickLine={false} axisLine={{ stroke: C.border }}
                  tick={(props: any) => {
                    const { x, y, payload } = props;
                    const isSpot   = payload.value === spotStrike;
                    const isMaxPos = payload.value === maxPosStrike;
                    const isMaxNeg = payload.value === maxNegStrike;
                    const color    = isSpot ? C.yellow : isMaxPos ? C.greenMax : isMaxNeg ? C.redMax : C.text;
                    return (
                      <text x={x} y={y} dy={4} textAnchor="end"
                        fill={color} fontSize={isMaxPos || isMaxNeg ? 11 : 10}
                        fontWeight={isMaxPos || isMaxNeg || isSpot ? 700 : 400}
                        fontFamily={FONT}>
                        {payload.value}
                      </text>
                    );
                  }}
                  width={60} interval={0} />

                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={renderTooltip} />
                <ReferenceLine x={0} stroke={C.border} strokeWidth={1.5} />

                <ReferenceLine y={spotStrike} stroke={C.yellow} strokeDasharray="6 3" strokeWidth={1.5}
                  label={{ position: "right", value: `● SPOT  $${ticker.spot.toFixed(2)}`,
                    fill: C.yellow, fontSize: 9, fontFamily: FONT, fontWeight: 700 }} />

                {rows.some((r) => r.strike === majorWall) && (
                  <ReferenceLine y={majorWall} stroke={C.orange} strokeDasharray="10 4" strokeWidth={2}
                    label={{ position: "right", value: `▲ Major Wall  $${majorWall}`,
                      fill: C.orange, fontSize: 9, fontFamily: FONT, fontWeight: 700 }} />
                )}
                {rows.some((r) => r.strike === callWall) && callWall !== majorWall && (
                  <ReferenceLine y={callWall} stroke={C.green} strokeDasharray="8 4" strokeWidth={1.5}
                    label={{ position: "right", value: `▲ Call Wall  $${callWall}`,
                      fill: C.green, fontSize: 9, fontFamily: FONT, fontWeight: 700 }} />
                )}
                {rows.some((r) => r.strike === putWall) && (
                  <ReferenceLine y={putWall} stroke={C.red} strokeDasharray="8 4" strokeWidth={1.5}
                    label={{ position: "right", value: `▼ Put Wall  $${putWall}`,
                      fill: C.red, fontSize: 9, fontFamily: FONT, fontWeight: 700 }} />
                )}
                {rows.some((r) => r.strike === maxPain) && (
                  <ReferenceLine y={maxPain} stroke={C.purple} strokeDasharray="10 4" strokeWidth={1.5}
                    label={{ position: "right", value: `★ Max Pain  $${maxPain}`,
                      fill: C.purple, fontSize: 9, fontFamily: FONT, fontWeight: 700 }} />
                )}
                {volTrigger != null && rows.some((r) => r.strike === volTrigger) && (
                  <ReferenceLine y={volTrigger} stroke={C.cyan} strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ position: "right", value: `⚡ Vol Trigger  $${volTrigger}`,
                      fill: C.cyan, fontSize: 9, fontFamily: FONT, fontWeight: 700 }} />
                )}
                {deltaZeroStrike != null && rows.some((r) => r.strike === deltaZeroStrike) && (
                  <ReferenceLine y={deltaZeroStrike} stroke="rgba(255,255,255,0.7)" strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ position: "right", value: `◈ Delta Zero  $${deltaZeroStrike}`,
                      fill: "rgba(255,255,255,0.75)", fontSize: 9, fontFamily: FONT, fontWeight: 700 }} />
                )}

                <Bar dataKey="shares" barSize={BAR_H - 4} radius={[0, 3, 3, 0]}
                  onClick={(d: any) => setSelected(d?.strike ?? null)}
                  cursor="pointer" isAnimationActive={false}>
                  {rows.map((r, i) => {
                    const isMaxPos  = r.strike === maxPosStrike && r.shares > 0;
                    const isMaxNeg  = r.strike === maxNegStrike && r.shares < 0;
                    const isSel     = selected === r.strike;
                    const isHov     = hover === r.strike;
                    const intensity = Math.abs(r.shares) / maxAbs;
                    let fill: string, opacity: number, filterVal: string | undefined;
                    let strokeColor = "transparent", strokeW = 0;

                    if (isMaxPos) {
                      fill = C.greenMax; opacity = 1.0; strokeColor = "#00ff00"; strokeW = 1.5;
                      filterVal = "drop-shadow(0 0 6px #00ff00) drop-shadow(0 0 12px #00ff0066)";
                    } else if (isMaxNeg) {
                      fill = C.redMax; opacity = 1.0; strokeColor = "#ff0000"; strokeW = 1.5;
                      filterVal = "drop-shadow(0 0 6px #ff0000) drop-shadow(0 0 12px #ff000066)";
                    } else if (isSel) {
                      fill = r.shares >= 0 ? C.green : C.red; opacity = 1.0;
                      strokeColor = C.yellow; strokeW = 1.5;
                      filterVal = `drop-shadow(0 0 5px ${C.yellow})`;
                    } else {
                      fill = r.shares >= 0 ? C.green : C.red;
                      opacity = isHov ? 0.95 : 0.35 + intensity * 0.6;
                    }
                    return (
                      <Cell key={i} fill={fill} fillOpacity={opacity}
                        stroke={strokeColor} strokeWidth={strokeW}
                        style={filterVal ? { filter: filterVal } : undefined} />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ─── SIDEBAR ─── */}
        <div className="flex flex-col overflow-y-auto" style={{ background: C.panel }}>
          <div className="p-3 flex flex-col gap-2.5">
            <div>
              <div style={{ color: C.green, fontSize: 10, letterSpacing: "0.2em" }} className="font-bold uppercase">Strike Detail</div>
              <div style={{ color: C.muted, fontSize: 9 }}>Click a bar to inspect</div>
            </div>

            {!detail && (
              <div className="rounded p-4 text-center text-[11px]"
                style={{ background: "#000", border: `1px dashed ${C.border}`, color: C.muted }}>
                No strike selected
              </div>
            )}

            {detail && (
              <div className="rounded p-3 flex flex-col gap-2"
                style={{ background: "#000", border: `1px solid ${detail.r.shares >= 0 ? C.green : C.red}` }}>
                <div className="flex items-center justify-between">
                  <span style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>${detail.r.strike}</span>
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ color: detail.cls.color, background: `${detail.cls.color}15`, border: `1px solid ${detail.cls.color}40` }}>
                    {detail.cls.label}
                  </span>
                </div>
                <DetailRow label="Distance from Spot"
                  value={`${detail.distPct >= 0 ? "+" : ""}${detail.distPct.toFixed(2)}%`}
                  color={detail.distPct >= 0 ? C.green : C.red} />
                <Divider />
                <DetailRow label="Call OI" value={formatNumber(detail.r.callOI, 0)} color={C.green} />
                <DetailRow label="Put OI"  value={formatNumber(detail.r.putOI, 0)}  color={C.red} />
                <Divider />
                <DetailRow label="Total Gamma" value={formatNumber(detail.r.netGex)} color={detail.r.netGex >= 0 ? C.green : C.red} bold />
                <DetailRow label="Total Delta" value={formatNumber(detail.r.dex)}    color={detail.r.dex >= 0 ? C.cyan : C.red} bold />
                <DetailRow label="Call GEX" value={formatNumber(detail.r.callGex)} color={C.green} dim />
                <DetailRow label="Put GEX"  value={formatNumber(detail.r.putGex)}  color={C.red} dim />
                <button onClick={() => setSelected(null)}
                  className="mt-1 text-[9px] uppercase tracking-wider py-1 rounded"
                  style={{ color: C.muted, border: `1px solid ${C.border}` }}>
                  Clear selection
                </button>
              </div>
            )}

            <div className="mt-1">
              <div style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider mb-1.5">Top Gamma Nodes</div>
              {maxPosStrike != null && (
                <button onClick={() => setSelected(maxPosStrike!)}
                  className="w-full flex justify-between items-center px-2.5 py-1.5 rounded mb-1 text-[11px]"
                  style={{ background: "#001a00", border: `1px solid ${C.greenMax}60`, color: C.greenMax }}>
                  <span>★ Max Positive</span><span className="font-bold">${maxPosStrike}</span>
                </button>
              )}
              {maxNegStrike != null && (
                <button onClick={() => setSelected(maxNegStrike!)}
                  className="w-full flex justify-between items-center px-2.5 py-1.5 rounded mb-2 text-[11px]"
                  style={{ background: "#1a0000", border: `1px solid ${C.redMax}60`, color: C.redMax }}>
                  <span>★ Max Negative</span><span className="font-bold">${maxNegStrike}</span>
                </button>
              )}
            </div>

            <div>
              <div style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider mb-1.5">Key Levels</div>
              {[
                { label: "▲ Major Wall", strike: majorWall,       color: C.orange,                        bg: "#000" },
                { label: "▲ Call Wall",  strike: callWall,        color: C.green,                         bg: "#000" },
                { label: "▼ Put Wall",   strike: putWall,         color: C.red,                           bg: "#000" },
                { label: "★ Max Pain",   strike: maxPain,         color: C.purple,                        bg: "#000" },
                { label: "⚡ Vol Trigger", strike: volTrigger,    color: C.cyan,                          bg: "#000" },
                { label: "◈ Delta Zero", strike: deltaZeroStrike, color: "rgba(255,255,255,0.75)",         bg: "#000" },
              ].filter(l => l.strike != null).map(({ label, strike, color, bg }) => (
                <button key={label} onClick={() => setSelected(strike!)}
                  className="w-full flex justify-between items-center px-2.5 py-1.5 rounded mb-1 text-[11px]"
                  style={{ background: bg, border: `1px solid ${color}40`, color }}>
                  <span>{label}</span><span className="font-bold">${strike}</span>
                </button>
              ))}
              {gammaFlip != null && (
                <div className="flex justify-between items-center px-2.5 py-1.5 rounded text-[11px]"
                  style={{ background: "#000", border: `1px solid #ffffff18`, color: C.muted }}>
                  <span>⊘ Gamma Flip</span><span className="font-bold">${gammaFlip}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span style={{ color: "#444" }} className="uppercase tracking-wider">{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function DetailRow({ label, value, color, bold, dim }: { label: string; value: string; color: string; bold?: boolean; dim?: boolean }) {
  return (
    <div className="flex justify-between items-center text-[11px]">
      <span style={{ color: "#444", opacity: dim ? 0.7 : 1 }} className="uppercase tracking-wider text-[10px]">{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 500, opacity: dim ? 0.8 : 1 }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#1e1e1e" }} />;
}
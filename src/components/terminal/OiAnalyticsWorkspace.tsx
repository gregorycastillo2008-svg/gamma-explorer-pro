import { useMemo, useState, useRef, useEffect } from "react";
import type { DemoTicker, OptionContract } from "@/lib/gex";
import { bsGreeks, computeExposures, formatNumber } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

const PANEL_BG = "#0a0a0a";
const BORDER = "#1f1f1f";
const MUTED = "#6b7280";
const TEXT = "#9ca3af";
const TEXT_HI = "#e5e7eb";
const RED_NEON = "#ff3366";
const GREEN_NEON = "#00ff88";
const CYAN = "#06b6d4";
const YELLOW = "#fbbf24";
const FONT = "'Courier New', monospace";

// ─────────── OI HEATMAP — SVG bidireccional, verde/rojo, filtro por días ───────────
const DAY_FILTERS = ["ALL", "0D", "1D", "2D", "3D", "4D", "5D"] as const;
type DayFilter = typeof DAY_FILTERS[number];

// Calendar DTE → trading DTE (skips weekends so "1D" = next trading day)
function calToTradingDTE(calDTE: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  const d = new Date(today);
  for (let i = 0; i < calDTE; i++) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function OIHeatmapPanel({
  contracts,
  spot,
  height = 800,
}: {
  contracts: OptionContract[];
  spot: number;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 500 });
  const [mounted, setMounted] = useState(false);
  const [dayFilter, setDayFilter] = useState<DayFilter>("ALL");
  const [tip, setTip] = useState<{
    clientX: number; clientY: number;
    strike: number; callOI: number; putOI: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize({ w: el.clientWidth || 640, h: el.clientHeight || 500 });
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => { cancelAnimationFrame(raf); setMounted(false); };
  }, []);

  // Map each unique calendar DTE → trading DTE once per contracts change
  const tradingDTEMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of contracts) {
      if (!map.has(c.expiry)) map.set(c.expiry, calToTradingDTE(c.expiry));
    }
    return map;
  }, [contracts]);

  // días disponibles en los contratos (0–5 trading days)
  const availableDays = useMemo(() => {
    const s = new Set<number>();
    for (const tDTE of tradingDTEMap.values()) {
      if (tDTE >= 0 && tDTE <= 5) s.add(tDTE);
    }
    return s;
  }, [tradingDTEMap]);

  const filteredContracts = useMemo(() => {
    if (dayFilter === "ALL") return contracts;
    const day = parseInt(dayFilter);
    return contracts.filter(c => (tradingDTEMap.get(c.expiry) ?? -1) === day);
  }, [contracts, dayFilter, tradingDTEMap]);

  const exposures = useMemo(
    () => computeExposures(spot, filteredContracts),
    [spot, filteredContracts]
  );

  const chartData = useMemo(() => {
    const lo = spot * 0.88;
    const hi = spot * 1.12;
    return exposures
      .filter(d => d.strike >= lo && d.strike <= hi)
      .sort((a, b) => b.strike - a.strike)
      .map(d => ({ strike: d.strike, callOI: d.callOI, putOI: d.putOI }));
  }, [exposures, spot]);

  const maxOI = useMemo(
    () => Math.max(1, ...chartData.flatMap(d => [d.callOI, d.putOI])),
    [chartData]
  );

  const nearestStrike = useMemo(() => {
    if (!chartData.length) return spot;
    return chartData.reduce((best, d) =>
      Math.abs(d.strike - spot) < Math.abs(best - spot) ? d.strike : best
    , chartData[0].strike);
  }, [chartData, spot]);

  const { w } = size;
  const LABEL_W   = 54;
  const RIGHT_M   = 6;
  const TOP_PAD   = 16;
  const BOT_PAD   = 8;
  const MIN_ROW_H = 18;
  const CHART_W   = Math.max(1, w - LABEL_W - RIGHT_M);
  const n         = chartData.length;
  const ROW_H     = Math.max(MIN_ROW_H, n > 0 ? (height - TOP_PAD - BOT_PAD) / n : MIN_ROW_H);
  const svgH      = TOP_PAD + BOT_PAD + ROW_H * n;
  const CHART_H   = svgH - TOP_PAD - BOT_PAD;
  const CENTER_X  = LABEL_W + CHART_W / 2;
  const HALF_W    = CHART_W / 2;
  const BAR_H     = Math.max(2, ROW_H * 0.82);
  const rowY      = (i: number) => TOP_PAD + (i + 0.5) * ROW_H;
  const spotIdx   = chartData.findIndex(d => d.strike === nearestStrike);
  const spotY     = spotIdx >= 0 ? rowY(spotIdx) : TOP_PAD + CHART_H / 2;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const ri = Math.floor((my - TOP_PAD) / ROW_H);
    if (ri < 0 || ri >= chartData.length) { setTip(null); return; }
    const d = chartData[ri];
    if (!d.callOI && !d.putOI) { setTip(null); return; }
    setTip({ clientX: e.clientX, clientY: e.clientY, strike: d.strike, callOI: d.callOI, putOI: d.putOI });
  }

  return (
    <div style={{
      background: "#080810", border: "1px solid #0d0d1a", borderRadius: 4,
      display: "flex", flexDirection: "column", height, fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{ padding: "8px 10px 6px", flexShrink: 0, borderBottom: "1px solid #0d0d1a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ color: "#252535", fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 700 }}>
            OPEN INTEREST · HEATMAP
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#333", fontSize: 7, letterSpacing: "0.1em", marginRight: 2 }}>EXP</span>
            {DAY_FILTERS.map(f => {
              const day = f === "ALL" ? -1 : parseInt(f);
              const available = f === "ALL" || availableDays.has(day);
              const active = dayFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => available && setDayFilter(f)}
                  style={{
                    fontFamily: FONT,
                    fontSize: 8,
                    letterSpacing: "0.08em",
                    padding: "2px 6px",
                    borderRadius: 3,
                    border: `1px solid ${active ? "#a78bfa" : available ? "#3a2e5a" : "#111118"}`,
                    background: active ? "rgba(167,139,250,0.12)" : "transparent",
                    color: active ? "#a78bfa" : available ? "#6b5fa0" : "#202020",
                    cursor: available ? "pointer" : "default",
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 36, height: 4, borderRadius: 1, background: "linear-gradient(to right,#330066,#8800cc,#dd6600,#ffee00)" }} />
            <span style={{ fontSize: 7, color: "#555", letterSpacing: "0.06em" }}>CALL OI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 36, height: 4, borderRadius: 1, background: "linear-gradient(to right,#ffee00,#0099ff,#001155)" }} />
            <span style={{ fontSize: 7, color: "#444", letterSpacing: "0.06em" }}>PUT OI</span>
          </div>
          <span style={{
            marginLeft: "auto",
            background: "#100c00", border: "1px solid #fbbf2440",
            borderRadius: 2, color: "#fbbf24", fontSize: 7.5,
            padding: "1px 7px", letterSpacing: "0.1em", fontWeight: 700,
          }}>
            SPOT ${spot}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto", overflowX: "hidden", position: "relative" }}
      >
        <svg
          width={w} height={svgH}
          style={{ display: "block" }}
          shapeRendering="crispEdges"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTip(null)}
        >
          <defs>
            <style>{`
              @keyframes oiBarGrow {
                from { transform: scaleX(0); opacity: 0; }
                to   { transform: scaleX(1); opacity: 1; }
              }
            `}</style>
            {/* Call OI (derecha): raíz morada → naranja → amarillo caliente */}
            <linearGradient id="callOIGrad" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#330066" stopOpacity="0.9" />
              <stop offset="28%"  stopColor="#8800cc" stopOpacity="1.0" />
              <stop offset="58%"  stopColor="#dd6600" stopOpacity="1.0" />
              <stop offset="82%"  stopColor="#ffaa00" stopOpacity="1.0" />
              <stop offset="100%" stopColor="#ffee00" stopOpacity="1.0" />
            </linearGradient>
            {/* Put OI (izquierda): amarillo → cian → azul oscuro (invertido) */}
            <linearGradient id="putOIGrad" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#ffee00" stopOpacity="1.0" />
              <stop offset="18%"  stopColor="#ffaa00" stopOpacity="1.0" />
              <stop offset="42%"  stopColor="#0099ff" stopOpacity="1.0" />
              <stop offset="70%"  stopColor="#0044cc" stopOpacity="1.0" />
              <stop offset="100%" stopColor="#001155" stopOpacity="0.9" />
            </linearGradient>
            <filter id="oiHotGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Dividers de fila */}
          {chartData.map((_, i) => (
            <line key={i}
              x1={LABEL_W} y1={TOP_PAD + i * ROW_H}
              x2={w - RIGHT_M} y2={TOP_PAD + i * ROW_H}
              stroke="#0b0b18" strokeWidth={0.5}
            />
          ))}

          {/* Highlight fila hover */}
          {tip && (() => {
            const ri = chartData.findIndex(d => d.strike === tip.strike);
            if (ri < 0) return null;
            return <rect x={LABEL_W} y={TOP_PAD + ri * ROW_H} width={CHART_W} height={ROW_H} fill="rgba(255,255,255,0.04)" />;
          })()}

          {/* Línea central */}
          <line x1={CENTER_X} y1={TOP_PAD} x2={CENTER_X} y2={TOP_PAD + CHART_H} stroke="#181828" strokeWidth={1} />

          {/* Barras */}
          {chartData.map((d, i) => {
            const callNorm = d.callOI / maxOI;
            const putNorm  = d.putOI  / maxOI;
            const callW    = callNorm * HALF_W;
            const putW     = putNorm  * HALF_W;
            const bTop     = rowY(i) - BAR_H / 2;
            const isAtm    = d.strike === nearestStrike;
            const isHov    = tip?.strike === d.strike;
            const callHot  = callNorm > 0.55;
            const putHot   = putNorm  > 0.55;
            const delay    = mounted ? Math.min(i * 14, 400) : 0;

            return (
              <g key={d.strike}>
                {/* Call OI → derecha */}
                {callW > 0.5 && (
                  <g style={{
                    transformBox: "fill-box", transformOrigin: "left center",
                    animation: mounted ? `oiBarGrow 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both` : "none",
                  }}>
                    <rect
                      x={CENTER_X} y={bTop}
                      width={Math.max(callW, 0.5)} height={BAR_H}
                      fill="url(#callOIGrad)" rx={1.5}
                      filter={callHot || isAtm || isHov ? "url(#oiHotGlow)" : undefined}
                    />
                    {callHot && callW > 5 && (
                      <rect x={CENTER_X + callW - 4} y={bTop} width={4} height={BAR_H}
                        fill="#ffee00" fillOpacity={0.85} rx={1} filter="url(#oiHotGlow)" />
                    )}
                  </g>
                )}

                {/* Put OI → izquierda */}
                {putW > 0.5 && (
                  <g style={{
                    transformBox: "fill-box", transformOrigin: "right center",
                    animation: mounted ? `oiBarGrow 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both` : "none",
                  }}>
                    <rect
                      x={CENTER_X - putW} y={bTop}
                      width={Math.max(putW, 0.5)} height={BAR_H}
                      fill="url(#putOIGrad)" rx={1.5}
                      filter={putHot || isAtm || isHov ? "url(#oiHotGlow)" : undefined}
                    />
                    {putHot && putW > 5 && (
                      <rect x={CENTER_X - putW} y={bTop} width={4} height={BAR_H}
                        fill="#ffee00" fillOpacity={0.85} rx={1} filter="url(#oiHotGlow)" />
                    )}
                  </g>
                )}

                {/* Hover outline */}
                {isHov && (
                  <>
                    {callW > 0.5 && (
                      <rect x={CENTER_X} y={bTop} width={Math.max(callW, 0.5)} height={BAR_H}
                        fill="rgba(255,120,0,0.13)" stroke="#ff880099" strokeWidth={1} rx={1.5} />
                    )}
                    {putW > 0.5 && (
                      <rect x={CENTER_X - putW} y={bTop} width={Math.max(putW, 0.5)} height={BAR_H}
                        fill="rgba(120,220,255,0.13)" stroke="#80dfff99" strokeWidth={1} rx={1.5} />
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Strike labels */}
          {chartData.map((d, i) => {
            const isAtm   = d.strike === nearestStrike;
            const cellTop = TOP_PAD + i * ROW_H;
            return (
              <g key={d.strike}>
                <rect x={0} y={cellTop} width={LABEL_W} height={ROW_H} fill={isAtm ? "#071828" : "#030508"} />
                {isAtm && <rect x={0} y={cellTop} width={2} height={ROW_H} fill="#00c8ff" />}
                {isAtm && (
                  <text x={4} y={cellTop + ROW_H * 0.38} fill="#00aadd" fontSize={5} fontFamily={FONT} fontWeight={700} letterSpacing="0.07em">SPOT</text>
                )}
                <text
                  x={LABEL_W - 3} y={rowY(i) + (isAtm ? 4 : 3.5)}
                  textAnchor="end"
                  fill={isAtm ? "#00ccff" : "#1a3050"}
                  fontSize={isAtm ? 8.5 : 7.5}
                  fontFamily={FONT}
                  fontWeight={isAtm ? 700 : 400}
                >
                  ${d.strike}
                </text>
              </g>
            );
          })}

          {/* SPOT line */}
          {spotIdx >= 0 && (
            <line x1={LABEL_W} y1={spotY} x2={w - RIGHT_M} y2={spotY}
              stroke="#fbbf2440" strokeWidth={0.8} strokeDasharray="3 4" />
          )}

          {/* Headers */}
          <text x={LABEL_W + 6}               y={TOP_PAD - 3} fill="#1a1a2e" fontSize={7.5} fontFamily={FONT} fontWeight={700}>← PUT OI</text>
          <text x={CENTER_X + CHART_W * 0.08} y={TOP_PAD - 3} fill="#1a1a2e" fontSize={7.5} fontFamily={FONT} fontWeight={700}>CALL OI →</text>
        </svg>

        {/* Tooltip */}
        {tip && (() => {
          const cpRatio = tip.putOI > 0 ? tip.callOI / tip.putOI : Infinity;
          const TW  = 200;
          const vpW = window.innerWidth;
          const vpH = window.innerHeight;
          const left = tip.clientX + 18 + TW > vpW ? tip.clientX - TW - 10 : tip.clientX + 18;
          const top  = Math.max(8, Math.min(tip.clientY - 48, vpH - 200));
          return (
            <div style={{
              position: "fixed", left, top,
              background: "#04040c",
              border: "1px solid #fbbf2444",
              borderLeft: "3px solid #fbbf24",
              borderRadius: "0 4px 4px 0",
              padding: "9px 12px 9px 10px",
              pointerEvents: "none", zIndex: 9999,
              fontFamily: FONT, width: TW,
              boxShadow: "0 4px 32px #000a, 0 0 16px #fbbf2422",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <div style={{ color: "#555", fontSize: 7, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 1 }}>STRIKE</div>
                  <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>${tip.strike.toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 7, padding: "2px 6px", borderRadius: 2, background: "#fbbf2415", color: "#fbbf24", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, border: "1px solid #fbbf2433" }}>
                  {dayFilter}
                </div>
              </div>
              <div style={{ marginBottom: 5 }}>
                <div style={{ color: "#2a2a44", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>CALL OI</div>
                <div style={{ color: "#ff4400", fontSize: 13, fontWeight: 700 }}>{formatNumber(tip.callOI, 0)}</div>
              </div>
              <div style={{ marginBottom: 5 }}>
                <div style={{ color: "#2a2a44", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>PUT OI</div>
                <div style={{ color: "#00ccff", fontSize: 13, fontWeight: 700 }}>{formatNumber(tip.putOI, 0)}</div>
              </div>
              <div style={{ height: 1, background: "#0d0d20", margin: "0 0 5px" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 8, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase" }}>C/P RATIO</span>
                <span style={{ fontSize: 10, color: cpRatio > 1 ? GREEN_NEON : RED_NEON, fontWeight: 700 }}>
                  {cpRatio === Infinity ? "∞" : cpRatio.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export function OiAnalyticsWorkspace({ ticker, contracts }: Props) {
  // ── Aggregate per strike ──
  const perStrike = useMemo(() => {
    const m = new Map<number, { strike: number; callOI: number; putOI: number; callDelta: number; putDelta: number; ivVolNum: number; ivVolDen: number; volume: number }>();
    for (const c of contracts) {
      const T = Math.max(c.expiry, 1) / 365;
      const g = bsGreeks(ticker.spot, c.strike, T, 0.05, c.iv, c.type);
      const volume = c.oi;
      const cur = m.get(c.strike) ?? { strike: c.strike, callOI: 0, putOI: 0, callDelta: 0, putDelta: 0, ivVolNum: 0, ivVolDen: 0, volume: 0 };
      if (c.type === "call") {
        cur.callOI += c.oi;
        cur.callDelta += g.delta * c.oi;
      } else {
        cur.putOI += c.oi;
        cur.putDelta += Math.abs(g.delta) * c.oi;
      }
      cur.ivVolNum += c.iv * volume;
      cur.ivVolDen += volume;
      cur.volume += volume;
      m.set(c.strike, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.strike - a.strike);
  }, [contracts, ticker.spot]);

  const totals = useMemo(() => {
    const callOI = perStrike.reduce((s, p) => s + p.callOI, 0);
    const putOI = perStrike.reduce((s, p) => s + p.putOI, 0);
    const callDelta = perStrike.reduce((s, p) => s + p.callDelta, 0);
    const putDelta = perStrike.reduce((s, p) => s + p.putDelta, 0);
    const ivVolDen = perStrike.reduce((s, p) => s + p.ivVolDen, 0);
    const totalOI = callOI + putOI;
    const maxPut = perStrike.reduce((b, p) => (p.putOI > b.putOI ? p : b), perStrike[0]);
    const maxCall = perStrike.reduce((b, p) => (p.callOI > b.callOI ? p : b), perStrike[0]);
    const concentration = totalOI > 0 ? (Math.max(maxPut.putOI, maxCall.callOI) / totalOI) * 100 : 0;
    const diRatio = callDelta > 0 ? putDelta / callDelta : 0;
    const strikeNum = perStrike.reduce((s, p) => s + p.strike * p.volume, 0);
    const ivWeightedStrike = ivVolDen > 0 ? strikeNum / ivVolDen : 0;
    const sortedByVol = [...perStrike].sort((a, b) => b.volume - a.volume);
    let cum = 0; const halfVol = ivVolDen * 0.5;
    const band: number[] = [];
    for (const p of sortedByVol) {
      cum += p.volume;
      band.push(p.strike);
      if (cum >= halfVol) break;
    }
    const bandLo = Math.min(...band);
    const bandHi = Math.max(...band);
    return { callOI, putOI, totalOI, maxPut, maxCall, concentration, diRatio, ivWeightedStrike, bandLo, bandHi };
  }, [perStrike]);

  return (
    <div className="h-full w-full overflow-y-auto bg-black p-6 font-mono">
      {/* ── 3 metric cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="DI RATIO"
          value={totals.diRatio.toFixed(2)}
          sublabel="STRIKE WITH MAX PUT OI"
          subvalue={`$${totals.maxPut?.strike ?? "—"}`}
          subColor={GREEN_NEON}
        />
        <MetricCard
          label="CALL PUT CONCENTRATION"
          value={`${totals.concentration.toFixed(0)}%`}
          valueColor={RED_NEON}
          sublabel="STRIKE WITH MAX CALL OI"
          subvalue={`$${totals.maxCall?.strike ?? "—"}`}
          subColor={GREEN_NEON}
        />
        <MetricCard
          label="IV WEIGHTED BY VOLUME"
          value={`$${totals.ivWeightedStrike.toFixed(2)}`}
          valueColor={CYAN}
          sublabel="MAX VOLUME CONCENTRATION"
          subvalue={`$${totals.bandLo} – $${totals.bandHi}`}
          subColor={YELLOW}
        />
      </div>

      {/* ── 2 main panels ── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <OIHeatmapPanel contracts={contracts} spot={ticker.spot} height={800} />
        <OIMatrixPanel rows={perStrike} spot={ticker.spot} />
      </div>
    </div>
  );
}

function MetricCard({
  label, value, valueColor = TEXT_HI, sublabel, subvalue, subColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sublabel: string;
  subvalue: string;
  subColor: string;
}) {
  return (
    <div
      className="rounded-lg p-5"
      style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: MUTED }}>{label}</div>
      <div className="text-[32px] font-bold tabular-nums mt-1" style={{ color: valueColor }}>{value}</div>
      <div className="text-[9px] uppercase tracking-[0.2em] mt-3" style={{ color: MUTED }}>{sublabel}</div>
      <div className="text-base font-bold tabular-nums mt-1" style={{ color: subColor }}>{subvalue}</div>
    </div>
  );
}

// ─────────── OPEN INTEREST MATRIX (QuikStrike-style) ───────────
const CALL_TIP = "rgba(255,185,35,";
const CALL_BASE = "rgba(155,45,0,";
const PUT_TIP = "rgba(85,200,255,";
const PUT_BASE = "rgba(0,50,150,";

function callBarBg(oi: number, max: number): string {
  if (!oi) return "transparent";
  const t = Math.min(1, oi / max);
  const p = (t * 100).toFixed(1);
  const ta = (0.25 + t * 0.55).toFixed(3);
  const ba = (0.06 + t * 0.28).toFixed(3);
  return `linear-gradient(to left,${CALL_TIP}${ta}) 0%,${CALL_BASE}${ba}) ${p}%,transparent ${p}%)`;
}

function putBarBg(oi: number, max: number): string {
  if (!oi) return "transparent";
  const t = Math.min(1, oi / max);
  const p = (t * 100).toFixed(1);
  const ta = (0.25 + t * 0.55).toFixed(3);
  const ba = (0.06 + t * 0.28).toFixed(3);
  return `linear-gradient(to right,${PUT_TIP}${ta}) 0%,${PUT_BASE}${ba}) ${p}%,transparent ${p}%)`;
}

function ratioColor(ratio: number): string {
  if (!isFinite(ratio)) return "#ffb830";
  if (ratio > 2.0) return "#ffb830";
  if (ratio > 1.2) return "#d07828";
  if (ratio > 0.83) return "#9ca3af";
  if (ratio > 0.5) return "#3898d8";
  return "#58d0f4";
}

function OIMatrixPanel({
  rows,
  spot,
}: {
  rows: { strike: number; callOI: number; putOI: number }[];
  spot: number;
}) {
  const data = useMemo(
    () => [...rows].sort((a, b) => b.strike - a.strike),
    [rows]
  );

  const maxCallOI = useMemo(() => Math.max(1, ...data.map((r) => r.callOI)), [data]);
  const maxPutOI  = useMemo(() => Math.max(1, ...data.map((r) => r.putOI)),  [data]);

  const atmStrike = useMemo(() => {
    if (!data.length) return null;
    return data.reduce((best, r) =>
      Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best
    ).strike;
  }, [data, spot]);

  const [hoverStrike, setHoverStrike] = useState<number | null>(null);

  const totalCall  = data.reduce((s, r) => s + r.callOI, 0);
  const totalPut   = data.reduce((s, r) => s + r.putOI,  0);
  const totalRatio = totalPut > 0 ? totalCall / totalPut : totalCall > 0 ? Infinity : 0;

  return (
    <div
      className="rounded-lg flex flex-col overflow-hidden"
      style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, height: 800 }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: BORDER }}
      >
        <span
          className="text-[11px] uppercase tracking-widest font-semibold"
          style={{ color: TEXT }}
        >
          Open Interest Matrix
        </span>
        <div className="flex items-center gap-3 font-mono text-[9px]">
          <span style={{ color: "#e09030" }}>▪ CALL&nbsp;{formatNumber(totalCall, 0)}</span>
          <span style={{ color: "#3090cc" }}>▪ PUT&nbsp;{formatNumber(totalPut, 0)}</span>
          <span style={{ color: "#444" }}>|</span>
          <span style={{ color: CYAN }}>ATM&nbsp;${atmStrike ?? "—"}</span>
          <span style={{ color: MUTED }}>
            C/P&nbsp;{totalRatio === Infinity ? "∞" : totalRatio.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="flex items-stretch"
        style={{ background: "#0d0d0d", borderBottom: `1px solid ${BORDER}` }}
      >
        <div
          className="flex-1 py-1.5 px-3 flex items-center justify-end gap-1.5"
        >
          <span style={{ color: MUTED, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Open Interest
          </span>
          <span style={{ color: "#ffa820", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            CALL
          </span>
        </div>
        <div
          className="py-1.5 px-2 flex items-center justify-center"
          style={{
            width: 86, flexShrink: 0,
            borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
            color: TEXT_HI, fontSize: 9, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.14em",
          }}
        >
          STRIKE
        </div>
        <div
          className="flex-1 py-1.5 px-3 flex items-center gap-1.5"
        >
          <span style={{ color: "#48b8e8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            PUT
          </span>
          <span style={{ color: MUTED, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Open Interest
          </span>
        </div>
        <div
          className="py-1.5 px-2 flex items-center justify-center"
          style={{
            width: 68, flexShrink: 0,
            borderLeft: `1px solid ${BORDER}`,
            color: MUTED, fontSize: 9,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}
        >
          C/P
        </div>
      </div>

      {/* Data rows */}
      <div className="flex-1 overflow-y-auto" style={{ fontFamily: FONT }}>
        {data.map((r) => {
          const isAtm   = r.strike === atmStrike;
          const isHover = hoverStrike === r.strike;
          const ratio   = r.putOI > 0 ? r.callOI / r.putOI : r.callOI > 0 ? Infinity : 0;
          const callWins = r.callOI > r.putOI;
          const putWins  = r.putOI  > r.callOI;

          return (
            <div
              key={r.strike}
              onMouseEnter={() => setHoverStrike(r.strike)}
              onMouseLeave={() => setHoverStrike(null)}
              className="flex items-stretch"
              style={{
                minHeight: 26,
                borderBottom: `1px solid ${isAtm ? "rgba(6,182,212,0.30)" : BORDER}`,
                borderLeft: isAtm
                  ? "2px solid rgba(6,182,212,0.65)"
                  : "2px solid transparent",
                background: isHover
                  ? "rgba(255,255,255,0.022)"
                  : isAtm
                  ? "rgba(6,182,212,0.038)"
                  : "transparent",
                transition: "background 100ms",
              }}
            >
              {/* Call OI */}
              <div
                className="flex-1 px-3 flex items-center justify-end tabular-nums"
                style={{
                  background: callBarBg(r.callOI, maxCallOI),
                  color: r.callOI > 0 ? (callWins ? "#ffc040" : TEXT_HI) : MUTED,
                  fontSize: 11, fontWeight: r.callOI > 0 ? 600 : 400,
                  transition: "background 100ms",
                }}
              >
                {r.callOI > 0 ? formatNumber(r.callOI, 0) : "—"}
              </div>

              {/* Strike */}
              <div
                className="flex items-center justify-center px-2 tabular-nums gap-1"
                style={{
                  width: 86, flexShrink: 0,
                  borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
                  color: isAtm ? CYAN : TEXT_HI,
                  fontSize: isAtm ? 12 : 11,
                  fontWeight: isAtm ? 800 : 600,
                  letterSpacing: "0.01em",
                }}
              >
                {isAtm && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 5, height: 5,
                      borderRadius: "50%",
                      background: CYAN,
                      boxShadow: "0 0 7px rgba(6,182,212,0.9)",
                      flexShrink: 0,
                    }}
                  />
                )}
                {r.strike}
              </div>

              {/* Put OI */}
              <div
                className="flex-1 px-3 flex items-center tabular-nums"
                style={{
                  background: putBarBg(r.putOI, maxPutOI),
                  color: r.putOI > 0 ? (putWins ? "#68d8ff" : TEXT_HI) : MUTED,
                  fontSize: 11, fontWeight: r.putOI > 0 ? 600 : 400,
                  transition: "background 100ms",
                }}
              >
                {r.putOI > 0 ? formatNumber(r.putOI, 0) : "—"}
              </div>

              {/* C/P Ratio */}
              <div
                className="flex items-center justify-center px-2 tabular-nums"
                style={{
                  width: 68, flexShrink: 0,
                  borderLeft: `1px solid ${BORDER}`,
                  color: ratioColor(ratio),
                  fontSize: 10, fontWeight: 600,
                }}
              >
                {ratio === Infinity ? "∞" : ratio === 0 ? "—" : ratio.toFixed(2)}
              </div>
            </div>
          );
        })}

        {/* Totals footer */}
        {data.length > 0 && (
          <div
            className="flex items-stretch sticky bottom-0"
            style={{
              minHeight: 28,
              background: "#111",
              borderTop: `1px solid rgba(255,255,255,0.10)`,
            }}
          >
            <div
              className="flex-1 px-3 flex items-center justify-end tabular-nums"
              style={{ color: "#ffaa28", fontSize: 11, fontWeight: 700 }}
            >
              {formatNumber(totalCall, 0)}
            </div>
            <div
              className="flex items-center justify-center px-2"
              style={{
                width: 86, flexShrink: 0,
                borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
                color: MUTED, fontSize: 8,
                textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
              }}
            >
              TOTAL
            </div>
            <div
              className="flex-1 px-3 flex items-center tabular-nums"
              style={{ color: "#48c8f0", fontSize: 11, fontWeight: 700 }}
            >
              {formatNumber(totalPut, 0)}
            </div>
            <div
              className="flex items-center justify-center px-2 tabular-nums"
              style={{
                width: 68, flexShrink: 0,
                borderLeft: `1px solid ${BORDER}`,
                color: ratioColor(totalRatio),
                fontSize: 10, fontWeight: 700,
              }}
            >
              {totalRatio === Infinity ? "∞" : totalRatio === 0 ? "—" : totalRatio.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

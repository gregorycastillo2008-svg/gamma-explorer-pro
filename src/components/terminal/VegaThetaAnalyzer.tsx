import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoTicker, OptionContract } from "@/lib/gex";
import { bsGreeks } from "@/lib/gex";

interface Props { ticker: DemoTicker; contracts: OptionContract[] }

const MONO = '"JetBrains Mono", ui-monospace, "Courier New", monospace';
const BG   = "#040610";
const R    = 0.05;

function fmt(n: number, decimals = 1): string {
  const a = Math.abs(n), s = n < 0 ? "-" : "+";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(decimals)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(decimals)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(decimals)}K`;
  return `${s}${a.toFixed(0)}`;
}
const fmtAbs = (n: number) => fmt(Math.abs(n)).replace(/^[+-]/, "");

// ── Mini stat card ────────────────────────────────────────────────
function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#050814", border: `1px solid ${color}22`,
      borderRadius: 3, padding: "4px 8px", flex: 1,
      fontFamily: MONO,
    }}>
      <div style={{ fontSize: 6.5, color: "#1e2840", letterSpacing: "0.12em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

// ── Reusable Greek Map (bidirectional bar chart with numbers) ─────
interface MapRow { strike: number; leftVal: number; rightVal: number }
interface MapCfg {
  id: string;
  title: string;
  leftLabel:  string; rightLabel:  string;
  leftTip:    string; rightTip:    string;
  leftGrad:   [string, string, string];
  rightGrad:  [string, string, string];
}

function GreekMap({ cfg, rows, spot }: { cfg: MapCfg; rows: MapRow[]; spot: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const [w, setW]    = useState(280);
  const [tipState, setTipState] = useState<{ cx: number; cy: number; row: MapRow } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setW(el.clientWidth || 280);
    const ro = new ResizeObserver(([e]) => {
      if (e) setW(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll to ATM row
  useEffect(() => {
    if (!scrollRef.current || !rows.length) return;
    const minD = Math.min(...rows.map(r => Math.abs(r.strike - spot)));
    const idx  = rows.findIndex(r => Math.abs(r.strike - spot) === minD);
    if (idx < 0) return;
    const ROW_H = 22;
    const viewH = scrollRef.current.clientHeight;
    scrollRef.current.scrollTo({
      top: Math.max(0, idx * ROW_H - viewH / 2 + ROW_H / 2),
      behavior: "instant",
    });
  }, [rows, spot]);

  const ROW_H    = 22;
  const BAR_H    = 11;
  const STRIKE_W = 52;
  // Reserve space for numbers on each outer edge
  const NUM_W    = 40;
  const CHART_W  = Math.max(1, w - STRIKE_W);
  const HALF_W   = Math.max(1, (CHART_W - 2 * NUM_W) / 2);
  const CENTER_X = STRIKE_W + NUM_W + HALF_W;
  const svgH     = rows.length * ROW_H;
  const maxVal   = Math.max(1, ...rows.flatMap(r => [r.leftVal, r.rightVal]));

  const minD  = rows.length ? Math.min(...rows.map(r => Math.abs(r.strike - spot))) : 0;
  const spotK = rows.find(r => Math.abs(r.strike - spot) === minD)?.strike ?? spot;

  const gL = `g${cfg.id}L`, gR = `g${cfg.id}R`;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "#040810", border: "1px solid #0d1020",
      borderRadius: 4, overflow: "hidden", fontFamily: MONO, position: "relative",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 8px", borderBottom: "1px solid #0a0d1a",
        background: "#000", flexShrink: 0,
      }}>
        <span style={{ fontSize: 8, letterSpacing: "0.2em", color: "#3a4870", fontWeight: 700 }}>
          {cfg.title}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ width: 7, height: 7, borderRadius: 1, background: cfg.leftTip, display: "inline-block" }} />
        <span style={{ fontSize: 7, color: "#2e3e58", letterSpacing: "0.06em" }}>{cfg.leftLabel}</span>
        <span style={{ width: 7, height: 7, borderRadius: 1, background: cfg.rightTip, display: "inline-block" }} />
        <span style={{ fontSize: 7, color: "#2e3e58", letterSpacing: "0.06em" }}>{cfg.rightLabel}</span>
      </div>

      {/* Column sub-header */}
      <div style={{
        display: "flex", background: "#000",
        borderBottom: "1px solid #080b14", flexShrink: 0,
      }}>
        <div style={{
          width: STRIKE_W, fontSize: 6.5, color: "#1a2030", textAlign: "center",
          padding: "2px 0", letterSpacing: "0.1em", borderRight: "1px solid #0f0f0f",
        }}>STRIKE</div>
        <div style={{ flex: 1, display: "flex" }}>
          <div style={{ flex: 1, textAlign: "center", fontSize: 7, padding: "2px 0",
            color: cfg.leftTip + "66", letterSpacing: "0.06em" }}>← {cfg.leftLabel}</div>
          <div style={{ flex: 1, textAlign: "center", fontSize: 7, padding: "2px 0",
            color: cfg.rightTip + "66", letterSpacing: "0.06em" }}>{cfg.rightLabel} →</div>
        </div>
      </div>

      {/* SVG scroll */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div ref={containerRef}>
          <svg
            width={w} height={svgH}
            style={{ display: "block", fontFamily: MONO }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ri = Math.floor((e.clientY - rect.top) / ROW_H);
              if (ri >= 0 && ri < rows.length)
                setTipState({ cx: e.clientX, cy: e.clientY, row: rows[ri] });
              else setTipState(null);
            }}
            onMouseLeave={() => setTipState(null)}
          >
            <defs>
              <linearGradient id={gL} x1="1" y1="0" x2="0" y2="0" gradientUnits="objectBoundingBox">
                <stop offset="0%"   stopColor={cfg.leftGrad[0]} stopOpacity="0.85" />
                <stop offset="50%"  stopColor={cfg.leftGrad[1]} stopOpacity="1.0" />
                <stop offset="100%" stopColor={cfg.leftGrad[2]} stopOpacity="1.0" />
              </linearGradient>
              <linearGradient id={gR} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                <stop offset="0%"   stopColor={cfg.rightGrad[0]} stopOpacity="0.85" />
                <stop offset="50%"  stopColor={cfg.rightGrad[1]} stopOpacity="1.0" />
                <stop offset="100%" stopColor={cfg.rightGrad[2]} stopOpacity="1.0" />
              </linearGradient>
            </defs>

            {rows.map((row, i) => {
              const y      = i * ROW_H;
              const cy     = y + ROW_H / 2;
              const isSpot = row.strike === spotK;
              const lw     = Math.max(0, (row.leftVal  / maxVal) * HALF_W * 0.96);
              const rw     = Math.max(0, (row.rightVal / maxVal) * HALF_W * 0.96);
              return (
                <g key={row.strike}>
                  {/* Row background */}
                  <rect x={0} y={y} width={w} height={ROW_H}
                    fill={isSpot ? "#facc1510" : "transparent"} />

                  {/* Strike cell */}
                  <rect x={0} y={y} width={STRIKE_W} height={ROW_H}
                    fill={isSpot ? "#1a1200" : "#030508"} />
                  <line x1={STRIKE_W} y1={y} x2={STRIKE_W} y2={y + ROW_H}
                    stroke="#0f0f0f" strokeWidth={1} />
                  <line x1={0} y1={y + ROW_H} x2={w} y2={y + ROW_H}
                    stroke="#08090f" strokeWidth={0.5} />

                  <text x={STRIKE_W - 5} y={cy + 3.5} textAnchor="end" fontSize={9}
                    fill={isSpot ? "#facc15" : "#2a3a50"}
                    fontWeight={isSpot ? "700" : "400"}>
                    ${row.strike}
                  </text>

                  {/* Center divider */}
                  <line x1={CENTER_X} y1={y} x2={CENTER_X} y2={y + ROW_H}
                    stroke="#0c0e1a" strokeWidth={1} />

                  {/* Left bar */}
                  {lw > 0.5 && (
                    <rect x={CENTER_X - lw} y={cy - BAR_H / 2} width={lw} height={BAR_H}
                      fill={`url(#${gL})`} rx={1.5} />
                  )}
                  {/* Right bar */}
                  {rw > 0.5 && (
                    <rect x={CENTER_X} y={cy - BAR_H / 2} width={rw} height={BAR_H}
                      fill={`url(#${gR})`} rx={1.5} />
                  )}

                  {/* ── Numeric value labels ──────────────────────── */}
                  {row.leftVal > 0 && (
                    <text
                      x={STRIKE_W + NUM_W - 3}
                      y={cy + 3.5}
                      textAnchor="end"
                      fontSize={7}
                      fill={cfg.leftTip + "cc"}
                    >
                      {fmtAbs(row.leftVal)}
                    </text>
                  )}
                  {row.rightVal > 0 && (
                    <text
                      x={CENTER_X + HALF_W + 3}
                      y={cy + 3.5}
                      textAnchor="start"
                      fontSize={7}
                      fill={cfg.rightTip + "cc"}
                    >
                      {fmtAbs(row.rightVal)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Tooltip */}
      {tipState && (
        <div style={{
          position: "fixed", left: tipState.cx + 14, top: tipState.cy - 10,
          background: "#06090f", border: "1px solid #1a2030", borderRadius: 4,
          padding: "6px 10px", fontSize: 9, fontFamily: MONO, zIndex: 9999,
          pointerEvents: "none", boxShadow: "0 4px 16px #000a",
        }}>
          <div style={{ fontWeight: 700, color: "#b0b8cc", marginBottom: 4, fontSize: 10 }}>
            ${tipState.row.strike}
          </div>
          <div style={{ color: cfg.leftTip, marginBottom: 2 }}>
            {cfg.leftLabel}: {fmtAbs(tipState.row.leftVal)}
          </div>
          <div style={{ color: cfg.rightTip }}>
            {cfg.rightLabel}: {fmtAbs(tipState.row.rightVal)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Map configs ───────────────────────────────────────────────────
const VEGA_CFG: MapCfg = {
  id: "vega", title: "VEGA MAP",
  leftLabel: "PUT VEX",  rightLabel: "CALL VEX",
  leftTip:   "#ffaa00",  rightTip:   "#aa44ff",
  leftGrad:  ["#331800", "#bb6600", "#ffaa00"],
  rightGrad: ["#1a0044", "#6600cc", "#aa44ff"],
};
const GAMMA_CFG: MapCfg = {
  id: "gamma", title: "GAMMA MAP",
  leftLabel: "PUT GEX",  rightLabel: "CALL GEX",
  leftTip:   "#ff2233",  rightTip:   "#00ff44",
  leftGrad:  ["#1a0003", "#880011", "#ff2233"],
  rightGrad: ["#001400", "#008822", "#00ff44"],
};
const DELTA_CFG: MapCfg = {
  id: "delta", title: "DELTA MAP",
  leftLabel: "NEG DEX",  rightLabel: "POS DEX",
  leftTip:   "#ff2288",  rightTip:   "#22aaff",
  leftGrad:  ["#200010", "#880044", "#ff2288"],
  rightGrad: ["#001422", "#0055aa", "#22aaff"],
};

// ── Main component ────────────────────────────────────────────────
export function VegaThetaAnalyzer({ ticker, contracts }: Props) {
  const spot = ticker.spot;

  const expiries = useMemo(() => {
    const s = new Set<number>();
    contracts.forEach(c => s.add(c.expiry));
    return Array.from(s).sort((a, b) => a - b);
  }, [contracts]);

  const [selectedExpiry, setSelectedExpiry] = useState<number | "ALL">("ALL");
  useEffect(() => {
    if (selectedExpiry !== "ALL" && !expiries.includes(selectedExpiry as number) && expiries.length)
      setSelectedExpiry("ALL");
  }, [expiries, selectedExpiry]);

  const fc = useMemo(
    () => selectedExpiry === "ALL"
      ? contracts
      : contracts.filter(c => c.expiry === (selectedExpiry as number)),
    [contracts, selectedExpiry]
  );

  const atmIV = useMemo(() => {
    const step = ticker.strikeStep;
    const atm  = fc.filter(c => Math.abs(c.strike - spot) <= step * 1.5);
    const avg  = atm.reduce((s, c) => s + c.iv, 0) / Math.max(1, atm.length);
    return avg > 0 ? avg : 0.22;
  }, [fc, spot, ticker.strikeStep]);

  const { totalVega, totalTheta, callOI, putOI } = useMemo(() => {
    let tv = 0, tt = 0, ci = 0, pi = 0;
    fc.forEach(c => {
      const T     = Math.max(c.expiry, 1) / 365;
      const sigma = c.iv > 0 ? c.iv : atmIV;
      const bs    = bsGreeks(spot, c.strike, T, R, sigma, c.type);
      const v     = (c.vega  != null && c.vega  !== 0) ? c.vega  : bs.vega;
      const th    = (c.theta != null && c.theta !== 0) ? c.theta : bs.theta;
      const n     = c.oi * 100;
      tv += v  * n;
      tt += th * n;
      if (c.type === "call") ci += c.oi; else pi += c.oi;
    });
    return { totalVega: tv, totalTheta: tt, callOI: ci, putOI: pi };
  }, [fc, spot, atmIV]);

  const { vegaRows, gammaRows, deltaRows } = useMemo(() => {
    interface Acc {
      strike: number;
      callVex: number; putVex: number;
      callGex: number; putGex: number;
      posDex:  number; negDex:  number;
    }
    const map = new Map<number, Acc>();
    fc.forEach(c => {
      if (c.oi <= 0) return;
      if (c.strike < spot * 0.88 || c.strike > spot * 1.12) return;
      const T     = Math.max(c.expiry, 0.5) / 365;
      const sigma = Math.max(c.iv ?? 0.01, 0.01);
      const bs    = bsGreeks(spot, c.strike, T, R, sigma, c.type);
      const gamma = (c.gamma != null && c.gamma !== 0) ? c.gamma : bs.gamma;
      const delta = (c.delta != null && c.delta !== 0) ? c.delta : bs.delta;
      const vegaV = (c.vega  != null && c.vega  !== 0) ? c.vega  : bs.vega;
      const n     = c.oi * 100;
      const gex   = Math.abs(gamma * n * spot * spot * 0.01);
      const dex   = delta * n * spot;
      const p = map.get(c.strike) ?? {
        strike: c.strike,
        callVex: 0, putVex: 0, callGex: 0, putGex: 0, posDex: 0, negDex: 0,
      };
      if (c.type === "call") { p.callVex += Math.abs(vegaV * n); p.callGex += gex; }
      else                   { p.putVex  += Math.abs(vegaV * n); p.putGex  += gex; }
      if (dex >= 0) p.posDex += dex; else p.negDex += Math.abs(dex);
      map.set(c.strike, p);
    });
    const sorted = Array.from(map.values()).sort((a, b) => b.strike - a.strike);
    return {
      vegaRows:  sorted.map(d => ({ strike: d.strike, leftVal: d.putVex,  rightVal: d.callVex })),
      gammaRows: sorted.map(d => ({ strike: d.strike, leftVal: d.putGex,  rightVal: d.callGex })),
      deltaRows: sorted.map(d => ({ strike: d.strike, leftVal: d.negDex,  rightVal: d.posDex  })),
    };
  }, [fc, spot]);

  const [ivChange, setIvChange] = useState(0);
  const [daysFwd,  setDaysFwd]  = useState(0);
  const vegaPnL  = totalVega  * ivChange / 100;
  const thetaPnL = totalTheta * daysFwd;
  const netPnL   = vegaPnL + thetaPnL;
  const pcr      = putOI / Math.max(1, callOI);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", background: BG,
      fontFamily: MONO, overflow: "hidden",
    }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 10px", borderBottom: "1px solid #0d1020",
        background: "#000", flexShrink: 0,
      }}>
        <span style={{ fontSize: 8, letterSpacing: "0.2em", color: "#8844ff", fontWeight: 700 }}>
          Θν ANALYZER
        </span>
        <span style={{ fontSize: 8, color: "#1e2840" }}>·</span>
        <span style={{ fontSize: 8, color: "#1e2840" }}>{ticker.symbol}</span>
        <span style={{ fontSize: 8, color: "#facc15" }}>${spot.toFixed(2)}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 7, color: "#1e2840", letterSpacing: "0.08em" }}>EXP</span>
        <select
          value={String(selectedExpiry)}
          onChange={e => setSelectedExpiry(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
          style={{
            background: "#0a0d18", border: "1px solid #1a2030", borderRadius: 3,
            color: "#4a6080", fontSize: 8, padding: "2px 6px", fontFamily: MONO,
            letterSpacing: "0.06em",
          }}
        >
          <option value="ALL">ALL</option>
          {expiries.map(d => (
            <option key={d} value={d} style={{ background: "#0a0d18" }}>{d}D</option>
          ))}
        </select>
      </div>

      {/* ── Unified analyzer body ────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Scenario + mini cards */}
        <div style={{
          flexShrink: 0,
          display: "grid", gridTemplateColumns: "1fr auto",
          gap: 6, padding: "6px 8px 4px",
          background: "#020408",
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8, padding: "8px 10px",
            background: "#050814", border: "1px solid #0d1020", borderRadius: 4,
            alignItems: "center",
          }}>
            {/* IV Change */}
            <div>
              <div style={{ fontSize: 7.5, color: "#8844ff", letterSpacing: "0.12em", marginBottom: 4 }}>
                IV CHANGE &nbsp;
                <span style={{ color: ivChange >= 0 ? "#aa44ff" : "#ff2288", fontWeight: 700 }}>
                  {ivChange >= 0 ? "+" : ""}{ivChange}%
                </span>
              </div>
              <input
                type="range" min={-50} max={50} step={1} value={ivChange}
                onChange={e => setIvChange(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#8844ff" }}
              />
              <div style={{ fontSize: 7.5, color: "#2a3850", marginTop: 3 }}>
                Vega P&L:&nbsp;
                <span style={{ color: vegaPnL >= 0 ? "#00ff44" : "#ff2233", fontWeight: 700 }}>
                  {fmt(vegaPnL)}
                </span>
              </div>
            </div>

            {/* Days Forward */}
            <div>
              <div style={{ fontSize: 7.5, color: "#ff4466", letterSpacing: "0.12em", marginBottom: 4 }}>
                DAYS FORWARD&nbsp;
                <span style={{ color: "#ff4466", fontWeight: 700 }}>+{daysFwd}D</span>
              </div>
              <input
                type="range" min={0} max={30} step={1} value={daysFwd}
                onChange={e => setDaysFwd(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#ff4466" }}
              />
              <div style={{ fontSize: 7.5, color: "#2a3850", marginTop: 3 }}>
                Theta P&L:&nbsp;
                <span style={{ color: "#ff4466", fontWeight: 700 }}>{fmt(thetaPnL)}</span>
              </div>
            </div>

            {/* Net P&L */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 2,
              background: "#040610", border: `1px solid ${netPnL >= 0 ? "#00ff4430" : "#ff223330"}`,
              borderRadius: 4, padding: "8px 12px",
            }}>
              <div style={{ fontSize: 7, color: "#2a3850", letterSpacing: "0.15em" }}>NET P&L</div>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1,
                color: netPnL >= 0 ? "#00ff44" : "#ff2233" }}>{fmt(netPnL)}</div>
              <div style={{ fontSize: 7, color: "#2a3850", marginTop: 2 }}>ν+θ estimate</div>
            </div>
          </div>

          {/* Mini metric cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 110 }}>
            <MiniStat label="TOTAL VEX" value={fmt(totalVega)}             color="#8844ff" />
            <MiniStat label="DAILY θ"   value={fmt(totalTheta)}            color="#ff4466" />
            <MiniStat label="P/C RATIO" value={pcr.toFixed(2)}             color={pcr > 1 ? "#ff4466" : "#00ff44"} />
            <MiniStat label="ATM IV"    value={`${(atmIV * 100).toFixed(1)}%`} color="#ffaa00" />
          </div>
        </div>

        {/* Section label */}
        <div style={{
          flexShrink: 0, padding: "3px 10px",
          background: "#020408",
          borderTop: "1px solid #080b14",
        }}>
          <span style={{ fontSize: 7, color: "#2a3550", letterSpacing: "0.2em" }}>
            GREEK MAPS — STRIKE ANALYSIS
          </span>
        </div>

        {/* ── Three Greek Maps ───────────────────────────────────── */}
        <div style={{
          flex: 1, minHeight: 0,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6, padding: "4px 8px 8px",
          background: "#020408",
        }}>
          <GreekMap cfg={VEGA_CFG}  rows={vegaRows}  spot={spot} />
          <GreekMap cfg={GAMMA_CFG} rows={gammaRows} spot={spot} />
          <GreekMap cfg={DELTA_CFG} rows={deltaRows} spot={spot} />
        </div>

      </div>
    </div>
  );
}

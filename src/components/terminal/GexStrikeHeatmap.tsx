import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { bsGreeks, type OptionContract, type DemoTicker } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

type Metric = "gex" | "dex";

const MONO = '"JetBrains Mono", ui-monospace, "Courier New", monospace';
const CONTRACT_SIZE = 100;

// Fixed per-row height — determines scroll behavior
const CELL_H = 22;
const PAD_L  = 68;
const PAD_T  = 30;
const PAD_R  = 46;
const PAD_B  = 10;

function buildGrid(contracts: OptionContract[], spot: number) {
  const strikeSet = new Set<number>();
  const expirySet = new Set<number>();

  for (const c of contracts) {
    if (c.oi > 0 && c.expiry >= 0 && c.expiry <= 90)
      { strikeSet.add(c.strike); expirySet.add(c.expiry); }
  }

  const strikes  = Array.from(strikeSet).sort((a, b) => a - b);
  const expiries = Array.from(expirySet).sort((a, b) => a - b);

  const nK = strikes.length, nE = expiries.length;
  if (nK < 1 || nE < 1)
    return { strikes: [], expiries: [], gex: new Float32Array(0), dex: new Float32Array(0), maxAbsGex: 0, maxAbsDex: 0 };

  const kIdx = new Map(strikes.map((k, i) => [k, i]));
  const eIdx = new Map(expiries.map((e, i) => [e, i]));
  const gex  = new Float32Array(nK * nE);
  const dex  = new Float32Array(nK * nE);

  for (const c of contracts) {
    if (c.oi <= 0) continue;
    const si = kIdx.get(c.strike); const ei = eIdx.get(c.expiry);
    if (si == null || ei == null) continue;
    const T      = Math.max(c.expiry, 0.5) / 365;
    const iv     = Math.max(c.iv ?? 0.15, 0.01);
    const bs     = bsGreeks(spot, c.strike, T, 0.05, iv, c.type);
    const gamma  = (c.gamma != null && c.gamma !== 0) ? c.gamma : bs.gamma;
    const delta  = (c.delta != null && c.delta !== 0) ? c.delta : bs.delta;
    const notional = c.oi * CONTRACT_SIZE;
    const sign   = c.type === "call" ? 1 : -1;
    const idx    = si * nE + ei;
    gex[idx] += gamma * notional * spot * spot * 0.01 * sign;
    dex[idx] += delta  * notional * spot;
  }

  let maxAbsGex = 1e-9, maxAbsDex = 1e-9;
  for (let i = 0; i < gex.length; i++) {
    if (Math.abs(gex[i]) > maxAbsGex) maxAbsGex = Math.abs(gex[i]);
    if (Math.abs(dex[i]) > maxAbsDex) maxAbsDex = Math.abs(dex[i]);
  }
  return { strikes, expiries, gex, dex, maxAbsGex, maxAbsDex };
}

function cellColor(v: number, maxAbs: number, metric: Metric): string {
  if (maxAbs === 0 || v === 0) return "#05070f";
  const t = Math.pow(Math.min(1, Math.abs(v) / maxAbs), 0.60);
  if (metric === "gex") {
    if (v > 0) return `rgb(0,${Math.round(16 + t * 239)},${Math.round(t * 72)})`;
    return `rgb(${Math.round(16 + t * 239)},0,${Math.round(t * 24)})`;
  } else {
    if (v > 0) return `rgb(${Math.round(t * 34)},${Math.round(16 + t * 196)},${Math.round(36 + t * 212)})`;
    return `rgb(${Math.round(36 + t * 216)},${Math.round(8 + t * 116)},0)`;
  }
}

function fmtVal(n: number): string {
  const a = Math.abs(n), s = n < 0 ? "-" : "+";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

// Short label shown INSIDE cells (no sign — color conveys direction)
function fmtCell(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "";
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${Math.round(a / 1e3)}K`;
  return `${Math.round(a)}`;
}

export function GexStrikeHeatmap({ ticker, contracts }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [metric,  setMetric]  = useState<Metric>("gex");
  const [w,       setW]       = useState(380);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; strike: number; expiry: number; value: number
  } | null>(null);

  // Only track WIDTH — height is data-driven for scrolling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setW(el.clientWidth || 380);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setW(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const grid = useMemo(() => buildGrid(contracts, ticker.spot), [contracts, ticker.spot]);

  // Track scroll key so we only jump on data/metric change, not on resize
  const scrollKeyRef = useRef("");

  // Draw onto canvas — canvas height grows with number of strikes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { strikes, expiries, gex, dex, maxAbsGex, maxAbsDex } = grid;
    const nK = strikes.length, nE = expiries.length;

    const canvasW = Math.max(1, w);
    const canvasH = nK > 0 ? nK * CELL_H + PAD_T + PAD_B : 200;

    canvas.width        = canvasW * devicePixelRatio;
    canvas.height       = canvasH * devicePixelRatio;
    canvas.style.width  = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.fillStyle = "#040610";
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (nK < 1 || nE < 1) {
      ctx.fillStyle = "#1a2030";
      ctx.font = `11px ${MONO}`; ctx.textAlign = "center";
      ctx.fillText("LOADING…", canvasW / 2, 100);
      return;
    }

    const data      = metric === "gex" ? gex : dex;
    const maxAbs    = metric === "gex" ? maxAbsGex : maxAbsDex;
    const accentCol = metric === "gex" ? "#00ff44" : "#22d3ee";
    const spot      = ticker.spot;

    const gridW = canvasW - PAD_L - PAD_R;
    const cellW = gridW / nE;

    // strikes stored low→high; display top→bottom = high→low
    const displayStrikes = [...strikes].reverse();

    // Spot row index
    let spotRow = 0, minDist = Infinity;
    for (let ki = 0; ki < nK; ki++) {
      const d = Math.abs(displayStrikes[ki] - spot);
      if (d < minDist) { minDist = d; spotRow = ki; }
    }

    // ── Expiry column headers ─────────────────────────────────────
    ctx.font = `7.5px ${MONO}`; ctx.textAlign = "center";
    const eStep = Math.max(1, Math.ceil(nE / 15));
    for (let ei = 0; ei < nE; ei += eStep) {
      const x = PAD_L + (ei + 0.5) * cellW;
      ctx.fillStyle = expiries[ei] <= 7 ? "#4a6848" : "#2e4258";
      ctx.fillText(expiries[ei] === 0 ? "0D" : `${expiries[ei]}D`, x, PAD_T - 10);
    }
    // "EXP" label
    ctx.fillStyle = "#1a2438"; ctx.textAlign = "right"; ctx.font = `7px ${MONO}`;
    ctx.fillText("EXP →", PAD_L - 5, PAD_T - 10);

    // ── Cells with value labels ───────────────────────────────────
    const fontSize = cellW >= 32 ? 7.5 : cellW >= 22 ? 6.5 : cellW >= 15 ? 6 : 0;
    for (let ki = 0; ki < nK; ki++) {
      const realKi = nK - 1 - ki;
      const rowY   = PAD_T + ki * CELL_H;
      for (let ei = 0; ei < nE; ei++) {
        const v    = data[realKi * nE + ei];
        const cellX = PAD_L + ei * cellW;
        ctx.fillStyle = cellColor(v, maxAbs, metric);
        ctx.fillRect(cellX, rowY, cellW - 0.5, CELL_H - 0.5);

        // Show value if cell is wide enough and value is non-trivial
        if (fontSize > 0 && Math.abs(v) > maxAbs * 0.005) {
          const label = fmtCell(v);
          if (label) {
            ctx.font = `${fontSize}px ${MONO}`;
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255,255,255,0.82)";
            ctx.fillText(label, cellX + cellW / 2, rowY + CELL_H / 2 + fontSize * 0.38);
          }
        }
      }
    }

    // ── Subtle column grid lines ──────────────────────────────────
    ctx.strokeStyle = "#050710"; ctx.lineWidth = 0.5;
    for (let ei = 1; ei < nE; ei++) {
      const x = PAD_L + ei * cellW;
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + nK * CELL_H); ctx.stroke();
    }

    // ── Spot horizontal line ──────────────────────────────────────
    const spotY = PAD_T + (spotRow + 0.5) * CELL_H;
    ctx.save();
    ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]); ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(PAD_L, spotY); ctx.lineTo(PAD_L + gridW, spotY); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.restore();

    // ── Strike labels (Y-axis) ───────────────────────────────────
    ctx.textAlign = "right";
    for (let ki = 0; ki < nK; ki++) {
      const rowY   = PAD_T + ki * CELL_H;
      const cy     = rowY + CELL_H / 2 + 3.5;
      const isSpot = ki === spotRow;
      // Row separator line
      ctx.strokeStyle = "#06080f"; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(0, rowY); ctx.lineTo(PAD_L, rowY); ctx.stroke();

      ctx.font = `${isSpot ? 9 : 8.5}px ${MONO}`;
      ctx.fillStyle = isSpot ? "#facc15" : "#5a7890";
      ctx.fillText(`$${displayStrikes[ki].toFixed(0)}`, PAD_L - 4, cy);

      // Spot triangle
      if (isSpot) {
        ctx.fillStyle = "#facc15";
        ctx.font = `8px ${MONO}`; ctx.textAlign = "left";
        ctx.fillText("▶", PAD_L + gridW + 3, cy);
        ctx.textAlign = "right";
      }
    }

    // ── Color legend bar ─────────────────────────────────────────
    const LX = canvasW - PAD_R + 10, LH = Math.min(nK * CELL_H, 120);
    const LY = PAD_T + (nK * CELL_H - LH) / 2, LW = 8;
    const grad = ctx.createLinearGradient(0, LY, 0, LY + LH);
    if (metric === "gex") {
      grad.addColorStop(0,   "#00ff44cc");
      grad.addColorStop(0.5, "#04061000");
      grad.addColorStop(1,   "#ff2233cc");
    } else {
      grad.addColorStop(0,   "#22d3eecc");
      grad.addColorStop(0.5, "#04061000");
      grad.addColorStop(1,   "#f97316cc");
    }
    ctx.fillStyle = grad; ctx.fillRect(LX, LY, LW, LH);
    ctx.strokeStyle = "#1a2030"; ctx.lineWidth = 0.4; ctx.strokeRect(LX, LY, LW, LH);
    ctx.font = `6.5px ${MONO}`; ctx.textAlign = "left"; ctx.fillStyle = "#3a4a58";
    ctx.fillText("+", LX + LW + 2, LY + 7);
    ctx.fillText("0", LX + LW + 2, LY + LH / 2 + 3);
    ctx.fillText("−", LX + LW + 2, LY + LH - 2);

    // ── HUD (top-left) ────────────────────────────────────────────
    ctx.textAlign = "left"; ctx.font = `bold 8.5px ${MONO}`;
    ctx.fillStyle = accentCol;
    ctx.fillText(metric === "gex" ? "GEX" : "DEX", 4, 14);
    ctx.font = `7px ${MONO}`; ctx.fillStyle = "#3a5060";
    ctx.fillText(`${ticker.symbol}  ·  ${spot.toFixed(2)}`, 4, 24);

    // Scroll to max GEX/DEX concentration — runs AFTER canvas is sized (same effect)
    const el = containerRef.current;
    const scrollKey = `${metric}-${nK}-${nE}`;
    if (el && scrollKey !== scrollKeyRef.current) {
      scrollKeyRef.current = scrollKey;
      let maxSum = -1, hotRow = 0;
      for (let ki = 0; ki < nK; ki++) {
        const realKi = nK - 1 - ki;
        let sum = 0;
        for (let ei = 0; ei < nE; ei++) sum += Math.abs(data[realKi * nE + ei]);
        if (sum > maxSum) { maxSum = sum; hotRow = ki; }
      }
      const scrollTarget = PAD_T + hotRow * CELL_H - el.clientHeight / 2 + CELL_H / 2;
      el.scrollTo({ top: Math.max(0, scrollTarget), behavior: "instant" });
    }

  }, [grid, metric, w, ticker]);

  // ── Hover tooltip (accounts for scroll position) ─────────────────
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const { strikes, expiries, gex, dex } = grid;
    const nK = strikes.length, nE = expiries.length;
    if (nK < 1 || nE < 1) { setTooltip(null); return; }

    const el   = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // Mouse position relative to the visible container
    const visX = e.clientX - rect.left;
    const visY = e.clientY - rect.top;
    // Canvas position = visible + scroll offset
    const canvasX = visX;
    const canvasY = visY + el.scrollTop;

    const gridW = Math.max(1, w) - PAD_L - PAD_R;
    const cellW = gridW / nE;
    const ei = Math.floor((canvasX - PAD_L) / cellW);
    const ki = Math.floor((canvasY - PAD_T) / CELL_H);
    if (ei < 0 || ei >= nE || ki < 0 || ki >= nK) { setTooltip(null); return; }

    const displayStrikes = [...strikes].reverse();
    const realKi = nK - 1 - ki;
    const data   = metric === "gex" ? gex : dex;
    setTooltip({ x: visX, y: visY, strike: displayStrikes[ki], expiry: expiries[ei], value: data[realKi * nE + ei] });
  }, [grid, w, metric]);

  const accentColor = metric === "gex" ? "#00ff44" : "#22d3ee";

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#040610", borderRadius: 4,
      display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: MONO,
      border: "1px solid #0d1020",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 8px", borderBottom: "1px solid #0d1020",
        background: "#000", flexShrink: 0,
      }}>
        <span style={{ fontSize: 7, color: "#1e2030", letterSpacing: "0.18em", marginRight: 2 }}>METRIC</span>
        {(["gex", "dex"] as Metric[]).map(m => (
          <button key={m} onClick={() => setMetric(m)} style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: "0.1em",
            padding: "2px 8px", borderRadius: 3, cursor: "pointer",
            border:     `1px solid ${metric === m ? accentColor : "#141828"}`,
            background: metric === m ? `${accentColor}14` : "transparent",
            color:      metric === m ? accentColor : "#2a3848",
            fontWeight: metric === m ? 700 : 400,
            transition: "all 0.12s",
          }}>{m.toUpperCase()}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 7, color: "#2a3848", letterSpacing: "0.1em" }}>
          STRIKE × EXPIRY HEATMAP
        </span>
      </div>

      {/* Scrollable canvas */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", position: "relative" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />

        {tooltip && (
          <div style={{
            position: "fixed",
            left: (containerRef.current?.getBoundingClientRect().left ?? 0) + tooltip.x + 14,
            top:  (containerRef.current?.getBoundingClientRect().top  ?? 0) + tooltip.y - 36,
            background: "rgba(4,6,16,0.97)",
            border: `1px solid ${accentColor}44`,
            borderRadius: 4, padding: "5px 9px",
            fontFamily: MONO, fontSize: 9,
            pointerEvents: "none", zIndex: 9999, whiteSpace: "nowrap",
          }}>
            <div style={{ color: "#4a6070", marginBottom: 2 }}>
              STRIKE <span style={{ color: "#c0ccd8" }}>${tooltip.strike.toFixed(0)}</span>
              &nbsp;·&nbsp; EXP <span style={{ color: "#c0ccd8" }}>
                {tooltip.expiry === 0 ? "0DTE" : `${tooltip.expiry}D`}
              </span>
            </div>
            <div style={{ color: accentColor, fontWeight: 700, fontSize: 10 }}>
              {metric.toUpperCase()} {fmtVal(tooltip.value)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

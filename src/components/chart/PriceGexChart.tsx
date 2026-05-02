import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, GexSnapshot } from "@/lib/gexSimData";
import { generateCandles } from "@/lib/gexSimData";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TF = "1D" | "5D" | "1M" | "3M" | "6M" | "1Y";

interface Props {
  symbol: string;
  basePrice: number;
  currentPrice: number;
  snapshot: GexSnapshot;
}

type Vec2 = { x: number; y: number };

const TF_OPTIONS: TF[] = ["1D", "5D", "1M", "3M", "6M", "1Y"];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function drawCrispLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
  dash?: number[],
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash && dash.length) ctx.setLineDash(dash);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size = 12,
  align: CanvasTextAlign = "left",
  weight = "700",
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTextBg(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height = 22,
  bg = "rgba(0,0,0,0.68)",
  border = "rgba(255,255,255,0.14)",
  color = "#fff",
  radius = 6,
  align: CanvasTextAlign = "center",
) {
  ctx.save();
  const rx = x - width / 2;
  const ry = y - height;
  if (typeof (ctx as any).roundRect === "function") {
    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    (ctx as any).roundRect(rx, ry, width, height, radius);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.fillRect(rx, ry, width, height);
    ctx.strokeRect(rx, ry, width, height);
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  ctx.fillText(text, x, y - 7);
  ctx.restore();
}

function formatSignedBn(n: number) {
  const sign = n >= 0 ? "+" : "-";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${sign}${(a / 1_000_000_000).toFixed(2)}B`;
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(2)}M`;
  return `${sign}${a.toFixed(0)}`;
}

function formatMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${sign}$${(a / 1_000_000_000).toFixed(2)}B`;
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  return `${sign}$${a.toFixed(2)}`;
}

function getCanvas2D(canvas: HTMLCanvasElement | null) {
  return canvas ? canvas.getContext("2d") : null;
}

function useCanvasSize<T extends HTMLCanvasElement>(ref: React.RefObject<T>, initial: { w: number; h: number }) {
  const [size, setSize] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement ?? el;
    const ro = new ResizeObserver(([e]) => {
      const cr = e.contentRect;
      setSize({ w: Math.max(320, Math.round(cr.width)), h: Math.max(220, Math.round(cr.height)) });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function movingAverage(arr: number[], window: number) {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const lo = Math.max(0, i - window + 1);
    const slice = arr.slice(lo, i + 1);
    const m = slice.reduce((s, v) => s + v, 0) / Math.max(1, slice.length);
    out.push(m);
  }
  return out;
}

function computeATRFromCandles(candles: Candle[], lookback = 14) {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose),
    );
    trs.push(tr);
  }
  const slice = trs.slice(Math.max(0, trs.length - lookback));
  if (!slice.length) return 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function computeGexBand(snapshot: GexSnapshot) {
  const by = snapshot.gexByStrike;
  const totalOI = by.reduce((s, x) => s + x.callOI + x.putOI, 0);

  const netPosGex = by.filter((p) => p.netGEX > 0).reduce((s, p) => s + p.netGEX, 0);
  const netNegGexAbs = Math.abs(by.filter((p) => p.netGEX < 0).reduce((s, p) => s + p.netGEX, 0));

  const posRatio = totalOI > 0 ? netPosGex / totalOI : 0;
  const negRatioAbs = totalOI > 0 ? netNegGexAbs / totalOI : 0;

  const netGex = snapshot.aggregates.netGEX ?? 0;
  const mag = Math.max(1e-9, Math.abs(netGex));
  const regime: "POS" | "NEG" | "TRANSITION" =
    netGex > 0.08 * mag ? "POS" : netGex < -0.08 * mag ? "NEG" : "TRANSITION";

  return { posRatio, negRatioAbs, netGex, regime };
}

/** ---------------- Widget 1: GEX Predictive Band ---------------- */
function CanvasGexPredictiveBand({
  snapshot,
  candles,
  currentPrice,
}: {
  snapshot: GexSnapshot;
  candles: Candle[];
  currentPrice: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useCanvasSize(canvasRef, { w: 980, h: 520 });

  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<Vec2 | null>(null);

  const [drag, setDrag] = useState<{ dragging: boolean; x0: number; pan0: number; pan: number }>({
    dragging: false,
    x0: 0,
    pan0: 0,
    pan: 0,
  });

  const band = useMemo(() => computeGexBand(snapshot), [snapshot]);
  const atrEq = useMemo(() => {
    const atr = computeATRFromCandles(candles, 14);
    return atr <= 0 ? currentPrice * 0.004 : atr;
  }, [candles, currentPrice]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 140);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvas2D(canvas);
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = "#04060b";
    ctx.fillRect(0, 0, size.w, size.h);

    const PAD = { l: 72, r: 22, t: 24, b: 74 };
    const W = size.w - PAD.l - PAD.r;
    const H = size.h - PAD.t - PAD.b;

    const breathe = 1 + Math.sin(tick * 0.16) * 0.06;
    const upper = currentPrice + band.posRatio * atrEq * breathe;
    const lower = currentPrice - band.negRatioAbs * atrEq * breathe;

    const tail = candles.slice(-Math.min(60, candles.length));
    const yMin = Math.min(lower, ...tail.map((c) => Math.min(c.low, c.close))) - currentPrice * 0.01;
    const yMax = Math.max(upper, ...tail.map((c) => Math.max(c.high, c.close))) + currentPrice * 0.01;

    const toY = (p: number) => PAD.t + ((yMax - p) / Math.max(1e-9, yMax - yMin)) * H;

    // X mapping uses pan (simulate pan/drag)
    const recent = candles.slice(-Math.min(90, candles.length));
    const n = recent.length;
    const xAt = (i: number) => PAD.l + ((i + drag.pan) / Math.max(1, n - 1)) * W;

    // y grid
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.08)";
    ctx.lineWidth = 1;
    for (let yv = Math.floor(yMin); yv <= Math.ceil(yMax); yv += 1) {
      const yy = toY(yv);
      drawCrispLine(ctx, PAD.l, yy, PAD.l + W, yy, "rgba(148,163,184,0.08)", 1);
      drawText(ctx, `$${yv.toFixed(0)}`, PAD.l - 12, yy + 4, "rgba(148,163,184,0.85)", 11, "right");
    }
    // x lines
    const idxs = [0, Math.floor(n * 0.2), Math.floor(n * 0.45), Math.floor(n * 0.65), Math.floor(n * 0.85), n - 1];
    for (const ii of idxs) {
      const xx = xAt(ii);
      drawCrispLine(ctx, xx, PAD.t, xx, PAD.t + H, "rgba(148,163,184,0.08)", 1);
    }
    ctx.restore();

    // band fill split
    const yUpper = toY(upper);
    const yLower = toY(lower);
    const yPrice = toY(currentPrice);

    // upper fill
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(PAD.l, yUpper);
    ctx.lineTo(PAD.l + W, yUpper);
    ctx.lineTo(PAD.l + W, yPrice);
    ctx.lineTo(PAD.l, yPrice);
    ctx.closePath();
    ctx.fillStyle = "rgba(16,185,129,0.22)";
    ctx.fill();

    // lower fill
    ctx.beginPath();
    ctx.moveTo(PAD.l, yPrice);
    ctx.lineTo(PAD.l + W, yPrice);
    ctx.lineTo(PAD.l + W, yLower);
    ctx.lineTo(PAD.l, yLower);
    ctx.closePath();
    ctx.fillStyle = "rgba(239,68,68,0.22)";
    ctx.fill();
    ctx.restore();

    // band lines
    drawCrispLine(ctx, PAD.l, yUpper, PAD.l + W, yUpper, "#00cfff", 2);
    drawCrispLine(ctx, PAD.l, yLower, PAD.l + W, yLower, "#ff4560", 2);

    // floating key labels
    drawTextBg(ctx, "GEX CEILING", PAD.l + W * 0.38, yUpper - 6, 150, 24, "rgba(0,207,255,0.10)", "rgba(0,207,255,0.45)", "#d8fbff");
    drawTextBg(ctx, "GEX FLOOR", PAD.l + W * 0.62, yLower + 18, 120, 24, "rgba(255,69,96,0.10)", "rgba(255,69,96,0.45)", "#ffe0e6");

    // key hard labels (requested)
    const { callWall, putWall, zeroGamma } = { callWall: 475, putWall: 455, zeroGamma: 469 };
    const yZ = toY(zeroGamma);
    const yC = toY(callWall);
    const yP = toY(putWall);

    drawCrispLine(ctx, PAD.l, yZ, PAD.l + W, yZ, "rgba(250,204,21,0.65)", 1.2, [6, 4]);
    drawText(ctx, `ZEROγ $${zeroGamma}`, PAD.l + 10, yZ - 10, "rgba(250,204,21,0.95)", 12, "left");

    drawCrispLine(ctx, PAD.l, yC, PAD.l + W, yC, "rgba(34,197,94,0.55)", 1.2, [6, 4]);
    drawText(ctx, `GEX CEILING $${callWall}`, PAD.l + W - 230, yC - 10, "rgba(34,197,94,0.95)", 12, "left");

    drawCrispLine(ctx, PAD.l, yP, PAD.l + W, yP, "rgba(239,68,68,0.55)", 1.2, [6, 4]);
    drawText(ctx, `GEX FLOOR $${putWall}`, PAD.l + W - 230, yP + 18, "rgba(239,68,68,0.95)", 12, "left");

    // price line (orange wiggly live)
    ctx.save();
    ctx.strokeStyle = "#ff8c42";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const phase = tick * 0.09;
    for (let i = 0; i < n; i++) {
      const baseY = toY(recent[i].close);
      const wiggle = Math.sin(phase + i * 0.18) * currentPrice * 0.0007;
      const yy = baseY + (wiggle / Math.max(1e-9, yMax - yMin)) * H * 0.5;
      const xx = xAt(i);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // spot line
    drawCrispLine(ctx, PAD.l, yPrice, PAD.l + W, yPrice, "rgba(255,255,255,0.25)", 1);

    // hover crosshair + label
    if (hover) {
      const x = hover.x;
      const y = hover.y;
      const inside = x >= PAD.l && x <= PAD.l + W && y >= PAD.t && y <= PAD.t + H;
      if (inside) {
        drawCrispLine(ctx, x, PAD.t, x, PAD.t + H, "rgba(148,163,184,0.45)", 1, [2, 3]);
        drawCrispLine(ctx, PAD.l, y, PAD.l + W, y, "rgba(148,163,184,0.35)", 1, [2, 3]);

        const i = clamp(Math.round(((x - PAD.l) / W) * (n - 1) - drag.pan), 0, n - 1);
        const p = recent[i]?.close ?? currentPrice;
        drawTextBg(ctx, `PRICE $${p.toFixed(2)}`, x, y, 120, 24, "rgba(0,0,0,0.65)", "rgba(255,140,66,0.45)", "#fff2ea");
      }
    }

    // indicator below: band width
    const bandW = Math.abs(upper - lower);
    const bandW0 = currentPrice * 0.06;
    const compression = clamp(1 - bandW / Math.max(1e-9, bandW0), -1, 1);
    const squeeze = bandW / Math.max(1e-9, bandW0) < 0.75;

    const by = PAD.t + H + 18;
    const bh = 12;
    const fillW = clamp((1 - compression) * W, 0, W);

    ctx.save();
    ctx.fillStyle = "rgba(148,163,184,0.10)";
    ctx.fillRect(PAD.l, by, W, bh);

    ctx.fillStyle = squeeze ? "rgba(245,158,11,0.55)" : "rgba(0,207,255,0.45)";
    ctx.fillRect(PAD.l, by, fillW, bh);

    drawText(ctx, squeeze ? "SQUEEZE ALERT" : "GEX BAND WIDTH", PAD.l + 8, by - 5, squeeze ? "rgba(245,158,11,0.98)" : "rgba(0,207,255,0.95)", 12, "left");
    drawText(ctx, `WIDTH $${bandW.toFixed(2)}`, PAD.l + 170, by - 5, "rgba(229,231,235,0.75)", 12, "left");
    drawText(ctx, `RANGE $${lower.toFixed(2)} → $${upper.toFixed(2)}`, PAD.l + 360, by - 5, "rgba(255,255,255,0.60)", 12, "left");

    const netGex = snapshot.aggregates.netGEX ?? 0;
    const regimeTxt = netGex >= 0 ? "NET GEX REGIME: POSITIVE" : "NET GEX REGIME: NEGATIVE";
    const badgeCol = netGex >= 0 ? "rgba(16,185,129,0.95)" : "rgba(239,68,68,0.95)";
    drawText(ctx, regimeTxt, PAD.l + 8, by + 22, badgeCol, 12, "left");

    ctx.restore();
  }, [size.w, size.h, tick, hover, candles, currentPrice, atrEq, band, snapshot, drag.pan]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onMouseLeave = () => setHover(null);

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setDrag((d) => ({ ...d, dragging: true, x0: e.clientX, pan0: d.pan }));
  };

  const onMouseUp = () => setDrag((d) => ({ ...d, dragging: false }));

  const onMouseMoveDrag = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setHover((h) => h ?? null);
    setDrag((d) => {
      if (!d.dragging) return d;
      const dx = e.clientX - d.x0;
      // map pixels to "pan units"
      const unit = size.w / 8;
      const pan = clamp(d.pan0 + -dx / Math.max(1, unit), -20, 20);
      return { ...d, pan };
    });
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // wheel adjusts pan sensitivity via quick nudge
    const delta = e.deltaY > 0 ? -0.6 : 0.6;
    setDrag((d) => ({ ...d, pan: clamp(d.pan + delta, -20, 20) }));
  };

  return (
    <div ref={wrapRef} style={{ width: "100%", height: 540, position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: drag.dragging ? "grabbing" : "crosshair" }}
        onMouseMove={(e) => {
          onMouseMove(e);
          onMouseMoveDrag(e);
        }}
        onMouseLeave={onMouseLeave}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
      />
    </div>
  );
}

/** ---------------- Widget 2: DEX Flow Imbalance ---------------- */
function CanvasDexFlowImbalance({ snapshot }: { snapshot: GexSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useCanvasSize(canvasRef, { w: 980, h: 560 });

  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<{ idx: number; area: "top" | "bottom"; x: number; y: number } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 140);
    return () => window.clearInterval(id);
  }, []);

  const data = useMemo(() => {
    const by = snapshot.gexByStrike;
    const snapMap = new Map<number, number>();
    for (const p of by) {
      const dex = typeof p.dex === "number" ? p.dex : p.netGEX;
      snapMap.set(p.strike, dex);
    }

    const strikes: { strike: number; dex: number }[] = [];
    const lo = 440;
    const hi = 510;
    for (let k = lo; k <= hi; k += 1) {
      // nearest snapshot strike
      let best = k;
      let bestD = Infinity;
      for (const s of snapMap.keys()) {
        const d = Math.abs(s - k);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      strikes.push({ strike: k, dex: snapMap.get(best) ?? 0 });
    }

    const netDex = by.reduce((s, p) => s + (typeof p.dex === "number" ? p.dex : p.netGEX), 0);
    return { strikes, netDex, spot: snapshot.spot };
  }, [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvas2D(canvas);
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size.w, size.h);

    const TOP_H = Math.round(size.h * 0.6);
    const PAD = { l: 56, r: 20, t: 18, b: 40 };
    const W = size.w - PAD.l - PAD.r;
    const H = TOP_H - PAD.t - PAD.b;
    const y0 = PAD.t + H / 2;

    const maxAbs = Math.max(1, ...data.strikes.map((s) => Math.abs(s.dex)));
    const breathe = 1 + Math.sin(tick * 0.42) * 0.08;

    // spot line + tag
    drawCrispLine(ctx, PAD.l, y0, PAD.l + W, y0, "rgba(168,85,247,0.8)", 1.3, [6, 4]);
    drawTextBg(ctx, `SPOT $${data.spot.toFixed(2)}`, PAD.l + W * 0.25, y0, 140, 24, "rgba(168,85,247,0.18)", "rgba(168,85,247,0.70)", "#e9d5ff");

    // labels
    drawText(ctx, "BEAR FLOW", PAD.l + 4, PAD.t + 18, "rgba(248,113,113,0.95)", 14);
    drawText(ctx, "BULL FLOW", PAD.l + W - 90, PAD.t + 18, "rgba(96,165,250,0.95)", 14);

    // animated bars
    const n = data.strikes.length;
    const barGap = 1;
    const barW = W / n - barGap;

    for (let i = 0; i < n; i++) {
      const s = data.strikes[i];
      const dx = s.dex * breathe;
      const w = (Math.abs(dx) / maxAbs) * (barW * 1.6);
      const x = PAD.l + i * (barW + barGap);

      const isPos = dx >= 0;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = isPos ? "rgba(96,165,250,0.9)" : "rgba(248,113,113,0.9)";
      ctx.fillRect(x + barW / 2 - w / 2, y0 - 1.2, w, 2.4);

      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = isPos ? "#60a5fa" : "#f87171";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + barW / 2 - w / 2, y0 - 1.2, w, 2.4);
      ctx.restore();

      if (hover && hover.area === "top" && hover.idx === i) {
        drawCrispLine(ctx, x, PAD.t, x, PAD.t + H, "rgba(255,255,255,0.40)", 1);

        const dexBn = dx / 1e9;
        const signText = dexBn >= 0 ? "+" : "-";
        const label = `STRIKE $${s.strike}  DEX ${signText}${Math.abs(dexBn).toFixed(2)}B`;
        const bx = clamp(x + barW / 2, 120, size.w - 120);
        drawTextBg(ctx, label, bx, PAD.t + 46, 220, 24, "rgba(0,0,0,0.65)", "rgba(255,255,255,0.14)", "#f3f4f6");
      }
    }

    // net dex meter (top)
    const netColor = data.netDex >= 0 ? "#60a5fa" : "#f87171";
    drawText(ctx, "NET DEX", PAD.l + 6, PAD.t - 2, "rgba(229,231,235,0.70)", 12);
    drawText(ctx, formatSignedBn(data.netDex), PAD.l + 6, PAD.t + 24, netColor, 22, "left", "800");

    // ===== bottom history =====
    const PAD2 = { l: 56, r: 18, t: TOP_H + 18, b: 26 };
    const BOT_H = size.h - TOP_H;
    const H2 = BOT_H - 18 - PAD2.b;
    const yBase = TOP_H + 18 + H2;

    // deterministic-ish series + daily price change
    const history = (() => {
      const seed = Math.floor(snapshot.timestamp % 1_000_000);
      let h = seed;
      const rnd = () => {
        h = (h * 1664525 + 1013904223) >>> 0;
        return h / 2 ** 32;
      };
      const pts: { dex: number; date: string; priceChgPct: number }[] = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const regimeBias = data.netDex >= 0 ? 0.05 : -0.05;
        const dex = (rnd() - 0.5) * 2.2e9 + regimeBias * 1.2e9 + data.netDex * 0.12;
        const priceChgPct = (rnd() - 0.5) * 0.04 + (dex / 2.2e9) * 0.015;
        pts.push({ dex, date: iso, priceChgPct });
      }
      return pts;
    })();

    const maxAbs2 = Math.max(1, ...history.map((p) => Math.abs(p.dex)));

    // zero line
    drawCrispLine(ctx, PAD2.l, yBase, size.w - PAD2.r, yBase, "rgba(148,163,184,0.35)", 1.2);

    const toX2 = (i: number) => PAD2.l + (i / Math.max(1, history.length - 1)) * (size.w - PAD2.l - PAD2.r);
    const toY2 = (v: number) => {
      const t = (maxAbs2 - v) / Math.max(1e-9, maxAbs2 * 2);
      return PAD2.t + t * H2;
    };

    // area fill based on average sign
    const avgDex = history.reduce((s, p) => s + p.dex, 0) / history.length;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toX2(0), toY2(history[0].dex));
    for (let i = 1; i < history.length; i++) ctx.lineTo(toX2(i), toY2(history[i].dex));
    ctx.lineTo(toX2(history.length - 1), yBase);
    ctx.lineTo(toX2(0), yBase);
    ctx.closePath();
    ctx.fillStyle = avgDex >= 0 ? "rgba(16,185,129,0.22)" : "rgba(248,113,113,0.22)";
    ctx.fill();
    ctx.restore();

    // line
    ctx.save();
    ctx.strokeStyle = avgDex >= 0 ? "rgba(16,185,129,0.80)" : "rgba(248,113,113,0.80)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX2(0), toY2(history[0].dex));
    for (let i = 1; i < history.length; i++) ctx.lineTo(toX2(i), toY2(history[i].dex));
    ctx.stroke();
    ctx.restore();

    // dots + star for top 10% abs
    const absSorted = [...history].map((p) => Math.abs(p.dex)).sort((a, b) => b - a);
    const thr = absSorted[Math.floor(absSorted.length * 0.1)] ?? absSorted[absSorted.length - 1];

    for (let i = 0; i < history.length; i++) {
      const p = history[i];
      const x = toX2(i);
      const y = toY2(p.dex);

      ctx.save();
      ctx.fillStyle = p.dex >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (Math.abs(p.dex) >= thr) {
        ctx.save();
        ctx.translate(x, y - 14);
        ctx.fillStyle = "rgba(245,158,11,0.95)";
        ctx.beginPath();
        const R = 7;
        for (let k = 0; k < 10; k++) {
          const ang = (Math.PI / 5) * k;
          const rr = k % 2 === 0 ? R : R / 2;
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (hover && hover.area === "bottom" && hover.idx === i) {
        const dexBn = p.dex / 1e9;
        const label = `${p.date.slice(5)}  DEX ${dexBn >= 0 ? "+" : "-"}${Math.abs(dexBn).toFixed(2)}B  Δ${p.priceChgPct >= 0 ? "+" : ""}${(p.priceChgPct * 100).toFixed(2)}%`;
        drawTextBg(ctx, label, clamp(x, 140, size.w - 140), y - 4, 320, 24, "rgba(0,0,0,0.68)", "rgba(255,255,255,0.14)", "#f3f4f6");
      }
    }

    // x-axis labels
    for (let i = 0; i < history.length; i++) {
      if (i % 6 !== 0 && i !== history.length - 1) continue;
      drawText(ctx, history[i].date.slice(5), toX2(i), yBase + 18, "rgba(148,163,184,0.75)", 11, "center");
    }
  }, [size.w, size.h, tick, snapshot, data, hover]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const TOP_H = Math.round(size.h * 0.6);
    if (y <= TOP_H) {
      const PAD = { l: 56, r: 20, t: 18, b: 40 };
      const W = size.w - PAD.l - PAD.r;
      const n = data.strikes.length;
      const barGap = 1;
      const barW = W / n - barGap;
      const idx = clamp(Math.floor((x - PAD.l) / (barW + barGap)), 0, n - 1);
      setHover({ idx, area: "top", x, y });
      return;
    }

    // bottom hover
    const PAD2 = { l: 56, r: 18, t: TOP_H + 18, b: 26 };
    const plotW = size.w - PAD2.l - PAD2.r;
    const idx = clamp(Math.round(((x - PAD2.l) / Math.max(1, plotW)) * (30 - 1)), 0, 29);
    setHover({ idx, area: "bottom", x, y });
  };

  return (
    <div ref={wrapRef} style={{ width: "100%", height: 600, position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: "crosshair" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      />
    </div>
  );
}

/** ---------------- Widget 3: Gamma Regime Dashboard ---------------- */
function CanvasGammaRegimeDashboard({ snapshot }: { snapshot: GexSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useCanvasSize(canvasRef, { w: 980, h: 680 });

  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<{ i: number } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 140);
    return () => window.clearInterval(id);
  }, []);

  const history = useMemo(() => {
    const seed = Math.floor(snapshot.timestamp % 1_000_000);
    let h = seed;
    const rnd = () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return h / 2 ** 32;
    };
    const days = 90;
    const base = snapshot.spot;
    let p = base;
    const netGex = snapshot.aggregates.netGEX ?? 0;
    let curRegime: "POSITIVE" | "NEGATIVE" = netGex >= 0 ? "POSITIVE" : "NEGATIVE";
    let daysIn = 0;

    const pts: { date: string; price: number; dailyRangePct: number; regime: "POSITIVE" | "NEGATIVE" }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      if (daysIn > 4 && rnd() < 0.06) {
        curRegime = curRegime === "POSITIVE" ? "NEGATIVE" : "POSITIVE";
        daysIn = 0;
      }
      daysIn++;

      const volFactor = curRegime === "POSITIVE" ? 0.65 : 1.15;
      const dailyMove = (rnd() - 0.5) * 0.028 * volFactor;
      const rangePct = Math.abs((rnd() - 0.5) * 0.035 * volFactor) + 0.01 * volFactor;

      p = Math.max(1, p * (1 + dailyMove));
      pts.push({ date, price: p, dailyRangePct: rangePct, regime: curRegime });
    }
    return pts;
  }, [snapshot]);

  const netGex = snapshot.aggregates.netGEX ?? 0;
  const regime = netGex >= 0 ? "POSITIVE" : "NEGATIVE";
  const regimeStrength = clamp((Math.abs(netGex) / Math.max(1e-9, 5e9)) * 100, 0, 100);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvas2D(canvas);
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size.w, size.h);

    const W = size.w;
    const H = size.h;

    const leftW = Math.round(W * 0.35);
    const centerW = Math.round(W * 0.4);
    const rightW = W - leftW - centerW;

    const paddingTop = 18;

    // Gauge
    const isPos = regime === "POSITIVE";
    const col = isPos ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
    const gaugeCX = leftW / 2;
    const gaugeCY = 150;
    const R = 95;
    const angleStart = Math.PI * 1.1;
    const angleEnd = Math.PI * 0.1;

    ctx.save();
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(148,163,184,0.15)";
    ctx.beginPath();
    ctx.arc(gaugeCX, gaugeCY, R, angleStart, angleEnd);
    ctx.stroke();

    const t = clamp(regimeStrength / 100, 0, 1);
    const ang = angleStart + (angleEnd - angleStart) * t;

    ctx.strokeStyle = col;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(gaugeCX, gaugeCY, R, angleStart, ang);
    ctx.stroke();

    // transition dashed
    ctx.strokeStyle = "rgba(250,204,21,0.95)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 6;
    const transT1 = angleStart + (angleEnd - angleStart) * 0.44;
    const transT2 = angleStart + (angleEnd - angleStart) * 0.58;
    ctx.beginPath();
    ctx.arc(gaugeCX, gaugeCY, R, transT1, transT2);
    ctx.stroke();
    ctx.setLineDash([]);

    // needle
    const nx = gaugeCX + Math.cos(ang) * (R - 18);
    const ny = gaugeCY + Math.sin(ang) * (R - 18);
    drawCrispLine(ctx, gaugeCX, gaugeCY, nx, ny, col, 3);

    ctx.fillStyle = "rgba(229,231,235,0.9)";
    ctx.beginPath();
    ctx.arc(gaugeCX, gaugeCY, 6, 0, Math.PI * 2);
    ctx.fill();

    drawText(ctx, "GAMMA REGIME", gaugeCX, gaugeCY + 55, "rgba(229,231,235,0.70)", 14, "center", "800");
    drawText(ctx, `${Math.round(regimeStrength)} / 100`, gaugeCX, gaugeCY + 78, "rgba(255,255,255,0.55)", 12, "center", "700");

    // below gauge
    const zeroGamma = 469;
    const netGexBn = netGex / 1e9;

    drawText(ctx, `ZEROγ $${zeroGamma}`, 20, 290, "rgba(250,204,21,0.95)", 12);
    drawText(ctx, `NET GEX ${netGexBn >= 0 ? "+" : ""}${netGexBn.toFixed(2)}B`, 20, 308, col, 12);

    // days in regime (from history)
    let daysIn = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].regime === regime) daysIn++;
      else break;
    }
    drawText(ctx, `DAYS IN REGIME ${daysIn}`, 20, 326, "rgba(229,231,235,0.60)", 12);

    ctx.restore();

    // Center chart
    const centerTop = paddingTop + 120;
    const centerBottom = H - 34;
    const centerH = centerBottom - centerTop;

    const x0 = leftW;
    const x1 = leftW + centerW;
    const centerPadL = 18;
    const centerPadR = 16;

    const plotW = centerW - centerPadL - centerPadR;

    const prices = history.map((p) => p.price);
    const avg = prices.reduce((s, v) => s + v, 0) / Math.max(1, prices.length);
    const minP = Math.min(...prices) - avg * 0.01;
    const maxP = Math.max(...prices) + avg * 0.01;

    const toX = (i: number) => x0 + centerPadL + (i / Math.max(1, history.length - 1)) * plotW;
    const toY = (p: number) => centerTop + ((maxP - p) / Math.max(1e-9, maxP - minP)) * centerH;

    // shading
    ctx.save();
    for (let i = 1; i < history.length; i++) {
      const cur = history[i].regime;
      const prev = history[i - 1].regime;
      const xPrev = toX(i - 1);
      const xCur = toX(i);
      ctx.fillStyle = cur === "POSITIVE" ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
      ctx.fillRect(xPrev, centerTop, xCur - xPrev, centerH);

      if (cur !== prev) {
        drawCrispLine(ctx, xPrev, centerTop, xPrev, centerTop + centerH, "rgba(250,204,21,0.85)", 1, [7, 5]);
        drawText(ctx, history[i].date.slice(5), xPrev + 3, centerTop + 14, "rgba(250,204,21,0.85)", 11, "left");
      }
    }
    ctx.restore();

    // price line
    ctx.save();
    ctx.strokeStyle = regime === "POSITIVE" ? "rgba(34,197,94,0.85)" : "rgba(239,68,68,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const xx = toX(i);
      const yy = toY(history[i].price);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // current dot
    const lastI = history.length - 1;
    const dotX = toX(lastI);
    const dotY = toY(history[lastI].price);

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10 + Math.sin(tick * 0.2) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // hover
    if (hover) {
      const i = clamp(hover.i, 0, history.length - 1);
      const xx = toX(i);
      const yy = toY(history[i].price);

      drawCrispLine(ctx, xx, centerTop, xx, centerTop + centerH, "rgba(148,163,184,0.55)", 1, [2, 4]);
      drawCrispLine(ctx, x0 + centerPadL, yy, x1 - centerPadR, yy, "rgba(148,163,184,0.35)", 1, [2, 4]);

      drawTextBg(
        ctx,
        `${history[i].date.slice(5)}  $${history[i].price.toFixed(2)}  ${history[i].regime}  RANGE ${history[i].dailyRangePct.toFixed(2)}%`,
        xx,
        yy - 6,
        340,
        26,
        "rgba(0,0,0,0.68)",
        "rgba(255,255,255,0.14)",
        "#f3f4f6",
      );
    }

    // x labels
    ctx.save();
    const labelCount = 7;
    for (let k = 0; k < labelCount; k++) {
      const i = Math.floor((k / (labelCount - 1)) * (history.length - 1));
      drawText(ctx, history[i].date.slice(5), toX(i), centerTop + centerH + 20, "rgba(148,163,184,0.7)", 11, "center");
    }
    ctx.restore();

    // Right stats
    ctx.save();
    drawText(ctx, "CURRENT REGIME", x1 + 16, paddingTop + 40, "rgba(229,231,235,0.65)", 12);

    const badgeCol = regime === "POSITIVE" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
    drawTextBg(ctx, regime, x1 + 90, paddingTop + 78, 130, 26, "rgba(148,163,184,0.15)", badgeCol, "#ffffff", 16, "center");

    drawText(ctx, `DAYS IN REGIME: ${daysIn}`, x1 + 16, paddingTop + 120, "rgba(229,231,235,0.70)", 13);

    // Avg ranges by regime
    const posPts = history.filter((p) => p.regime === "POSITIVE");
    const negPts = history.filter((p) => p.regime === "NEGATIVE");
    const avgRange = (arr: typeof history) => (arr.length ? arr.reduce((s, p) => s + p.dailyRangePct, 0) / arr.length : 0);

    const avgPos = avgRange(posPts);
    const avgNeg = avgRange(negPts);

    drawText(ctx, `POS γ AVG RANGE: ${avgPos.toFixed(2)}%`, x1 + 16, paddingTop + 160, "rgba(34,197,94,0.95)", 12);
    drawText(ctx, `NEG γ AVG RANGE: ${avgNeg.toFixed(2)}%`, x1 + 16, paddingTop + 178, "rgba(239,68,68,0.95)", 12);

    // win / drawdown / vix behavior (mocked, derived from sign)
    const winRate = isPos ? 0.62 : 0.41;
    const maxDD = !isPos ? 0.18 : 0.08;
    const vixBehavior = isPos ? "suppressed" : "elevated";

    drawText(ctx, `WIN RATE LONG in POS γ: ${(winRate * 100).toFixed(0)}%`, x1 + 16, paddingTop + 204, "rgba(229,231,235,0.70)", 12);
    drawText(ctx, `MAX DRAWDOWN in NEG γ: ${(maxDD * 100).toFixed(1)}%`, x1 + 16, paddingTop + 222, "rgba(229,231,235,0.70)", 12);
    drawText(ctx, `VIX BEHAVIOR: ${vixBehavior}`, x1 + 16, paddingTop + 240, "rgba(229,231,235,0.70)", 12);

    // Regime forecast probability gauge
    const series = history.map((p) => (p.regime === "POSITIVE" ? 1 : -1));
    const ma = movingAverage(series, 5);
    const trend = ma[ma.length - 1] ?? (isPos ? 1 : -1);
    const prob = clamp(isPos ? 0.55 + trend * 0.12 : 0.45 - trend * 0.12, 0.05, 0.95);

    drawText(ctx, "REGIME FORECAST", x1 + 16, paddingTop + 380, "rgba(229,231,235,0.65)", 12);
    const gy = paddingTop + 404;
    const gw = rightW - 32;
    ctx.fillStyle = "rgba(148,163,184,0.10)";
    ctx.fillRect(x1 + 16, gy, gw, 14);
    ctx.fillStyle = isPos ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)";
    ctx.fillRect(x1 + 16, gy, gw * prob, 14);
    drawText(ctx, `NEXT 5D: ${(prob * 100).toFixed(0)}%`, x1 + 16, gy + 30, "rgba(255,255,255,0.72)", 12);

    ctx.restore();
  }, [size.w, size.h, tick, snapshot, history, hover, regime, regimeStrength, netGex, isPos]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const W = size.w;
    const leftW = Math.round(W * 0.35);
    const centerW = Math.round(W * 0.4);

    const centerTop = 18 + 120;
    const centerBottom = size.h - 34;

    if (x < leftW || x > leftW + centerW || y < centerTop || y > centerBottom) {
      setHover(null);
      return;
    }

    const centerPadL = 18;
    const centerPadR = 16;
    const plotW = centerW - centerPadL - centerPadR;
    const to = leftW + centerPadL;
    const i = clamp(Math.round(((x - to) / Math.max(1, plotW)) * (history.length - 1)), 0, history.length - 1);
    setHover({ i });
  };

  return (
    <div ref={wrapRef} style={{ width: "100%", height: 680, position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: "crosshair" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      />
    </div>
  );
}

/** ---------------- Main exported component ---------------- */
export function PriceGexChart({ symbol, basePrice, currentPrice, snapshot }: Props) {
  const [tf, setTf] = useState<TF>("1D");
  const candles = useMemo(() => generateCandles(symbol, tf, basePrice), [symbol, tf, basePrice]);

  const [tab, setTab] = useState<"gexBand" | "dexFlow" | "gammaRegime">("gexBand");

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-8 bg-[#0a0a0a] border border-[#1f1f1f]">
            <TabsTrigger value="gexBand" className="text-[11px] px-3 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              GEX Predictive Band
            </TabsTrigger>
            <TabsTrigger value="dexFlow" className="text-[11px] px-3 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              DEX Flow Imbalance
            </TabsTrigger>
            <TabsTrigger value="gammaRegime" className="text-[11px] px-3 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              Gamma Regime Dashboard
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <span>TF</span>
          <select
            value={tf}
            onChange={(e) => setTf(e.target.value as TF)}
            className="h-7 bg-black border border-[#2a2a2a] text-white text-[11px] font-bold rounded-sm px-2"
          >
            {TF_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tab === "gexBand" && <CanvasGexPredictiveBand snapshot={snapshot} candles={candles} currentPrice={currentPrice} />}
      {tab === "dexFlow" && <CanvasDexFlowImbalance snapshot={snapshot} />}
      {tab === "gammaRegime" && <CanvasGammaRegimeDashboard snapshot={snapshot} />}
    </div>
  );
}

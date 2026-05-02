import { useEffect, useRef, useMemo, useState } from "react";
import type { DemoTicker, ExposurePoint, KeyLevels } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid, ReferenceLine, Cell,
} from "recharts";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
}

interface GexRow { strike: number; callGex: number; putGex: number; maxGex: number; }

// Seeded deterministic RNG — same seed → same bars every render
function seededRng(seed: number) {
  let s = seed | 0;
  return () => { s = Math.imul(s ^ (s >>> 15), s | 1); s ^= s + Math.imul(s ^ (s >>> 7), s | 61); return ((s ^ (s >>> 14)) >>> 0) / 4294967296; };
}

function buildDemoRows(spot: number, step: number): GexRow[] {
  const n = 18, mid = Math.round(spot / step) * step;
  const rnd = seededRng(Math.round(spot) * 31 + Math.round(step) * 7);
  let maxG = 0;
  const raw: { k: number; c: number; p: number }[] = [];
  for (let i = -n / 2; i <= n / 2; i++) {
    const k = mid + i * step;
    const dist = Math.abs(k - spot) / (step * n * 0.5);
    const base = Math.exp(-dist * dist * 5) * 1.2e9;
    const c = i >= 0 ? base * (0.5 + rnd() * 0.9) : base * (0.1 + rnd() * 0.4);
    const p = i <= 0 ? base * (0.5 + rnd() * 0.9) : base * (0.1 + rnd() * 0.4);
    raw.push({ k, c, p });
    maxG = Math.max(maxG, c, p);
  }
  return raw.map(r => ({ strike: r.k, callGex: r.c, putGex: r.p, maxGex: maxG }))
            .sort((a, b) => a.strike - b.strike);
}

function calcStdDevs(spot: number, iv: number) {
  return ([
    { label: "1D", dte: 1 }, { label: "1W", dte: 5 },
    { label: "2W", dte: 14 }, { label: "1M", dte: 30 },
  ] as const).map(({ label, dte }) => {
    const move = spot * iv * Math.sqrt(dte / 252);
    return {
      label, pct: +((move / spot) * 100).toFixed(2),
      up1: +(spot + move).toFixed(1), dn1: +(spot - move).toFixed(1),
      up2: +(spot + 2 * move).toFixed(1), dn2: +(spot - 2 * move).toFixed(1),
    };
  });
}

const TT_STYLE = {
  background: "#070a10", border: "1px solid #1e2535",
  borderRadius: 6, fontSize: 11, fontFamily: "'Courier New',monospace", color: "#ccc",
};

// ── Yahoo Finance helpers ──────────────────────────────────────────────────
function toYahooSym(s: string) {
  const map: Record<string, string> = { SPX: "^GSPC", NDX: "^NDX", RUT: "^RUT", VIX: "^VIX", NQ: "NQ=F", ES: "ES=F" };
  return map[s.toUpperCase()] ?? s.toUpperCase();
}

function parseYahooClose(raw: unknown): number[] {
  let d = raw as Record<string, unknown>;
  if (typeof (d as { contents?: string }).contents === "string")
    d = JSON.parse((d as { contents: string }).contents) as Record<string, unknown>;
  const closes =
    (((((d?.chart as Record<string, unknown>)
      ?.result as Record<string, unknown>[])?.[0]
      ?.indicators as Record<string, unknown>)
      ?.quote as Record<string, unknown>[])?.[0]
      ?.close) as (number | null)[] | undefined;
  if (!Array.isArray(closes)) return [];
  return closes.filter((v): v is number => v != null && isFinite(v));
}

function fetchClose(yahooSym: string, onDone: (prices: number[]) => void) {
  const u1 = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d&includePrePost=false`;
  const u2 = u1.replace("query1", "query2");
  const px1 = `https://api.allorigins.win/get?url=${encodeURIComponent(u1)}`;
  const px2 = `https://corsproxy.io/?${encodeURIComponent(u1)}`;

  const tryUrl = (url: string): Promise<void> =>
    fetch(url, { mode: "cors" })
      .then(r => r.json())
      .then(raw => {
        const arr = parseYahooClose(raw);
        if (arr.length > 1) onDone(arr);
        else throw new Error("empty");
      });

  tryUrl(u1).catch(() => tryUrl(u2)).catch(() => tryUrl(px1)).catch(() => tryUrl(px2)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
export function GexBotChart({ ticker, exposures, levels }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const priceRef  = useRef<HTMLSpanElement>(null);
  const dzRef     = useRef<HTMLSpanElement>(null);

  const V = useRef({
    center: ticker.spot, range: (ticker.strikeStep || 5) * 22,
    mx: -1, my: -1, drag: false, dragY: 0, dragC: 0,
    price: ticker.spot, priceVel: 0,
    dz: levels.gammaFlip ?? levels.volTrigger ?? ticker.spot - 20,
    priceHist: [] as number[], dzHist: [] as number[],
    qqqHist:   [] as number[], qqqLoaded: false,
    realLoaded: false,
  });

  // ── Fetch main ticker real price ──
  useEffect(() => {
    const sym = toYahooSym(ticker.symbol);
    fetchClose(sym, prices => {
      V.current.priceHist  = prices.slice(-300);
      V.current.price      = prices[prices.length - 1];
      V.current.realLoaded = true;
      if (priceRef.current) priceRef.current.textContent = V.current.price.toFixed(2);
    });
  }, [ticker.symbol]);

  // ── Always fetch QQQ real data (overlay / main if ticker is QQQ) ──
  useEffect(() => {
    fetchClose("QQQ", prices => {
      V.current.qqqHist   = prices.slice(-300);
      V.current.qqqLoaded = true;
      if (ticker.symbol.toUpperCase() === "QQQ" && !V.current.realLoaded) {
        V.current.priceHist  = prices.slice(-300);
        V.current.price      = prices[prices.length - 1];
        V.current.realLoaded = true;
        if (priceRef.current) priceRef.current.textContent = V.current.price.toFixed(2);
      }
    });
  }, [ticker.symbol]);

  const rows = useMemo<GexRow[]>(() => {
    if (exposures.length >= 3) {
      const maxGex = Math.max(...exposures.map(e => Math.max(e.callGex, Math.abs(e.putGex))), 1);
      return exposures
        .map(e => ({ strike: e.strike, callGex: Math.max(e.callGex, 0), putGex: Math.abs(Math.min(e.putGex, 0)), maxGex }))
        .sort((a, b) => a.strike - b.strike);
    }
    return buildDemoRows(ticker.spot, ticker.strikeStep || 5);
  }, [exposures, ticker.spot, ticker.strikeStep]);

  const isReal = exposures.length >= 3;

  // Reset state when ticker changes
  useEffect(() => {
    V.current.center    = ticker.spot;
    V.current.range     = (ticker.strikeStep || 5) * 22;
    V.current.price     = ticker.spot;
    V.current.priceVel  = 0;
    V.current.dz        = levels.gammaFlip ?? levels.volTrigger ?? ticker.spot - 20;
    V.current.priceHist = [];
    V.current.dzHist    = [];
    V.current.realLoaded = false;
  }, [ticker.symbol, ticker.spot, ticker.strikeStep, levels.gammaFlip, levels.volTrigger]);

  // ── Canvas setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx  = canvas.getContext("2d")!;

    function pY(p: number, H: number) {
      const bot = V.current.center - V.current.range / 2;
      return H * dpr * (1 - (p - bot) / V.current.range);
    }

    function draw() {
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);

      const { center, range, mx, my, drag, price, dz } = V.current;
      const bot = center - range / 2, top = center + range / 2;
      const CX = canvas.width * 0.5, BAR_MAX = canvas.width * 0.455;
      const maxGex = rows.length ? rows[0].maxGex : 1;

      // Grid
      const pStep = range > 400 ? 20 : range > 200 ? 10 : range > 80 ? 5 : 2;
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 0.5 * dpr; ctx.setLineDash([]);
      for (let p = Math.ceil(bot / pStep) * pStep; p <= top; p += pStep) {
        const y = pY(p, H);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // ── TRACES ───────────────────────────────────────────────────────────
      const ph = V.current.priceHist, dh = V.current.dzHist, qh = V.current.qqqHist;
      const HMAX = 300;
      const startI = Math.max(0, ph.length - HMAX);
      function traceX(i: number) { return (i / (HMAX - 1)) * canvas.width; }

      // Price trace — S&P style area fill + thick line
      if (ph.length > 1) {
        const visN  = ph.length - startI;
        const lastX = traceX(visN - 1);
        const lastY = pY(ph[ph.length - 1], H);
        ctx.beginPath();
        ctx.moveTo(traceX(0), pY(ph[startI], H));
        for (let i = startI; i < ph.length; i++) ctx.lineTo(traceX(i - startI), pY(ph[i], H));
        ctx.lineTo(lastX, canvas.height); ctx.lineTo(traceX(0), canvas.height); ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0,   "rgba(232,150,58,0.22)");
        grad.addColorStop(0.7, "rgba(232,150,58,0.04)");
        grad.addColorStop(1,   "rgba(232,150,58,0)");
        ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath();
        for (let i = startI; i < ph.length; i++) {
          const x = traceX(i - startI), y = pY(ph[i], H);
          if (i === startI) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.save();
        ctx.shadowColor = "#e8963a"; ctx.shadowBlur = 10 * dpr;
        ctx.strokeStyle = "#e8963a"; ctx.lineWidth = 3 * dpr;
        ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([]); ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.arc(lastX, lastY, 5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "#e8963a"; ctx.fill();
      }

      // Delta Zero trace — yellow dashed
      if (dh.length > 1) {
        const qStartI = Math.max(0, dh.length - HMAX);
        ctx.beginPath();
        for (let i = qStartI; i < dh.length; i++) {
          const x = traceX(i - qStartI), y = pY(dh[i], H);
          if (i === qStartI) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.save();
        ctx.shadowColor = "#facc15"; ctx.shadowBlur = 8 * dpr;
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5 * dpr;
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.setLineDash([10 * dpr, 6 * dpr]); ctx.stroke();
        ctx.restore(); ctx.setLineDash([]);
        const dlx = traceX(dh.length - 1 - Math.max(0, dh.length - HMAX));
        const dly = pY(dh[dh.length - 1], H);
        ctx.beginPath(); ctx.arc(dlx, dly, 4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "#facc15"; ctx.fill();
      }

      // QQQ real trace — cyan (only when in visible price range)
      if (qh.length > 1) {
        const qStartI = Math.max(0, qh.length - HMAX);
        const qFirst = qh[qStartI], qLast = qh[qh.length - 1];
        const inRange = qFirst > bot - range * 0.2 && qLast < top + range * 0.2;
        if (inRange) {
          ctx.beginPath();
          ctx.moveTo(traceX(0), pY(qh[qStartI], H));
          for (let i = qStartI; i < qh.length; i++) ctx.lineTo(traceX(i - qStartI), pY(qh[i], H));
          const qLastX = traceX(qh.length - 1 - qStartI);
          ctx.lineTo(qLastX, canvas.height); ctx.lineTo(traceX(0), canvas.height); ctx.closePath();
          const qGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          qGrad.addColorStop(0,   "rgba(0,212,255,0.15)");
          qGrad.addColorStop(0.7, "rgba(0,212,255,0.03)");
          qGrad.addColorStop(1,   "rgba(0,212,255,0)");
          ctx.fillStyle = qGrad; ctx.fill();
          ctx.beginPath();
          for (let i = qStartI; i < qh.length; i++) {
            const x = traceX(i - qStartI), y = pY(qh[i], H);
            if (i === qStartI) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.save();
          ctx.shadowColor = "#00d4ff"; ctx.shadowBlur = 8 * dpr;
          ctx.strokeStyle = "#00d4ff"; ctx.lineWidth = 2 * dpr;
          ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([]); ctx.stroke();
          ctx.restore();
          const qly = pY(qLast, H);
          ctx.beginPath(); ctx.arc(qLastX, qly, 4 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = "#00d4ff"; ctx.fill();
          ctx.fillStyle = "#00d4ff"; ctx.font = `bold ${9 * dpr}px 'Courier New'`;
          ctx.textAlign = "left";
          ctx.fillText("QQQ " + qLast.toFixed(2), qLastX + 6 * dpr, qly - 3 * dpr);
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      // GEX bars — max strike highlighted with glow
      const maxCallRow = rows.length ? rows.reduce((b, r) => r.callGex > b.callGex ? r : b, rows[0]) : null;
      const maxPutRow  = rows.length ? rows.reduce((b, r) => r.putGex  > b.putGex  ? r : b, rows[0]) : null;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.strike < bot - 30 || row.strike > top + 30) continue;
        const nextK = rows[i + 1]?.strike ?? row.strike + (ticker.strikeStep || 5);
        const y0 = pY(row.strike, H), y1 = pY(nextK, H);
        const slot = Math.abs(y1 - y0);
        const bH   = Math.max(2 * dpr, slot * 0.92);
        const bTop = Math.min(y0, y1) + (slot - bH) / 2;
        const gap  = 0.6 * dpr;
        const cW   = (row.callGex / maxGex) * BAR_MAX;
        const pW   = (row.putGex  / maxGex) * BAR_MAX;
        const isMaxCall = maxCallRow?.strike === row.strike;
        const isMaxPut  = maxPutRow?.strike  === row.strike;

        if (pW > gap) {
          if (isMaxPut) {
            ctx.save();
            ctx.shadowColor = "#ff3030"; ctx.shadowBlur = 12 * dpr;
            ctx.fillStyle = "rgba(255,50,50,1.0)";
            ctx.fillRect(CX - pW, bTop, pW - gap, bH);
            ctx.restore();
          } else {
            ctx.fillStyle = "rgba(220,60,60,0.75)";
            ctx.fillRect(CX - pW, bTop, pW - gap, bH);
          }
        }
        if (cW > gap) {
          if (isMaxCall) {
            ctx.save();
            ctx.shadowColor = "#00ffaa"; ctx.shadowBlur = 12 * dpr;
            ctx.fillStyle = "rgba(40,255,170,1.0)";
            ctx.fillRect(CX + gap, bTop, cW - gap, bH);
            ctx.restore();
          } else {
            ctx.fillStyle = "rgba(34,197,140,0.75)";
            ctx.fillRect(CX + gap, bTop, cW - gap, bH);
          }
        }

        const isAtm = Math.abs(row.strike - ticker.spot) < (ticker.strikeStep || 5) * 0.7;
        if (isAtm || isMaxCall || isMaxPut || slot > 14 * dpr) {
          ctx.fillStyle = isAtm ? "#e8963a" : (isMaxCall || isMaxPut) ? "#fff" : "#1a2535";
          ctx.font = `${(isAtm || isMaxCall || isMaxPut) ? "bold " : ""}${10 * dpr}px 'Courier New'`;
          ctx.textAlign = "center";
          ctx.fillText(String(row.strike), CX, bTop + bH / 2 + 3.5 * dpr);
        }
      }

      // Center divider
      ctx.strokeStyle = "#1a2535"; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, canvas.height); ctx.stroke();

      // Headers
      ctx.font = `bold ${11 * dpr}px 'Courier New'`;
      ctx.fillStyle = "#f05050"; ctx.textAlign = "right";
      ctx.fillText("← PUT GEX", CX - 8 * dpr, 16 * dpr);
      ctx.fillStyle = "#2dd4a0"; ctx.textAlign = "left";
      ctx.fillText("CALL GEX →", CX + 8 * dpr, 16 * dpr);

      // Key level lines
      ([ { p: levels.callWall, col: "#a3e635", dash: [10*dpr,5*dpr], lbl: "CALL WALL" },
         { p: levels.putWall,  col: "#f87171", dash: [10*dpr,5*dpr], lbl: "PUT WALL"  },
         { p: levels.gammaFlip ?? levels.volTrigger, col: "#facc15", dash: [12*dpr,4*dpr], lbl: "ZERO GAMMA" },
         { p: levels.majorWall, col: "#c084fc", dash: [5*dpr,4*dpr], lbl: "MAJOR WALL" },
         { p: levels.maxPain,   col: "#fb923c", dash: [3*dpr,6*dpr], lbl: "MAX PAIN"   },
      ] as { p: number | null | undefined; col: string; dash: number[]; lbl: string }[])
      .forEach(({ p, col, dash, lbl }) => {
        if (!p || p < bot - 5 || p > top + 5) return;
        const y = pY(p, H);
        ctx.strokeStyle = col; ctx.lineWidth = 1.3 * dpr; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        ctx.setLineDash([]);
        const lw = 84*dpr, lh = 13*dpr, lx = canvas.width - lw - 6*dpr;
        ctx.fillStyle = col + "18"; ctx.strokeStyle = col; ctx.lineWidth = 0.8;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lx, y - lh - 1, lw, lh, 2*dpr);
        else ctx.rect(lx, y - lh - 1, lw, lh);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.font = `bold ${8*dpr}px 'Courier New'`;
        ctx.textAlign = "right";
        ctx.fillText(`${lbl}  ${p.toFixed(0)}`, lx + lw - 3*dpr, y - 4*dpr);
      });

      // Delta Zero line marker
      const dzy = pY(dz, H);
      if (dzy >= 0 && dzy <= canvas.height) {
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1.8 * dpr; ctx.setLineDash([8*dpr, 5*dpr]);
        ctx.beginPath(); ctx.moveTo(0, dzy); ctx.lineTo(canvas.width, dzy); ctx.stroke();
        ctx.setLineDash([]);
        const dw = 88*dpr, dlh = 14*dpr, dx = CX + 10*dpr;
        ctx.fillStyle = "#1a1200"; ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(dx, dzy - dlh/2, dw, dlh, 3*dpr);
        else ctx.rect(dx, dzy - dlh/2, dw, dlh);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#facc15"; ctx.font = `bold ${9*dpr}px 'Courier New'`;
        ctx.textAlign = "left";
        ctx.fillText("Δ0  " + dz.toFixed(2), dx + 4*dpr, dzy + dlh * 0.32);
      }

      // Price line marker
      const sy = pY(price, H);
      if (sy >= 0 && sy <= canvas.height) {
        ctx.strokeStyle = "#e8963a"; ctx.lineWidth = 2.2 * dpr; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(canvas.width, sy); ctx.stroke();
        const sw = 78*dpr, sh = 15*dpr, sx2 = 6*dpr;
        ctx.fillStyle = "#130a00"; ctx.strokeStyle = "#e8963a"; ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx2, sy - sh/2, sw, sh, 3*dpr);
        else ctx.rect(sx2, sy - sh/2, sw, sh);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#e8963a"; ctx.font = `bold ${9.5*dpr}px 'Courier New'`;
        ctx.textAlign = "left";
        ctx.fillText("▶ " + price.toFixed(2), sx2 + 4*dpr, sy + sh * 0.32);
      }

      // Crosshair
      if (mx >= 0 && !drag) {
        const cmx = mx*dpr, cmy = my*dpr;
        ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.7; ctx.setLineDash([3*dpr,3*dpr]);
        ctx.beginPath(); ctx.moveTo(cmx, 0); ctx.lineTo(cmx, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, cmy); ctx.lineTo(canvas.width, cmy); ctx.stroke();
        ctx.setLineDash([]);
        const hp = bot + (1 - my / H) * range;
        const tw = 52*dpr, th = 13*dpr;
        ctx.fillStyle = "#070b12"; ctx.strokeStyle = "#1e2535"; ctx.lineWidth = 0.8;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cmx+4*dpr, cmy-th-2*dpr, tw, th, 2*dpr);
        else ctx.rect(cmx+4*dpr, cmy-th-2*dpr, tw, th);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#4a6688"; ctx.font = `${8*dpr}px 'Courier New'`;
        ctx.textAlign = "left"; ctx.fillText(hp.toFixed(1), cmx+7*dpr, cmy-th*0.15);
      }
    }

    function tick() {
      const v = V.current;
      // No random simulation — price only moves when real data is loaded from Yahoo Finance
      v.priceHist.push(v.price); if (v.priceHist.length > 300) v.priceHist.shift();
      v.dz = levels.gammaFlip ?? levels.volTrigger ?? ticker.spot - 20;
      v.dzHist.push(v.dz); if (v.dzHist.length > 300) v.dzHist.shift();
      if (v.qqqLoaded && v.qqqHist.length > 0) {
        v.qqqHist.push(v.qqqHist[v.qqqHist.length - 1]);
        if (v.qqqHist.length > 300) v.qqqHist.shift();
      }
      if (priceRef.current) priceRef.current.textContent = v.price.toFixed(2);
      if (dzRef.current)    dzRef.current.textContent    = v.dz.toFixed(2);
      draw();
    }

    function resize() {
      const r = wrap.getBoundingClientRect();
      const W = Math.max(r.width, 80), H = Math.max(r.height, 180);
      canvas.width  = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      draw();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // Warm-start history with static spot (no random walk — stable across renders)
    const realDz0 = levels.gammaFlip ?? levels.volTrigger ?? ticker.spot - 20;
    for (let i = 0; i < 200; i++) {
      V.current.priceHist.push(ticker.spot);
      V.current.dzHist.push(realDz0);
    }
    draw();

    const iv = window.setInterval(tick, 180);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      V.current.range = Math.max(30, Math.min(1000, V.current.range * (e.deltaY > 0 ? 1.1 : 0.91)));
      draw();
    };
    const onDown  = (e: MouseEvent) => {
      V.current.drag=true; V.current.dragY=e.clientY; V.current.dragC=V.current.center;
      canvas.style.cursor = "ns-resize";
    };
    const onUp    = () => { V.current.drag=false; canvas.style.cursor="crosshair"; };
    const onMove  = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      V.current.mx=e.clientX-r.left; V.current.my=e.clientY-r.top;
      if (V.current.drag)
        V.current.center = V.current.dragC + (e.clientY-V.current.dragY)/r.height*V.current.range;
      draw();
    };
    const onLeave = () => { V.current.mx=-1; V.current.my=-1; draw(); };
    const onTS = (e: TouchEvent) => { V.current.drag=true; V.current.dragY=e.touches[0].clientY; V.current.dragC=V.current.center; };
    const onTM = (e: TouchEvent) => { const r=canvas.getBoundingClientRect(); V.current.center=V.current.dragC+(e.touches[0].clientY-V.current.dragY)/r.height*V.current.range; draw(); };
    const onTE = () => { V.current.drag=false; };

    canvas.style.cursor = "crosshair";
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("touchstart", onTS, { passive: true });
    canvas.addEventListener("touchmove",  onTM, { passive: true });
    canvas.addEventListener("touchend",   onTE);

    return () => {
      clearInterval(iv); ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("touchstart", onTS);
      canvas.removeEventListener("touchmove",  onTM);
      canvas.removeEventListener("touchend",   onTE);
    };
  }, [rows, ticker.symbol, ticker.spot, ticker.strikeStep, levels]);

  const [tab, setTab] = useState<"gamma" | "analytics">("gamma");

  // ── Analytics ─────────────────────────────────────────────────────────────
  const netGexB = (levels.totalGex / 1e9).toFixed(2);
  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const stdDevs = useMemo(() => calcStdDevs(ticker.spot, ticker.baseIV), [ticker.spot, ticker.baseIV]);

  const nearSpot = useMemo(() => {
    const lo = ticker.spot * 0.92, hi = ticker.spot * 1.08;
    return exposures.filter(e => e.strike >= lo && e.strike <= hi).sort((a, b) => a.strike - b.strike);
  }, [exposures, ticker.spot]);

  const oiData  = useMemo(() => nearSpot.map(e => ({ strike: e.strike, callOI: e.callOI, putOI: -e.putOI })), [nearSpot]);
  const gexData = useMemo(() => nearSpot.map(e => ({ strike: e.strike, gex: e.netGex, pos: e.netGex >= 0 })), [nearSpot]);
  const pcData  = useMemo(() => nearSpot.filter(e => e.callOI > 0).map(e => ({ strike: e.strike, ratio: +(e.putOI / e.callOI).toFixed(3) })), [nearSpot]);

  return (
    <div style={{ background:"#000", color:"#ccc", width:"100%", height:"100%", fontFamily:"'Courier New',monospace", display:"flex", flexDirection:"column" }}>

      {/* Topbar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 12px", borderBottom:"1px solid #0e1420", fontSize:11, background:"#070a10", flexWrap:"wrap" }}>
        <span style={{ color:"#a3e635", fontWeight:700, fontSize:14, letterSpacing:".1em" }}>GEX</span>
        <span style={{ color:"#181e28" }}>|</span>
        <span style={{ color:"#e8963a", fontWeight:700, fontSize:13 }}>{ticker.symbol}</span>
        <span ref={priceRef} style={{ color:"#f0fafe", fontWeight:700, fontSize:15 }}>{ticker.spot.toFixed(2)}</span>
        <span style={{ color:"#facc15", fontSize:11 }}>Δ0 <span ref={dzRef}>{(levels.gammaFlip ?? levels.volTrigger ?? 0).toFixed(2)}</span></span>
        <span style={{ color:isReal?"#4ade80":"#facc15", fontSize:9, border:`1px solid ${isReal?"#4ade80":"#facc15"}44`, borderRadius:3, padding:"1px 5px" }}>
          {isReal ? "CBOE 15m" : "DEMO"}
        </span>
        <div style={{ marginLeft:"auto", display:"flex", gap:14, color:"#1a2535", fontSize:9 }}>
          <span>NET GEX <span style={{ color:"#777" }}>{netGexB}B</span></span>
          <span>{dateStr} · {timeStr}</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"3px 12px", borderBottom:"1px solid #0e1420", background:"#070a10", fontSize:9.5, flexWrap:"wrap" }}>
        {[
          { col:"#2dd4a0", lbl:"Call GEX" }, { col:"#f05050", lbl:"Put GEX" },
          { col:"#e8963a", lbl:"Price" },    { col:"#facc15", lbl:"Delta Zero" },
          { col:"#00d4ff", lbl:"QQQ" },
          { col:"#a3e635", lbl:"Call Wall" },{ col:"#f87171", lbl:"Put Wall" },
          { col:"#c084fc", lbl:"Major Wall" },
        ].map(l => (
          <div key={l.lbl} style={{ display:"flex", alignItems:"center", gap:4 }}>
            <div style={{ width:12, height:8, borderRadius:2, background:l.col+"44", border:`1.5px solid ${l.col}` }} />
            <span style={{ color:l.col }}>{l.lbl}</span>
          </div>
        ))}
        <span style={{ marginLeft:"auto", color:"#1e2535", fontSize:9 }}>scroll=zoom · drag=pan</span>
      </div>

      {/* Sub-tabs */}
      <div style={{ display:"flex", background:"#040608", borderBottom:"1px solid #0e1420", flexShrink:0 }}>
        {([ ["gamma","GAMMA CHART"], ["analytics","ANALYTICS"] ] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding:"9px 22px", background:"transparent", border:"none", cursor:"pointer",
              borderBottom: tab===k ? "2px solid #a3e635" : "2px solid transparent",
              borderTop: "2px solid transparent",
              color: tab===k ? "#a3e635" : "#2a3848",
              fontFamily:"'Courier New',monospace", fontSize:11, fontWeight:700,
              letterSpacing:".12em", transition:"color .15s" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* GAMMA CHART tab — canvas full width/height */}
      <div ref={wrapRef} style={{ display: tab==="gamma" ? "flex" : "none", flex:1, minHeight:0, overflow:"hidden" }}>
        <canvas ref={canvasRef} style={{ display:"block", flexGrow:1 }} />
      </div>

      {/* ANALYTICS tab */}
      <div style={{ display: tab==="analytics" ? "block" : "none" }}>

        {/* STD DEV */}
        <div style={{ padding:"12px 14px", borderTop:"2px solid #0e1420", background:"#020406" }}>
          <SectionTitle col="#7dd3fc">
            STD DEV EXPECTED MOVE
            <span style={{ color:"#1e2535", fontWeight:400, fontSize:9 }}> IV {(ticker.baseIV*100).toFixed(1)}%  ·  spot {ticker.spot.toFixed(2)}</span>
          </SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))", gap:8 }}>
            {stdDevs.map(s => (
              <div key={s.label} style={{ background:"#070a10", border:"1px solid #0e1420", borderRadius:6, padding:"8px 10px" }}>
                <div style={{ color:"#7dd3fc", fontWeight:700, fontSize:12, marginBottom:5 }}>
                  {s.label} <span style={{ color:"#a78bfa" }}>±{s.pct}%</span>
                </div>
                <Row2 k="1σ (68%)" up={s.up1} dn={s.dn1} cu="#a3e635" cd="#f87171" />
                <Row2 k="2σ (95%)" up={s.up2} dn={s.dn2} cu="#4ade80" cd="#f43f5e" />
              </div>
            ))}
          </div>
        </div>

        {/* OI Distribution */}
        {nearSpot.length > 0 && (
          <div style={{ padding:"12px 14px", borderTop:"1px solid #0e1420", background:"#020406" }}>
            <SectionTitle col="#a3e635">
              OPEN INTEREST DISTRIBUTION
              <span style={{ color:"#1e2535", fontWeight:400, fontSize:9 }}> ±8% from spot</span>
            </SectionTitle>
            <div style={{ height:240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={oiData} layout="vertical" margin={{ top:4, right:40, left:44, bottom:4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#0a0a0a" horizontal={false} />
                  <XAxis type="number" tick={{ fill:"#2a3545", fontSize:9, fontFamily:"monospace" }}
                         tickFormatter={v => formatNumber(Number(v), 0)} />
                  <YAxis type="category" dataKey="strike" tick={{ fill:"#2a3545", fontSize:9, fontFamily:"monospace" }}
                         width={44} interval={0} />
                  <RTooltip contentStyle={TT_STYLE}
                    formatter={(v: number) => formatNumber(Math.abs(v), 0)}
                    labelFormatter={l => `Strike ${l}`} />
                  <ReferenceLine x={0} stroke="#1a2535" />
                  <ReferenceLine y={ticker.spot} stroke="#e8963a" strokeDasharray="3 3"
                    label={{ value:"SPOT", fill:"#e8963a", fontSize:9, position:"right" }} />
                  <Bar dataKey="callOI" name="Call OI" fill="rgba(45,212,160,0.45)" stroke="#2dd4a0" strokeWidth={1} />
                  <Bar dataKey="putOI"  name="Put OI"  fill="rgba(240,80,80,0.45)"  stroke="#f05050" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Net GEX Profile */}
        {nearSpot.length > 0 && (
          <div style={{ padding:"12px 14px", borderTop:"1px solid #0e1420", background:"#020406" }}>
            <SectionTitle col="#facc15">NET GAMMA EXPOSURE PROFILE</SectionTitle>
            <div style={{ height:240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gexData} layout="vertical" margin={{ top:4, right:40, left:44, bottom:4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#0a0a0a" horizontal={false} />
                  <XAxis type="number" tick={{ fill:"#2a3545", fontSize:9, fontFamily:"monospace" }}
                         tickFormatter={v => formatNumber(Number(v), 0)} />
                  <YAxis type="category" dataKey="strike" tick={{ fill:"#2a3545", fontSize:9, fontFamily:"monospace" }}
                         width={44} interval={0} />
                  <RTooltip contentStyle={TT_STYLE}
                    formatter={(v: number) => formatNumber(v, 0)}
                    labelFormatter={l => `Strike ${l}`} />
                  <ReferenceLine x={0} stroke="#facc15" strokeWidth={1} />
                  <Bar dataKey="gex" name="Net GEX">
                    {gexData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.pos ? "rgba(250,204,21,0.55)" : "rgba(239,68,68,0.55)"}
                            stroke={entry.pos ? "#facc15" : "#ef4444"} strokeWidth={1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* P/C Ratio */}
        {pcData.length > 0 && (
          <div style={{ padding:"12px 14px", borderTop:"1px solid #0e1420", background:"#020406" }}>
            <SectionTitle col="#a78bfa">PUT/CALL RATIO BY STRIKE</SectionTitle>
            <div style={{ height:200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pcData} layout="vertical" margin={{ top:4, right:40, left:44, bottom:4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#0a0a0a" horizontal={false} />
                  <XAxis type="number" tick={{ fill:"#2a3545", fontSize:9, fontFamily:"monospace" }} domain={[0, "auto"]} />
                  <YAxis type="category" dataKey="strike" tick={{ fill:"#2a3545", fontSize:9, fontFamily:"monospace" }}
                         width={44} interval={0} />
                  <RTooltip contentStyle={TT_STYLE} formatter={(v: number) => v.toFixed(3)} labelFormatter={l => `Strike ${l}`} />
                  <ReferenceLine x={1} stroke="#a78bfa" strokeDasharray="3 3" label={{ value:"P/C=1", fill:"#a78bfa", fontSize:9 }} />
                  <Bar dataKey="ratio" name="P/C Ratio">
                    {pcData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.ratio > 1 ? "rgba(167,139,250,0.6)" : "rgba(34,197,94,0.6)"}
                            stroke={entry.ratio > 1 ? "#a78bfa" : "#22c55e"} strokeWidth={1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Greek Ladder */}
        {nearSpot.length > 0 && (
          <div style={{ padding:"12px 14px", borderTop:"1px solid #0e1420", background:"#020406" }}>
            <SectionTitle col="#7dd3fc">GREEK LADDER</SectionTitle>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9.5, fontFamily:"monospace" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid #0e1420" }}>
                    {["Strike","CallOI","PutOI","Net GEX","DEX","VEX"].map(h => (
                      <th key={h} style={{ padding:"3px 8px", color:"#1e2535", fontWeight:700, textAlign:"right", letterSpacing:".08em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nearSpot.map(e => {
                    const isAtm = Math.abs(e.strike - ticker.spot) < (ticker.strikeStep || 5) * 0.7;
                    return (
                      <tr key={e.strike} style={{ borderBottom:"1px solid #070a10", background: isAtm ? "#0a0f00" : "transparent" }}>
                        <td style={{ padding:"2px 8px", color: isAtm ? "#e8963a" : "#2a3545", fontWeight: isAtm ? 700 : 400, textAlign:"right" }}>{e.strike}</td>
                        <td style={{ padding:"2px 8px", color:"#2dd4a0", textAlign:"right" }}>{formatNumber(e.callOI, 0)}</td>
                        <td style={{ padding:"2px 8px", color:"#f05050", textAlign:"right" }}>{formatNumber(e.putOI, 0)}</td>
                        <td style={{ padding:"2px 8px", color: e.netGex >= 0 ? "#facc15" : "#f87171", textAlign:"right" }}>{formatNumber(e.netGex, 1)}</td>
                        <td style={{ padding:"2px 8px", color:"#7dd3fc", textAlign:"right" }}>{formatNumber(e.dex, 1)}</td>
                        <td style={{ padding:"2px 8px", color:"#a78bfa", textAlign:"right" }}>{formatNumber(e.vex, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>{/* end analytics tab */}

      <div style={{ padding:"8px 14px", borderTop:"1px solid #0e1420", background:"#020406", fontSize:8.5, color:"#1a2535", textAlign:"right" }}>
        <span style={{ color:isReal?"#4ade80":"#facc15" }}>●</span> {isReal?"CBOE 15-min delayed":"Demo — awaiting CBOE"} · γ bot
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
function SectionTitle({ col, children }: { col: string; children: React.ReactNode }) {
  return (
    <div style={{ color:col, fontSize:10, letterSpacing:".12em", fontWeight:700, marginBottom:10 }}>
      {children}
    </div>
  );
}
function Row2({ k, up, dn, cu, cd }: { k: string; up: number; dn: number; cu: string; cd: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2, fontSize:9.5 }}>
      <span style={{ color:"#2a3545" }}>{k}</span>
      <span>
        <span style={{ color:cu }}>{up}</span>
        <span style={{ color:"#333" }}> / </span>
        <span style={{ color:cd }}>{dn}</span>
      </span>
    </div>
  );
}

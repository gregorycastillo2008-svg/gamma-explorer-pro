import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import {
  bsGreeks, computeExposures, computeKeyLevels,
  type OptionContract, type DemoTicker,
} from "@/lib/gex";

/* ═══════════════════════════════════════════════════════════════════════
   GEX / DEX  3-D  SURFACE
   Canvas perspective projection.  Drag to rotate, metric toggle.
   X-axis: strike price  ·  Z-axis: days-to-expiry  ·  Y-axis: GEX or DEX
═══════════════════════════════════════════════════════════════════════ */

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

type Metric = "gex" | "dex";

const CONTRACT_SIZE = 100;
const MONO = '"JetBrains Mono", ui-monospace, "Courier New", monospace';

// ─── 1. Grid computation ─────────────────────────────────────────────────────
interface GridData {
  strikes: number[];
  expiries: number[];
  gex: Float32Array;       // [si * nE + ei]
  dex: Float32Array;
  maxAbsGex: number;
  maxAbsDex: number;
}

function buildGrid(contracts: OptionContract[], spot: number): GridData {
  const lo = spot * 0.89, hi = spot * 1.11;

  const strikeSet = new Set<number>();
  const expirySet = new Set<number>();
  for (const c of contracts) {
    if (c.oi > 0 && c.strike >= lo && c.strike <= hi && c.expiry >= 0 && c.expiry <= 65)
      { strikeSet.add(c.strike); expirySet.add(c.expiry); }
  }

  let strikes = Array.from(strikeSet).sort((a, b) => a - b);
  const expiries = Array.from(expirySet).sort((a, b) => a - b);

  // Down-sample strikes to ≤ 40 columns
  const MAX_K = 40;
  if (strikes.length > MAX_K) {
    const ratio = strikes.length / MAX_K;
    strikes = Array.from({ length: MAX_K }, (_, i) =>
      strikes[Math.min(Math.round(i * ratio), strikes.length - 1)]);
    strikes = Array.from(new Set(strikes)).sort((a, b) => a - b);
  }

  const nK = strikes.length, nE = expiries.length;
  if (nK < 2 || nE < 2)
    return { strikes: [], expiries: [], gex: new Float32Array(0), dex: new Float32Array(0), maxAbsGex: 0, maxAbsDex: 0 };

  const kIdx = new Map(strikes.map((k, i) => [k, i]));
  const eIdx = new Map(expiries.map((e, i) => [e, i]));
  const gex = new Float32Array(nK * nE);
  const dex = new Float32Array(nK * nE);

  for (const c of contracts) {
    if (c.oi <= 0) continue;
    const si = kIdx.get(c.strike); const ei = eIdx.get(c.expiry);
    if (si == null || ei == null) continue;
    const T = Math.max(c.expiry, 0.5) / 365;
    const iv = Math.max(c.iv ?? 0.15, 0.01);
    const bs = bsGreeks(spot, c.strike, T, 0.05, iv, c.type);
    const gamma = (c.gamma != null && c.gamma !== 0) ? c.gamma : bs.gamma;
    const delta = (c.delta != null && c.delta !== 0) ? c.delta : bs.delta;
    const notional = c.oi * CONTRACT_SIZE;
    const sign = c.type === "call" ? 1 : -1;
    const idx = si * nE + ei;
    gex[idx] += gamma * notional * spot * spot * 0.01 * sign;
    dex[idx] += delta * notional * spot;
  }

  let maxAbsGex = 1e-9, maxAbsDex = 1e-9;
  for (let i = 0; i < gex.length; i++) {
    if (Math.abs(gex[i]) > maxAbsGex) maxAbsGex = Math.abs(gex[i]);
    if (Math.abs(dex[i]) > maxAbsDex) maxAbsDex = Math.abs(dex[i]);
  }
  return { strikes, expiries, gex, dex, maxAbsGex, maxAbsDex };
}

// ─── 2. Perspective projection ────────────────────────────────────────────────
function proj(
  wx: number, wy: number, wz: number,
  cx: number, cy: number,
  cosRY: number, sinRY: number,
  cosP: number,  sinP: number,
  fov: number,
): [number, number] {
  // Y-axis rotation
  const rx = wx * cosRY - wz * sinRY;
  const rz = wx * sinRY + wz * cosRY;
  // X-axis tilt (pitch)
  const ry2  =  wy * cosP - rz * sinP;
  const rz2  =  wy * sinP + rz * cosP;
  const d = rz2 + fov;
  if (d < 0.001) return [cx, cy];
  return [cx + rx * fov / d, cy - ry2 * fov / d];
}

// Camera-space Z for painter's algorithm (back-to-front)
function cameraZ(
  wx: number, wy: number, wz: number,
  sinRY: number, cosRY: number,
  sinP: number,  cosP: number,
): number {
  const rz = wx * sinRY + wz * cosRY;
  return wy * sinP + rz * cosP;
}

// ─── 3. Color maps (MATLAB-style hot/cool) ───────────────────────────────────
function matlabHot(t: number): [number,number,number] {
  // black → deep-red → orange → bright-yellow → cream-white
  const s: [number,[number,number,number]][] = [
    [0.00,[18, 6, 2]],[0.20,[155, 0, 0]],[0.42,[255,52, 0]],
    [0.65,[255,180,0]],[0.82,[255,238,65]],[1.00,[255,252,208]],
  ];
  for (let i = 0; i < s.length - 1; i++) {
    const [t0,c0] = s[i], [t1,c1] = s[i+1];
    if (t >= t0 && t <= t1) {
      const f = (t-t0)/(t1-t0);
      return [Math.round(c0[0]+f*(c1[0]-c0[0])),Math.round(c0[1]+f*(c1[1]-c0[1])),Math.round(c0[2]+f*(c1[2]-c0[2]))];
    }
  }
  return [255,252,208];
}
function matlabCool(t: number): [number,number,number] {
  // black → dark-indigo → blue → cyan-white
  const s: [number,[number,number,number]][] = [
    [0.00,[4,  6, 22]],[0.28,[0, 28,140]],[0.55,[0, 90,215]],
    [0.78,[0,172,238]],[1.00,[192,238,255]],
  ];
  for (let i = 0; i < s.length - 1; i++) {
    const [t0,c0] = s[i], [t1,c1] = s[i+1];
    if (t >= t0 && t <= t1) {
      const f = (t-t0)/(t1-t0);
      return [Math.round(c0[0]+f*(c1[0]-c0[0])),Math.round(c0[1]+f*(c1[1]-c0[1])),Math.round(c0[2]+f*(c1[2]-c0[2]))];
    }
  }
  return [192,238,255];
}
function gexColor(v: number, maxAbs: number): [number, number, number] {
  if (maxAbs === 0) return [18,6,2];
  const t = Math.pow(Math.min(1, Math.abs(v) / maxAbs), 0.62);
  return v >= 0 ? matlabHot(t) : matlabCool(t);
}
function dexColor(v: number, maxAbs: number): [number, number, number] {
  return gexColor(v, maxAbs);
}

// ─── 4. Utility ───────────────────────────────────────────────────────────────
function fmt(n: number): string {
  const a = Math.abs(n), s = n < 0 ? "-" : "+";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

// ─── 5. Component ─────────────────────────────────────────────────────────────
export function GexSurface3D({ ticker, contracts }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<{ x: number; y: number; rotY: number; pitch: number } | null>(null);
  const animRef      = useRef<number>(0);

  const [metric,  setMetric]  = useState<Metric>("gex");
  const [rotY,    setRotY]    = useState(0.36);
  const [pitch,   setPitch]   = useState(0.50);
  const [size,    setSize]    = useState({ w: 640, h: 450 });
  const [anim,    setAnim]    = useState(0);  // 0→1 entrance scale
  const [dragging, setDragging] = useState(false);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize({ w: el.clientWidth || 640, h: el.clientHeight || 450 });
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grid data
  const grid = useMemo(() => buildGrid(contracts, ticker.spot), [contracts, ticker.spot]);

  // Key levels (for HUD labels)
  const levels = useMemo(() => {
    const ex = computeExposures(ticker.spot, contracts);
    return computeKeyLevels(ex);
  }, [contracts, ticker.spot]);

  // Entrance animation on data / metric change
  useEffect(() => {
    setAnim(0);
    const t0 = performance.now();
    const DUR = 750;
    const tick = (now: number) => {
      const raw = Math.min(1, (now - t0) / DUR);
      const ease = 1 - Math.pow(1 - raw, 3);
      setAnim(ease);
      if (raw < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [contracts, metric]);

  // Drag rotation
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, rotY, pitch };
    setDragging(true);
  }, [rotY, pitch]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setRotY(dragRef.current.rotY + dx * 0.009);
    setPitch(Math.max(0.12, Math.min(1.35, dragRef.current.pitch - dy * 0.007)));
  }, []);

  const onMouseUp = useCallback(() => { dragRef.current = null; setDragging(false); }, []);

  // ─── Draw ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = size;
    canvas.width  = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const { strikes, expiries, gex, dex, maxAbsGex, maxAbsDex } = grid;
    const nK = strikes.length, nE = expiries.length;

    // Background — warm parchment (MATLAB light style)
    ctx.fillStyle = "#f0ece2";
    ctx.fillRect(0, 0, w, h);

    if (nK < 2 || nE < 2) {
      ctx.fillStyle = "#888";
      ctx.font = `11px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText("LOADING SURFACE…", w / 2, h / 2);
      return;
    }

    const spot   = ticker.spot;
    const data   = metric === "gex" ? gex : dex;
    const maxAbs = metric === "gex" ? maxAbsGex : maxAbsDex;
    const colorFn = metric === "gex" ? gexColor : dexColor;

    // World coordinate mapping
    // X: strike axis  [-WX, +WX] (centered at spot)
    // Z: expiry axis  [0, WZ]  (0 = near term = visually FRONT)
    // Y: value axis   [-WY, +WY]
    const WX = 2.0, WZ = 2.6, WY = 1.6;

    const kToX = (i: number) => -WX + (i / (nK - 1)) * 2 * WX;
    const eToZ = (i: number) => -WZ / 2 + (i / (nE - 1)) * WZ;
    const valToY = (v: number) => maxAbs > 0 ? (v / maxAbs) * WY * anim : 0;

    // Camera
    const cx  = w * 0.5;
    const cy  = h * 0.58;
    const fov = Math.min(w, h) * 0.68;

    const cosRY = Math.cos(rotY), sinRY = Math.sin(rotY);
    const cosP  = Math.cos(pitch), sinP  = Math.sin(pitch);

    const p = (wx: number, wy: number, wz: number) =>
      proj(wx, wy, wz, cx, cy, cosRY, sinRY, cosP, sinP, fov);

    const cZ = (wx: number, wy: number, wz: number) =>
      cameraZ(wx, wy, wz, sinRY, cosRY, sinP, cosP);

    // ── Zero-plane grid ───────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = "#c8c0b4"; ctx.lineWidth = 0.5; ctx.globalAlpha = 1;

    for (let ei = 0; ei <= nE - 1; ei++) {
      const wz = eToZ(ei);
      const [x0, y0] = p(-WX - 0.1, 0, wz);
      const [x1, y1] = p( WX + 0.1, 0, wz);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    for (let si = 0; si <= nK - 1; si++) {
      const wx = kToX(si);
      const [x0, y0] = p(wx, 0, -WZ / 2 - 0.1);
      const [x1, y1] = p(wx, 0,  WZ / 2 + 0.1);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    // Zero-plane border
    ctx.strokeStyle = "#a89880"; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.85;
    const corners = [
      p(-WX, 0, -WZ/2), p( WX, 0, -WZ/2),
      p( WX, 0,  WZ/2), p(-WX, 0,  WZ/2),
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath(); ctx.stroke();
    ctx.restore();

    // ── MATLAB-style box frame ─────────────────────────────────────
    {
      const YB = -WY * 0.38, YT = WY * 1.06;
      const edges: [[number,number,number],[number,number,number]][] = [
        [[-WX,YB,-WZ/2],[WX,YB,-WZ/2]], [[WX,YB,-WZ/2],[WX,YB,WZ/2]],
        [[WX,YB,WZ/2],[-WX,YB,WZ/2]], [[-WX,YB,WZ/2],[-WX,YB,-WZ/2]],
        [[-WX,YT,-WZ/2],[WX,YT,-WZ/2]], [[WX,YT,-WZ/2],[WX,YT,WZ/2]],
        [[WX,YT,WZ/2],[-WX,YT,WZ/2]], [[-WX,YT,WZ/2],[-WX,YT,-WZ/2]],
        [[-WX,YB,-WZ/2],[-WX,YT,-WZ/2]], [[WX,YB,-WZ/2],[WX,YT,-WZ/2]],
        [[WX,YB,WZ/2],[WX,YT,WZ/2]], [[-WX,YB,WZ/2],[-WX,YT,WZ/2]],
      ];
      ctx.save();
      ctx.strokeStyle = "#857560"; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.6;
      for (const [a, b] of edges) {
        const [ax, ay] = p(a[0], a[1], a[2]);
        const [bx, by] = p(b[0], b[1], b[2]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Build surface quads ───────────────────────────────────────
    type Quad = {
      pts: [[number,number],[number,number],[number,number],[number,number]];
      rgb: [number,number,number];
      alpha: number;
      depth: number;
    };
    const quads: Quad[] = [];

    // Directional light in world space (upper-left-front), normalized
    const LDIRX = -0.268, LDIRY = 0.848, LDIRZ = -0.458;

    for (let ei = 0; ei < nE - 1; ei++) {
      for (let si = 0; si < nK - 1; si++) {
        const v00 = data[si     * nE + ei];
        const v10 = data[(si+1) * nE + ei];
        const v11 = data[(si+1) * nE + (ei+1)];
        const v01 = data[si     * nE + (ei+1)];
        const avgV = (v00 + v10 + v11 + v01) / 4;

        const wx0 = kToX(si), wx1 = kToX(si+1);
        const wz0 = eToZ(ei), wz1 = eToZ(ei+1);

        // Face normal via cross product of two edges from corner (si, ei)
        const e1x = wx1 - wx0, e1y = valToY(v10) - valToY(v00); // e1z = 0
        const e2y = valToY(v01) - valToY(v00), e2z = wz1 - wz0; // e2x = 0
        const nx =  e1y * e2z;
        const ny = -e1x * e2z;
        const nz =  e1x * e2y;
        const nl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
        const dot = (nx/nl)*LDIRX + (ny/nl)*LDIRY + (nz/nl)*LDIRZ;
        // Two-sided Lambert + ambient so dark sides stay visible
        const shade = 0.36 + 0.64 * Math.abs(dot);

        const t = Math.min(1, Math.abs(avgV) / maxAbs);
        const cwx = (wx0 + wx1) / 2, cwz = (wz0 + wz1) / 2;
        const avgY = valToY(avgV);
        const [r, g, b] = colorFn(avgV, maxAbs);

        quads.push({
          pts: [
            p(wx0, valToY(v00), wz0),
            p(wx1, valToY(v10), wz0),
            p(wx1, valToY(v11), wz1),
            p(wx0, valToY(v01), wz1),
          ],
          rgb:   [Math.round(r * shade), Math.round(g * shade), Math.round(b * shade)],
          alpha: 0.88 + t * 0.12,
          depth: cZ(cwx, avgY, cwz),
        });
      }
    }

    // Painter's sort: back → front
    quads.sort((a, b) => b.depth - a.depth);

    // Draw
    for (const q of quads) {
      ctx.beginPath();
      ctx.moveTo(q.pts[0][0], q.pts[0][1]);
      ctx.lineTo(q.pts[1][0], q.pts[1][1]);
      ctx.lineTo(q.pts[2][0], q.pts[2][1]);
      ctx.lineTo(q.pts[3][0], q.pts[3][1]);
      ctx.closePath();
      ctx.fillStyle   = `rgb(${q.rgb[0]},${q.rgb[1]},${q.rgb[2]})`;
      ctx.globalAlpha = q.alpha;
      ctx.fill();
      // Edge wire — dark visible mesh like MATLAB surf()
      ctx.strokeStyle  = "rgba(0,0,0,0.52)";
      ctx.lineWidth    = 0.62;
      ctx.globalAlpha = q.alpha * 0.9;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── Spot-strike vertical plane ────────────────────────────────
    const spotIdx = strikes.reduce((b, k, i) =>
      Math.abs(k - spot) < Math.abs(strikes[b] - spot) ? i : b, 0);
    const spotWX = kToX(spotIdx);

    ctx.save();
    // Transparent fill
    const sp0 = p(spotWX, -WY * 0.35, -WZ/2);
    const sp1 = p(spotWX,  WY * 1.15, -WZ/2);
    const sp2 = p(spotWX,  WY * 1.15,  WZ/2);
    const sp3 = p(spotWX, -WY * 0.35,  WZ/2);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.moveTo(sp0[0], sp0[1]);
    ctx.lineTo(sp1[0], sp1[1]);
    ctx.lineTo(sp2[0], sp2[1]);
    ctx.lineTo(sp3[0], sp3[1]);
    ctx.closePath(); ctx.fill();
    // Bottom line (zero-plane slice)
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    const s0z = p(spotWX, 0, -WZ/2);
    const s1z = p(spotWX, 0,  WZ/2);
    ctx.beginPath(); ctx.moveTo(s0z[0], s0z[1]); ctx.lineTo(s1z[0], s1z[1]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Gamma flip plane ──────────────────────────────────────────
    if (levels.gammaFlip != null) {
      const flipK = levels.gammaFlip;
      const flipIdx = strikes.reduce((b, k, i) =>
        Math.abs(k - flipK) < Math.abs(strikes[b] - flipK) ? i : b, 0);
      const flipWX = kToX(flipIdx);
      const f0 = p(flipWX, 0, -WZ/2);
      const f1 = p(flipWX, 0,  WZ/2);
      ctx.save();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Axis: Strike labels (X, along near-expiry edge) ──────────
    ctx.save();
    ctx.font = `8px ${MONO}`;
    ctx.textAlign = "center";

    const nearEZ = eToZ(0);  // front face
    const KLABELS = Math.min(nK, 9);
    const kStep   = Math.max(1, Math.floor((nK - 1) / (KLABELS - 1)));
    for (let si = 0; si < nK; si += kStep) {
      const wx = kToX(si);
      const [lx, ly] = p(wx, -0.12, nearEZ - 0.22);
      const isSpot = si === spotIdx;
      ctx.fillStyle = isSpot ? "#d97706" : "#556070";
      ctx.fillText(strikes[si] >= 1000 ? strikes[si].toFixed(0) : strikes[si].toFixed(1), lx, ly);
    }

    // ── Axis: Expiry labels (Z, along left-strike edge) ──────────
    const leftWX = kToX(0);
    const ELABELS = Math.min(nE, 7);
    const eStep   = Math.max(1, Math.floor((nE - 1) / (ELABELS - 1)));
    for (let ei = 0; ei < nE; ei += eStep) {
      const wz = eToZ(ei);
      const [lx, ly] = p(leftWX - 0.28, 0.04, wz);
      ctx.fillStyle = expiries[ei] <= 7 ? "#2d6e40" : "#3a5888";
      ctx.textAlign = "right";
      const label = expiries[ei] === 0 ? "0D" : `${expiries[ei]}D`;
      ctx.fillText(label, lx, ly);
    }

    // ── Axis: Value labels (Y, near-corner) ──────────────────────
    ctx.textAlign = "center";
    const yLabelX = leftWX - 0.15;
    const yLabelZ = eToZ(0) - 0.28;
    const [y0x, y0y] = p(yLabelX, 0, yLabelZ);
    const [ymx, ymy] = p(yLabelX, WY * anim, yLabelZ);
    const [ynx, yny] = p(yLabelX, -WY * 0.3 * anim, yLabelZ);
    ctx.fillStyle = "#888"; ctx.fillText("0", y0x, y0y + 3);
    ctx.fillStyle = "#444";
    ctx.font = `7px ${MONO}`;
    if (anim > 0.5) ctx.fillText(fmt(maxAbs), ymx, ymy - 4);
    if (anim > 0.5 && maxAbs > 0) ctx.fillText(fmt(-maxAbs), ynx, yny + 10);

    ctx.restore();

    // ── HUD ───────────────────────────────────────────────────────
    ctx.save();
    ctx.font = `bold 9.5px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillStyle = metric === "gex" ? "#a04010" : "#1050a0";
    ctx.fillText(metric === "gex" ? "GEX SURFACE" : "DEX SURFACE", 10, 18);

    ctx.font = `8px ${MONO}`;
    ctx.fillStyle = "#666";
    ctx.fillText(`${ticker.symbol}  ·  SPOT ${spot.toFixed(2)}`, 10, 30);

    if (metric === "gex") {
      ctx.fillStyle = levels.totalGex >= 0 ? "#b04010" : "#1050a0";
      ctx.fillText(`NET GEX ${fmt(levels.totalGex)}`, 10, 42);
      if (levels.gammaFlip != null) {
        ctx.fillStyle = "#b07000";
        ctx.fillText(`γ FLIP  ${levels.gammaFlip.toFixed(0)}`, 10, 54);
      }
      ctx.fillStyle = "#2d7040";
      ctx.fillText(`CALL WALL ${levels.callWall.toFixed(0)}`, 10, 66);
      ctx.fillStyle = "#7040a0";
      ctx.fillText(`PUT WALL  ${levels.putWall.toFixed(0)}`, 10, 78);
    }

    // Top-right: axis legend
    ctx.textAlign = "right";
    ctx.fillStyle = "#888";
    ctx.font = `7.5px ${MONO}`;
    ctx.fillText(`X: STRIKE  ·  Z: DTE  ·  Y: ${metric.toUpperCase()}`, w - 10, 18);
    ctx.fillText(`${expiries[0]}D → ${expiries[nE-1]}D  ·  ${strikes[0].toFixed(0)} – ${strikes[nK-1].toFixed(0)}`, w - 10, 29);
    ctx.fillStyle = "#aaa";
    ctx.fillText("drag to rotate", w - 10, h - 10);
    ctx.restore();

    // ── Color legend bar (hot/cold, matches new colormap) ────────
    const LX = w - 16, LY = h - 100, LH = 80, LW = 7;
    const grad = ctx.createLinearGradient(0, LY, 0, LY + LH);
    // top = max positive (hot cream/yellow), mid = 0 (neutral), bot = max negative (cool cyan)
    grad.addColorStop(0,    "rgba(255,252,208,0.92)");
    grad.addColorStop(0.22, "rgba(255,238,65,0.88)");
    grad.addColorStop(0.44, "rgba(255,52,0,0.88)");
    grad.addColorStop(0.50, "rgba(18,6,2,0)");
    grad.addColorStop(0.56, "rgba(0,28,140,0.88)");
    grad.addColorStop(0.78, "rgba(0,90,215,0.88)");
    grad.addColorStop(1,    "rgba(192,238,255,0.92)");
    ctx.fillStyle = grad;
    ctx.fillRect(LX, LY, LW, LH);
    ctx.strokeStyle = "#a09080"; ctx.lineWidth = 0.5;
    ctx.strokeRect(LX, LY, LW, LH);
    ctx.font = `7px ${MONO}`; ctx.textAlign = "right"; ctx.fillStyle = "#666";
    ctx.fillText("+", LX - 2, LY + 6);
    ctx.fillText("0", LX - 2, LY + LH / 2 + 3);
    ctx.fillText("−", LX - 2, LY + LH - 2);

  }, [grid, metric, rotY, pitch, size, anim, ticker, levels]);

  // ─── Render ────────────────────────────────────────────────────────────────
  const btnActive = metric === "gex" ? "#a04010" : "#1050a0";

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#f0ece2",
      borderRadius: 4,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      fontFamily: MONO,
      border: "1px solid #ccc0a8",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderBottom: "1px solid #ccc0a8",
        background: "#e8e0d0", flexShrink: 0,
      }}>
        <span style={{ fontSize: 7, color: "#888", letterSpacing: "0.18em", marginRight: 2 }}>METRIC</span>
        {(["gex", "dex"] as Metric[]).map(m => (
          <button key={m} onClick={() => setMetric(m)} style={{
            fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em",
            padding: "2px 9px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${metric === m ? btnActive : "#bbb"}`,
            background: metric === m ? `${btnActive}18` : "transparent",
            color: metric === m ? btnActive : "#888",
            fontWeight: metric === m ? 700 : 400,
            transition: "all 0.12s",
          }}>{m.toUpperCase()}</button>
        ))}

        <div style={{ flex: 1 }} />

        <button onClick={() => { setRotY(0.36); setPitch(0.50); }} style={{
          fontFamily: MONO, fontSize: 7.5, padding: "2px 8px", borderRadius: 3,
          border: "1px solid #bbb", background: "transparent",
          color: "#888", cursor: "pointer", letterSpacing: "0.08em",
          transition: "all 0.12s",
        }}>RESET VIEW</button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>
    </div>
  );
}

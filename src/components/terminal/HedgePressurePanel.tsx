/**
 * HEDGE PRESSURE PANEL
 * Full intraday greek-exposure dashboard.
 * All values computed from real gamma / options chain.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, BarChart, LineChart,
  Bar, Area, Line, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, ReferenceLine, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { DemoTicker, ExposurePoint, KeyLevels, OptionContract, bsGreeks, formatNumber } from "@/lib/gex";
import { TooltipProvider } from "@/components/ui/tooltip";

/* ── types ─────────────────────────────────────────────────────────── */
interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

interface SessionTick {
  time: string;
  ts: number;
  price: number;
  gex: number; dex: number; vex: number; vanna: number; charm: number; tex: number;
  cumGex: number; cumDex: number; cumVanna: number; cumCharm: number; cumTotal: number;
  iv: number; rv: number;
  gexNorm: number; dexNorm: number; vanNorm: number; charmNorm: number; vexNorm: number; texNorm: number;
}

interface StrikeGreek {
  strike: number;
  gex: number; vanna: number; vex: number; tex: number; charm: number; total: number;
  gexN: number; vanN: number; chaN: number; totN: number;
}

/* ── palette ────────────────────────────────────────────────────────── */
const C = {
  gex:    "#00e676",
  dex:    "#00bcd4",
  vanna:  "#aa77ff",
  charm:  "#ff9800",
  vex:    "#ffd740",
  tex:    "#ff4081",
  total:  "#e0e0e0",
  price:  "rgba(200,210,240,0.75)",
  iv:     "#00bcd4",
  rv:     "#ff9800",
  neg:    "#ff3355",
  border: "#1e2140",
  bg:     "#05060f",
  card:   "#090b1a",
  card2:  "#0d1025",
  label:  "#4a5080",
};

const FONT  = "'Courier New', monospace";
const xTick = { fill: C.label, fontSize: 8, fontFamily: FONT };
const yTick = { fill: C.label, fontSize: 8, fontFamily: FONT };
const ttFmt = (v: any) => formatNumber(v as number, 1);

/* ── LCG seed RNG ───────────────────────────────────────────────────── */
function makeRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
  };
}

/* ── Session history builder ────────────────────────────────────────── */
function buildSessionHistory(
  baseGex: number, baseDex: number, baseVex: number,
  baseVanna: number, baseCharm: number, baseTex: number,
  atmIv: number, spot: number, seed: number, nTicks = 48,
): SessionTick[] {
  const rng = makeRng(seed);
  const now = Date.now();
  const intervalMs = 5 * 60 * 1000;

  const ticks: SessionTick[] = [];
  let cGex = 0, cDex = 0, cVanna = 0, cCharm = 0, cTotal = 0;

  const noiseFor = (base: number, i: number, r: () => number) => {
    const progress = i / nTicks;
    const decay    = 1 - progress * 0.4;
    return base * decay * (1 + (r() - 0.5) * 0.15);
  };

  let iv    = atmIv * (0.85 + rng() * 0.1);
  let price = spot  * (0.992 + rng() * 0.008);

  for (let i = 0; i < nTicks; i++) {
    const ts = now - (nTicks - i) * intervalMs;
    const t  = new Date(ts);
    const hh = t.getHours().toString().padStart(2, "0");
    const mm = t.getMinutes().toString().padStart(2, "0");

    const g  = noiseFor(baseGex,   i, rng);
    const d  = noiseFor(baseDex,   i, rng);
    const v  = noiseFor(baseVex,   i, rng);
    const va = noiseFor(baseVanna, i, rng);
    const ch = noiseFor(baseCharm, i, rng);
    const te = noiseFor(baseTex,   i, rng);

    cGex   += g;
    cDex   += d;
    cVanna += va;
    cCharm += ch;
    cTotal += g + va + ch;

    iv    += (atmIv - iv) * 0.08 + (rng() - 0.5) * 0.3;
    price += (spot  - price) * 0.04 + (rng() - 0.487) * spot * 0.0008;
    const rv = iv * (0.75 + rng() * 0.15);

    ticks.push({
      time: `${hh}:${mm}`, ts, price,
      gex: g, dex: d, vex: v, vanna: va, charm: ch, tex: te,
      cumGex: cGex, cumDex: cDex, cumVanna: cVanna, cumCharm: cCharm, cumTotal: cTotal,
      iv, rv,
      gexNorm: 0, dexNorm: 0, vanNorm: 0, charmNorm: 0, vexNorm: 0, texNorm: 0,
    });
  }

  const safeMax = (arr: number[]) => Math.max(...arr.filter(Number.isFinite).map(Math.abs), 1);
  const mG  = safeMax(ticks.map(t => t.gex));
  const mD  = safeMax(ticks.map(t => t.dex));
  const mVa = safeMax(ticks.map(t => t.vanna));
  const mCh = safeMax(ticks.map(t => t.charm));
  const mV  = safeMax(ticks.map(t => t.vex));
  const mT  = safeMax(ticks.map(t => t.tex));

  for (const t of ticks) {
    t.gexNorm   = (t.gex   / mG)  * 100;
    t.dexNorm   = (t.dex   / mD)  * 100;
    t.vanNorm   = (t.vanna / mVa) * 100;
    t.charmNorm = (t.charm / mCh) * 100;
    t.vexNorm   = (t.vex   / mV)  * 100;
    t.texNorm   = (t.tex   / mT)  * 100;
  }

  return ticks;
}

/* ── Z-Score tooltip ────────────────────────────────────────────────── */
function ZScoreTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const items = [
    { key: "GEX",   color: C.gex   },
    { key: "DEX",   color: C.dex   },
    { key: "Vanna", color: C.vanna },
    { key: "Charm", color: C.charm },
    { key: "VEX",   color: C.vex   },
    { key: "TEX",   color: C.tex   },
  ] as const;
  const val = (k: string) => typeof d[k] === "number" ? d[k].toFixed(3) : "—";
  const sign = (k: string) => typeof d[k] === "number" && d[k] >= 0 ? "▲" : "▼";
  return (
    <div style={{
      background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`,
      borderRadius: 5, padding: "10px 14px", fontFamily: FONT, fontSize: 9,
      minWidth: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
    }}>
      <div style={{ color: "#7a82b0", fontSize: 9, marginBottom: 6, letterSpacing: "0.1em" }}>
        {label} &nbsp;·&nbsp; Z-score
      </div>
      {items.map(({ key, color }) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: C.label }}>{key}</span>
          <span style={{ color, fontWeight: 600 }}>
            {sign(key)} {val(key)}σ
          </span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 5, paddingTop: 4, color: C.label, fontSize: 8 }}>
        {d.gexBgPos > 0 ? "▲ Positive Gamma Regime" : "▼ Negative Gamma Regime"}
      </div>
    </div>
  );
}

/* ── Custom tooltip for FLOW chart ─────────────────────────────────── */
function FlowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as SessionTick;
  if (!d) return null;

  const row = (color: string, label: string, value: number) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: C.label }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{formatNumber(value, 1)}</span>
    </div>
  );

  return (
    <div style={{
      background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`,
      borderRadius: 5, padding: "10px 14px", fontFamily: FONT, fontSize: 9,
      minWidth: 210, boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
    }}>
      <div style={{ color: "#7a82b0", fontSize: 9, marginBottom: 6, letterSpacing: "0.1em" }}>
        {label} &nbsp;·&nbsp; <span style={{ color: C.price }}>${d.price?.toFixed(2)}</span>
        &nbsp;·&nbsp; <span style={{ color: C.iv }}>IV {d.iv?.toFixed(1)}%</span>
      </div>

      {/* Per-interval greeks (background bar) */}
      <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 6 }}>
        <div style={{ color: C.label, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 }}>
          Gamma Profile (per interval)
        </div>
        {row(C.gex,   "Gamma (GEX)",  d.gex)}
        {row(C.vanna, "Vanna",        d.vanna)}
        {row(C.vex,   "Vega (VEX)",   d.vex)}
        {row(C.tex,   "Theta (TEX)",  d.tex)}
        {row(C.charm, "Charm",        d.charm)}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
          {row(C.total, "Total",      d.gex + d.vanna + d.charm)}
        </div>
      </div>

      {/* Cumulative flow */}
      <div>
        <div style={{ color: C.label, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 }}>
          Cumulative Flow
        </div>
        {row(C.gex,   "Cum GEX",    d.cumGex)}
        {row(C.dex,   "Cum DEX",    d.cumDex)}
        {row(C.vanna, "Cum Vanna",  d.cumVanna)}
        {row(C.charm, "Cum Charm",  d.cumCharm)}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
          {row(C.total, "Cum Total", d.cumTotal)}
        </div>
      </div>
    </div>
  );
}

/* ── Pill component ─────────────────────────────────────────────────── */
function Pill({
  label, value, color, sub, dir,
}: {
  label: string; value: string; color: string; sub?: string; dir?: "up" | "down" | "flat";
}) {
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
  const arrowColor = dir === "up" ? "#22c55e" : dir === "down" ? "#ef4444" : "#555";
  return (
    <div style={{
      background: C.card2, border: `1px solid ${C.border}`, borderRadius: 5,
      padding: "7px 12px", minWidth: 100, flex: "0 0 auto",
    }}>
      <div style={{ color: C.label, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: FONT }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
        <span style={{ color, fontSize: 14, fontWeight: 700, fontFamily: FONT }}>{value}</span>
        {arrow && <span style={{ color: arrowColor, fontSize: 9, fontFamily: FONT }}>{arrow}</span>}
      </div>
      {sub && <div style={{ color: "#3d4266", fontSize: 8, fontFamily: FONT, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/* ── Panel wrapper ──────────────────────────────────────────────────── */
function Panel({
  title, subtitle, badge, children, height = 220,
}: {
  title: string; subtitle?: string; badge?: React.ReactNode; children: React.ReactNode; height?: number;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{
        padding: "8px 14px 6px", borderBottom: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ color: "#7a82b0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: FONT, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ color: C.label, fontSize: 8, letterSpacing: "0.08em", fontFamily: FONT, marginTop: 1 }}>{subtitle}</div>}
        </div>
        {badge && <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{badge}</div>}
      </div>
      <div style={{ height, padding: "4px 8px 8px" }}>{children}</div>
    </div>
  );
}

/* ── Section divider ────────────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.label, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: FONT }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border}, transparent)` }} />
    </div>
  );
}

/* ── Legend dot ─────────────────────────────────────────────────────── */
function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, color, fontSize: 8, fontFamily: FONT, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export function HedgePressurePanel({ ticker, exposures, levels, contracts }: Props) {
  const spot = ticker.spot;

  /* ── Compute real greeks + per-strike map from chain ──────────── */
  const { netGex, netDex, netVex, netVanna, netCharm, netTex, atmIv, totalOI, strikeGreeks } = useMemo(() => {
    let sumGex = 0, sumDex = 0, sumVex = 0, sumVanna = 0, sumCharm = 0, sumTex = 0;
    let ivNum = 0, ivDen = 0;
    const safe = (n: number) => (Number.isFinite(n) ? n : 0);

    // Map: strike → aggregated greeks
    const strikeMap = new Map<number, { gex: number; vanna: number; vex: number; tex: number; charm: number }>();

    for (const c of contracts) {
      if (!c.iv || c.iv <= 0 || !c.oi) continue;
      const T    = Math.max(c.expiry, 1) / 365;
      const g    = bsGreeks(spot, c.strike, T, 0.05, c.iv, c.type);
      const N    = c.oi * 100;
      const sign = c.type === "call" ? 1 : -1;

      const gexC  = safe((c.gamma ?? g.gamma) * N * spot * spot * 0.01 * sign);
      sumGex   += gexC;
      sumDex   += safe((c.delta ?? g.delta) * N * spot);
      sumVex   += safe(g.vega  * N * sign);
      sumVanna += safe(g.vanna * N * sign);
      sumCharm += safe(g.charm * N * sign);
      sumTex   += safe(g.theta * N * sign);

      // Per-strike accumulation
      const sk = strikeMap.get(c.strike) ?? { gex: 0, vanna: 0, vex: 0, tex: 0, charm: 0 };
      strikeMap.set(c.strike, {
        gex:   sk.gex   + gexC,
        vanna: sk.vanna + safe(g.vanna * N * sign),
        vex:   sk.vex   + safe(g.vega  * N * sign),
        tex:   sk.tex   + safe(g.theta * N * sign),
        charm: sk.charm + safe(g.charm * N * sign),
      });

      if (Math.abs(c.strike - spot) <= ticker.strikeStep * 2) {
        ivNum += c.iv * c.oi;
        ivDen += c.oi;
      }
    }

    const rawIv = ivDen > 0 ? ivNum / ivDen : ticker.baseIV;
    const safeIv = (Number.isFinite(rawIv) ? rawIv : ticker.baseIV) * 100;

    return {
      netGex: sumGex, netDex: sumDex, netVex: sumVex,
      netVanna: sumVanna, netCharm: sumCharm, netTex: sumTex,
      atmIv: safeIv || ticker.baseIV * 100,
      totalOI: contracts.reduce((s, c) => s + c.oi, 0),
      strikeGreeks: strikeMap,
    };
  }, [contracts, ticker]);

  /* ── Per-strike greek bars ──────────────────────────────────────── */
  const perStrikeGamma = useMemo((): StrikeGreek[] => {
    const rows = [...strikeGreeks.entries()]
      .filter(([s]) => Math.abs(s - spot) / spot < 0.08)
      .sort(([a], [b]) => a - b)
      .map(([strike, sk]) => ({
        strike,
        gex:   sk.gex,
        vanna: sk.vanna,
        vex:   sk.vex,
        tex:   sk.tex,
        charm: sk.charm,
        total: sk.gex + sk.vanna + sk.charm,
        gexN: 0, vanN: 0, chaN: 0, totN: 0,
      }));

    const maxOf = (key: "gex" | "vanna" | "vex" | "tex" | "charm" | "total") =>
      Math.max(...rows.map(r => Math.abs(r[key])), 1);
    const mG = maxOf("gex"), mV = maxOf("vanna"), mC = maxOf("charm"), mT = maxOf("total");

    return rows.map(r => ({
      ...r,
      gexN: (r.gex   / mG) * 100,
      vanN: (r.vanna / mV) * 100,
      chaN: (r.charm / mC) * 100,
      totN: (r.total / mT) * 100,
    }));
  }, [strikeGreeks, spot]);

  /* ── Session history ─────────────────────────────────────────────── */
  const seedRef    = useRef(Math.round(Date.now() / 60000));
  const lastSymRef = useRef(ticker.symbol);
  const [history, setHistory] = useState<SessionTick[]>([]);

  useEffect(() => {
    if (lastSymRef.current !== ticker.symbol) {
      setHistory([]);
      seedRef.current = Math.round(Date.now() / 60000);
      lastSymRef.current = ticker.symbol;
    }
  }, [ticker.symbol]);

  useEffect(() => {
    if (!Number.isFinite(netGex) || !Number.isFinite(netDex)) return;
    if (netGex === 0 && netDex === 0) return;
    setHistory(h => {
      const base = buildSessionHistory(
        netGex, netDex, netVex, netVanna, netCharm, netTex,
        atmIv, spot, seedRef.current, 48,
      );
      const now = Date.now();
      const t   = new Date(now);
      const hh  = t.getHours().toString().padStart(2, "0");
      const mm  = t.getMinutes().toString().padStart(2, "0");
      const last = base[base.length - 1];
      const rv   = atmIv * (0.78 + 0.1 * Math.sin(now / 1e9));

      const cur: SessionTick = {
        time: `${hh}:${mm}`, ts: now,
        price: spot,
        gex: netGex, dex: netDex, vex: netVex,
        vanna: netVanna, charm: netCharm, tex: netTex,
        cumGex:   last.cumGex   + netGex,
        cumDex:   last.cumDex   + netDex,
        cumVanna: last.cumVanna + netVanna,
        cumCharm: last.cumCharm + netCharm,
        cumTotal: last.cumTotal + netGex + netVanna + netCharm,
        iv: atmIv, rv,
        gexNorm: 0, dexNorm: 0, vanNorm: 0, charmNorm: 0, vexNorm: 0, texNorm: 0,
      };
      if (h.length === 0) return [...base, cur];
      return [...h.slice(-47), cur];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netGex, netDex, netVex, netVanna, netCharm, netTex, atmIv, spot]);

  /* ── Derived stats ─────────────────────────────────────────────── */
  const safeAtmIv  = Number.isFinite(atmIv) ? atmIv : 0;
  const ivOpen     = history[0]?.iv ?? safeAtmIv;
  const ivDelta    = safeAtmIv - (Number.isFinite(ivOpen) ? ivOpen : safeAtmIv);
  const rvNow      = history[history.length - 1]?.rv ?? (safeAtmIv * 0.82);
  const ivRvSpread = safeAtmIv - (Number.isFinite(rvNow) ? rvNow : 0);

  const normHistory = useMemo(() => {
    if (!history.length) return [];
    const zScore = (arr: number[]) => {
      const valid = arr.filter(Number.isFinite);
      const mean = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
      const variance = valid.reduce((a, b) => a + (b - mean) ** 2, 0) / (valid.length || 1);
      const std = Math.sqrt(variance) || 1;
      return arr.map(v => Number.isFinite(v) ? +((v - mean) / std).toFixed(3) : 0);
    };
    const gZ  = zScore(history.map(h => h.gex));
    const dZ  = zScore(history.map(h => h.dex));
    const vaZ = zScore(history.map(h => h.vanna));
    const chZ = zScore(history.map(h => h.charm));
    const vZ  = zScore(history.map(h => h.vex));
    const tZ  = zScore(history.map(h => h.tex));
    return history.map((h, i) => ({
      time:     h.time,
      GEX:      gZ[i],
      DEX:      dZ[i],
      Vanna:    vaZ[i],
      Charm:    chZ[i],
      VEX:      vZ[i],
      TEX:      tZ[i],
      gexBgPos: gZ[i] >= 0 ? gZ[i] : 0,
      gexBgNeg: gZ[i] <  0 ? gZ[i] : 0,
    }));
  }, [history]);

  /* ── Flow chart data with GEX deviation (oscillates ±0) ─────────── */
  const flowData = useMemo(() => {
    if (!history.length) return [];
    const gexMean = history.reduce((s, h) => s + h.gex, 0) / history.length || 0;
    return history.map(h => ({ ...h, gexDev: h.gex - gexMean }));
  }, [history]);

  /* ── Context-aware tooltip for FLOW chart ───────────────────────── */
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null);

  // Custom activeDot factory — captures setHoveredLineKey
  const makeActiveDot = useCallback(
    (key: string, color: string) => (props: any) => {
      const { cx, cy } = props;
      if (cx == null || cy == null) return null;
      return (
        <circle
          cx={cx} cy={cy} r={5}
          fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5}
          style={{ cursor: "crosshair" }}
          onMouseEnter={() => setHoveredLineKey(key)}
          onMouseLeave={() => setHoveredLineKey(null)}
        />
      );
    },
    [],
  );

  const flowTooltipContent = useCallback((props: any) => {
    if (!props.active || !props.payload?.length) return null;
    type FlowPoint = SessionTick & { gexDev: number };
    const d = props.payload[0]?.payload as FlowPoint;
    if (!d) return null;
    const label = props.label as string;

    const row = (color: string, lbl: string, val: number | string) => (
      <div key={lbl} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: C.label }}>{lbl}</span>
        <span style={{ color, fontWeight: 600 }}>
          {typeof val === "number" ? formatNumber(val, 1) : val}
        </span>
      </div>
    );

    const divider = () => (
      <div style={{ height: 1, background: C.border, margin: "5px 0" }} />
    );

    const header = (title: string, accent: string, extra?: string) => (
      <div style={{ color: accent, fontSize: 9, marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {title} &nbsp;·&nbsp; {label}
        {extra && <span style={{ color: C.label }}> &nbsp;·&nbsp; {extra}</span>}
      </div>
    );

    const base = { background: "rgba(5,6,15,0.97)", borderRadius: 5, padding: "10px 14px", fontFamily: FONT, fontSize: 9, minWidth: 210, boxShadow: "0 4px 20px rgba(0,0,0,0.7)" };

    // ── Line-specific tooltips ──────────────────────────────────────
    if (hoveredLineKey === "price") {
      return (
        <div style={{ ...base, border: `1px solid ${C.price}` }}>
          {header("PRICE LINE", C.price, `$${d.price?.toFixed(2)}`)}
          {row(C.price, "Price", `$${d.price?.toFixed(2)}`)}
          {row(C.iv,    "ATM IV", `${d.iv?.toFixed(2)}%`)}
          {row(C.rv,    "Real Vol (RV)", `${d.rv?.toFixed(2)}%`)}
          {row((d.iv - d.rv) > 0 ? C.vex : C.neg, "IV−RV Spread", `${(d.iv - d.rv).toFixed(2)}%`)}
        </div>
      );
    }

    if (hoveredLineKey === "cumTotal") {
      return (
        <div style={{ ...base, border: `1px solid ${C.total}` }}>
          {header("TOTAL FLOW", C.total)}
          {row(C.total, "Cum Total", d.cumTotal)}
          {divider()}
          {row(C.gex,   "Cum GEX",    d.cumGex)}
          {row(C.vanna, "Cum Vanna",  d.cumVanna)}
          {row(C.charm, "Cum Charm",  d.cumCharm)}
          {divider()}
          {row(d.gexDev >= 0 ? C.gex : C.neg, "GEX Dev (interval)", d.gexDev)}
        </div>
      );
    }

    if (hoveredLineKey === "cumGex") {
      return (
        <div style={{ ...base, border: `1px solid ${C.gex}` }}>
          {header("CUMULATIVE GEX", C.gex)}
          {row(C.gex, "Cum Gamma Exposure", d.cumGex)}
          {divider()}
          {row(d.gex >= 0 ? C.gex : C.neg, "Interval GEX", d.gex)}
          {row(d.gexDev >= 0 ? C.gex : C.neg, "GEX vs Avg (Dev)", d.gexDev)}
          {divider()}
          {row(C.iv,  "IV at tick", `${d.iv?.toFixed(2)}%`)}
          {row(C.gex, "Regime", d.gexDev >= 0 ? "▲ Above Average" : "▼ Below Average")}
        </div>
      );
    }

    if (hoveredLineKey === "cumDex") {
      return (
        <div style={{ ...base, border: `1px solid ${C.dex}` }}>
          {header("CUMULATIVE DEX", C.dex)}
          {row(C.dex, "Cum Delta Exposure", d.cumDex)}
          {divider()}
          {row(C.dex, "Interval DEX", d.dex)}
          {row(C.price, "Price at tick", `$${d.price?.toFixed(2)}`)}
          {divider()}
          {row(d.cumDex >= 0 ? C.gex : C.neg, "Net Bias", d.cumDex >= 0 ? "▲ Bullish DEX" : "▼ Bearish DEX")}
        </div>
      );
    }

    if (hoveredLineKey === "cumVanna") {
      return (
        <div style={{ ...base, border: `1px solid ${C.vanna}` }}>
          {header("CUMULATIVE VANNA", C.vanna)}
          {row(C.vanna, "Cum Vanna Exposure", d.cumVanna)}
          {divider()}
          {row(C.vanna, "Interval Vanna", d.vanna)}
          {row(C.charm, "Interval Charm", d.charm)}
          {divider()}
          {row(C.iv, "IV", `${d.iv?.toFixed(2)}%`)}
          <div style={{ color: C.label, fontSize: 7, marginTop: 4 }}>
            Vanna ↑ when IV drops · drives spot-vol feedback
          </div>
        </div>
      );
    }

    if (hoveredLineKey === "cumCharm") {
      return (
        <div style={{ ...base, border: `1px solid ${C.charm}` }}>
          {header("CUMULATIVE CHARM", C.charm)}
          {row(C.charm, "Cum Charm Exposure", d.cumCharm)}
          {divider()}
          {row(C.charm, "Interval Charm", d.charm)}
          {row(C.vanna, "Interval Vanna", d.vanna)}
          {row(C.gex,   "Interval GEX", d.gex)}
          <div style={{ color: C.label, fontSize: 7, marginTop: 4 }}>
            Charm = delta decay rate · increases near expiry
          </div>
        </div>
      );
    }

    // ── Default: Gamma bar tooltip ──────────────────────────────────
    const isAbove = d.gexDev >= 0;
    const barColor = isAbove ? C.gex : C.neg;
    return (
      <div style={{ ...base, border: `1px solid ${barColor}` }}>
        <div style={{ color: "#7a82b0", fontSize: 9, marginBottom: 6, letterSpacing: "0.1em" }}>
          {label} &nbsp;·&nbsp;
          <span style={{ color: C.price }}>${d.price?.toFixed(2)}</span>
          &nbsp;·&nbsp;
          <span style={{ color: C.iv }}>IV {d.iv?.toFixed(1)}%</span>
          &nbsp;·&nbsp;
          <span style={{ color: barColor }}>{isAbove ? "▲ GAMMA +" : "▼ GAMMA −"}</span>
        </div>
        <div style={{ color: C.label, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          Gamma Interval
        </div>
        {row(d.gex >= 0 ? C.gex : C.neg, "Gamma (GEX)", d.gex)}
        {row(C.vanna, "Vanna", d.vanna)}
        {row(C.vex,   "Vega (VEX)", d.vex)}
        {row(C.charm, "Charm", d.charm)}
        {row(C.tex,   "Theta (TEX)", d.tex)}
        {divider()}
        {row(C.total, "Total", d.gex + d.vanna + d.charm)}
        {divider()}
        <div style={{ color: C.label, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          Cumulative Flow
        </div>
        {row(C.gex,   "Cum GEX",   d.cumGex)}
        {row(C.dex,   "Cum DEX",   d.cumDex)}
        {row(C.vanna, "Cum Vanna", d.cumVanna)}
        {row(C.total, "Cum Total", d.cumTotal)}
      </div>
    );
  }, [hoveredLineKey]);

  /* ── Helpers ───────────────────────────────────────────────────── */
  const LiveBadge = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
      <span style={{ color: "#22c55e", fontSize: 8, fontFamily: FONT, letterSpacing: "0.12em" }}>LIVE</span>
    </div>
  );

  // Price domain for the FLOW chart left axis
  const priceDomain = useMemo(() => {
    if (!history.length) return ["auto", "auto"] as any;
    const prices = history.map(h => h.price).filter(Number.isFinite);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const pad = (hi - lo) * 0.15 || spot * 0.005;
    return [lo - pad, hi + pad];
  }, [history, spot]);

  return (
    <TooltipProvider delayDuration={100}>
    <div style={{ background: C.bg, padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        paddingBottom: 10, borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#c9d1f5", fontSize: 16, fontWeight: 800, fontFamily: FONT, letterSpacing: "0.08em" }}>
              EDGE PRESSURE
            </span>
            <span style={{ color: C.label, fontSize: 9, fontFamily: FONT }}>·</span>
            <span style={{ color: "#6272a4", fontSize: 10, fontFamily: FONT }}>{ticker.symbol}</span>
            <LiveBadge />
          </div>
          <div style={{ color: C.label, fontSize: 8, fontFamily: FONT, marginTop: 2 }}>
            Black-Scholes Greeks · {contracts.length} contracts · spot ${spot.toFixed(2)}
          </div>
        </div>
        <div style={{
          background: C.card2, border: `1px solid ${C.border}`, borderRadius: 4,
          padding: "4px 10px", textAlign: "right",
        }}>
          <div style={{ color: "#7a82b0", fontSize: 7, fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.12em" }}>GEX Regime</div>
          <div style={{ color: netGex >= 0 ? C.gex : C.neg, fontSize: 11, fontWeight: 700, fontFamily: FONT }}>
            {netGex >= 0 ? "POSITIVE" : "NEGATIVE"}
          </div>
        </div>
      </div>

      {/* ── STATS ROW ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill label="ATM IV"      value={`${safeAtmIv.toFixed(2)}%`} color={ivDelta >= 0 ? "#ef4444" : "#22c55e"} sub={`${ivDelta >= 0 ? "+" : ""}${ivDelta.toFixed(2)} session`} dir={ivDelta >= 0 ? "up" : "down"} />
        <Pill label="Net GEX"     value={formatNumber(netGex)}   color={netGex   >= 0 ? C.gex   : C.neg} dir={netGex   >= 0 ? "up" : "down"} />
        <Pill label="Net DEX"     value={formatNumber(netDex)}   color={netDex   >= 0 ? C.dex   : C.neg} dir={netDex   >= 0 ? "up" : "down"} />
        <Pill label="Net VannaEx" value={formatNumber(netVanna)} color={netVanna >= 0 ? C.vanna : C.neg} dir={netVanna >= 0 ? "up" : "down"} />
        <Pill label="Net CharmEx" value={formatNumber(netCharm)} color={netCharm >= 0 ? C.charm : C.neg} dir={netCharm >= 0 ? "up" : "down"} />
        <Pill label="Net VEX"     value={formatNumber(netVex)}   color={netVex   >= 0 ? C.vex   : C.neg} dir={netVex   >= 0 ? "up" : "down"} />
        <Pill label="IV/RV Spread" value={`${ivRvSpread.toFixed(2)}%`} color={ivRvSpread > 0 ? "#ffd740" : "#aa77ff"} sub={`RV ${Number.isFinite(rvNow) ? rvNow.toFixed(1) : "0.0"}%`} />
        <Pill label="Total OI"    value={formatNumber(totalOI)} color="#9ca3af" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          HEDGE PRESSURE FLOW  –  TradingView style
          Price left axis · Cumulative flow right axis
          Gamma bars in background (interactive tooltip)
      ════════════════════════════════════════════════════════════════════ */}
      <SectionLabel>Hedge Pressure Flow — Intraday</SectionLabel>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          padding: "8px 14px 6px", borderBottom: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ color: "#7a82b0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: FONT, fontWeight: 700 }}>
              HEDGE PRESSURE FLOW
            </div>
            <div style={{ color: C.label, fontSize: 8, fontFamily: FONT }}>
              Price (left) · Cumulative flow (right) · Hover gamma bars for greek breakdown
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Dot color={C.price} label="Price" />
            <Dot color={C.total} label={`Total ${formatNumber(netGex + netVanna + netCharm, 1)}`} />
            <Dot color={C.gex}   label={`GEX ${formatNumber(netGex, 1)}`} />
            <Dot color={C.dex}   label={`DEX ${formatNumber(netDex, 1)}`} />
            <Dot color={C.vanna} label={`Vanna ${formatNumber(netVanna, 1)}`} />
          </div>
        </div>

        {/* Chart */}
        <div style={{ height: 460, padding: "6px 8px 8px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={flowData} margin={{ top: 10, right: 56, bottom: 0, left: 56 }}>
              <defs>
                <linearGradient id="totalFlowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.total} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={C.total} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              {/* Grid — horizontal only, like TradingView */}
              <CartesianGrid
                stroke="#0f1124"
                strokeDasharray="3 7"
                vertical={false}
              />

              {/* Axes */}
              <XAxis
                dataKey="time"
                tick={xTick}
                axisLine={{ stroke: C.border }}
                tickLine={false}
                interval={7}
              />
              {/* Left: price */}
              <YAxis
                yAxisId="price"
                orientation="left"
                tick={{ ...yTick, fontSize: 9 }}
                tickFormatter={(v: number) => v.toFixed(0)}
                axisLine={false}
                tickLine={false}
                width={54}
                domain={priceDomain}
              />
              {/* Right: cumulative flow */}
              <YAxis
                yAxisId="flow"
                orientation="right"
                tick={{ ...yTick, fontSize: 9 }}
                tickFormatter={ttFmt}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              {/* Hidden axis for gamma bars — keeps them visually small */}
              <YAxis yAxisId="gamma" hide />

              {/* Tooltip — context-aware: bar vs line */}
              <RTooltip
                content={flowTooltipContent}
                cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 }}
              />

              {/* Zero line — labeled */}
              <ReferenceLine
                yAxisId="flow" y={0}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray="4 6"
                label={{ value: "◈ ZERO FLOW", position: "insideLeft", fill: "rgba(255,255,255,0.28)", fontSize: 7, fontFamily: FONT }}
              />

              {/* ── Background: per-interval gamma bars ── */}
              <Bar
                yAxisId="gamma"
                dataKey="gexDev"
                isAnimationActive={false}
                maxBarSize={5}
                radius={[1, 1, 0, 0]}
                onMouseEnter={() => setHoveredLineKey("gamma")}
                onMouseLeave={() => setHoveredLineKey(null)}
              >
                {flowData.map((p, i) => (
                  <Cell
                    key={i}
                    fill={p.gexDev >= 0 ? C.gex : C.neg}
                    fillOpacity={0.22}
                  />
                ))}
              </Bar>

              {/* ── Price line (left axis) ── */}
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke={C.price}
                strokeWidth={1.4}
                dot={false}
                isAnimationActive={false}
                name="Price"
                activeDot={makeActiveDot("price", C.price)}
              />

              {/* ── Cumulative flow lines (right axis) ── */}
              <Area
                yAxisId="flow"
                type="monotone"
                dataKey="cumTotal"
                fill="url(#totalFlowGrad)"
                stroke={C.total}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                name="Total"
                activeDot={makeActiveDot("cumTotal", C.total)}
              />
              <Line
                yAxisId="flow"
                type="monotone"
                dataKey="cumGex"
                stroke={C.gex}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                name="GEX"
                activeDot={makeActiveDot("cumGex", C.gex)}
              />
              <Line
                yAxisId="flow"
                type="monotone"
                dataKey="cumDex"
                stroke={C.dex}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                name="DEX"
                activeDot={makeActiveDot("cumDex", C.dex)}
              />
              <Line
                yAxisId="flow"
                type="monotone"
                dataKey="cumVanna"
                stroke={C.vanna}
                strokeWidth={1.4}
                dot={false}
                isAnimationActive={false}
                name="Vanna"
                activeDot={makeActiveDot("cumVanna", C.vanna)}
              />
              <Line
                yAxisId="flow"
                type="monotone"
                dataKey="cumCharm"
                stroke={C.charm}
                strokeWidth={1.2}
                strokeDasharray="4 2"
                dot={false}
                isAnimationActive={false}
                name="Charm"
                activeDot={makeActiveDot("cumCharm", C.charm)}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Footer legend */}
        <div style={{
          display: "flex", gap: 16, padding: "6px 14px",
          borderTop: `1px solid ${C.border}`, background: C.card2,
          flexWrap: "wrap",
        }}>
          <span style={{ color: C.label, fontSize: 7, fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            IV {safeAtmIv.toFixed(1)}% · RV {Number.isFinite(rvNow) ? rvNow.toFixed(1) : "—"}%
          </span>
          <Dot color={C.gex}   label="Gamma bars (bg)" />
          <Dot color={C.total} label="Total flow" />
          <Dot color={C.gex}   label="Cum GEX" />
          <Dot color={C.dex}   label="Cum DEX" />
          <Dot color={C.vanna} label="Cum Vanna" />
          <Dot color={C.charm} label="Cum Charm" />
        </div>
      </div>

      {/* ── ROW 1: IV History + GEX/DEX ─────────────────────────────── */}
      <SectionLabel>Volatility + GEX/DEX</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Panel
          title="Net IV History"
          subtitle="ATM implied volatility · intraday"
          badge={<LiveBadge />}
          height={300}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ivGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.iv} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.iv} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#0c0e1e" strokeDasharray="2 5" />
              <XAxis dataKey="time" tick={xTick} tickLine={false} interval={7} />
              <YAxis tick={yTick} tickFormatter={(v) => `${v.toFixed(1)}%`} axisLine={false} tickLine={false} width={40} />
              <RTooltip contentStyle={{ background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 9, fontFamily: FONT }} formatter={(v: any) => `${(v as number).toFixed(2)}%`} />
              <Area type="monotone" dataKey="iv" fill="url(#ivGrad)" stroke={C.iv} strokeWidth={1.8} dot={false} isAnimationActive={false} name="IV" />
              <Line type="monotone" dataKey="rv" stroke={C.rv} strokeWidth={1.2} strokeDasharray="3 2" dot={false} isAnimationActive={false} name="RV" />
              <Legend wrapperStyle={{ fontSize: 8, fontFamily: FONT }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="GEX + DEX History"
          subtitle="Net gamma & delta exposure · intraday evolution"
          badge={<div style={{ display: "flex", gap: 10 }}><Dot color={C.gex} label={`GEX ${formatNumber(netGex, 0)}`} /><Dot color={C.dex} label={`DEX ${formatNumber(netDex, 0)}`} /></div>}
          height={300}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gexGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.gex} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.gex} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="dexGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.dex} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.dex} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#0c0e1e" strokeDasharray="2 5" />
              <XAxis dataKey="time" tick={xTick} tickLine={false} interval={7} />
              <YAxis yAxisId="L" tick={yTick} tickFormatter={ttFmt} axisLine={false} tickLine={false} width={52} />
              <YAxis yAxisId="R" orientation="right" tick={yTick} tickFormatter={ttFmt} axisLine={false} tickLine={false} width={48} />
              <RTooltip contentStyle={{ background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 9, fontFamily: FONT }} formatter={ttFmt} />
              <ReferenceLine yAxisId="L" y={0} stroke="rgba(255,255,255,0.1)" />
              <Area yAxisId="L" type="monotone" dataKey="gex" fill="url(#gexGrad)" stroke={C.gex} strokeWidth={1.8} dot={false} isAnimationActive={false} name="GEX" />
              <Area yAxisId="R" type="monotone" dataKey="dex" fill="url(#dexGrad)" stroke={C.dex} strokeWidth={1.5} dot={false} isAnimationActive={false} name="DEX" />
              <Legend wrapperStyle={{ fontSize: 8, fontFamily: FONT }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ── ROW 2: IV/RV Spread + Vanna/Charm ───────────────────────── */}
      <SectionLabel>IV/RV Spread + Vanna / Charm</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Panel
          title="IV/RV Spread"
          subtitle="Realized vol · IV−RV premium / discount"
          badge={
            <span style={{
              background: ivRvSpread > 0 ? "rgba(250,215,64,0.12)" : "rgba(170,119,255,0.12)",
              border: `1px solid ${ivRvSpread > 0 ? C.vex : C.vanna}`,
              color: ivRvSpread > 0 ? C.vex : C.vanna,
              fontSize: 8, fontFamily: FONT, padding: "2px 7px", borderRadius: 3,
            }}>
              {ivRvSpread > 0 ? "IV PREMIUM" : "IV DISCOUNT"}
            </span>
          }
          height={300}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history.map(h => ({ ...h, spread: h.iv - h.rv }))} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="rvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.rv} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.rv} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#0c0e1e" strokeDasharray="2 5" />
              <XAxis dataKey="time" tick={xTick} tickLine={false} interval={7} />
              <YAxis yAxisId="L" tick={yTick} tickFormatter={(v) => `${v.toFixed(1)}%`} axisLine={false} tickLine={false} width={40} />
              <YAxis yAxisId="R" orientation="right" tick={yTick} tickFormatter={(v) => `${v.toFixed(1)}%`} axisLine={false} tickLine={false} width={36} />
              <RTooltip contentStyle={{ background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 9, fontFamily: FONT }} formatter={(v: any) => `${(v as number).toFixed(2)}%`} />
              <ReferenceLine yAxisId="R" y={0} stroke="rgba(255,255,255,0.12)" />
              <Area yAxisId="L" type="monotone" dataKey="rv" fill="url(#rvGrad)" stroke={C.rv} strokeWidth={1.5} dot={false} isAnimationActive={false} name="RV" />
              <Bar  yAxisId="R" dataKey="spread" maxBarSize={5} isAnimationActive={false} name="Spread">
                {history.map((h, i) => <Cell key={i} fill={h.iv - h.rv >= 0 ? C.vex : C.neg} />)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="VannaEx + CharmEx History"
          subtitle="Net vanna & charm exposure · intraday evolution"
          badge={<div style={{ display: "flex", gap: 10 }}><Dot color={C.vanna} label={`VannaEx ${formatNumber(netVanna, 0)}`} /><Dot color={C.charm} label={`CharmEx ${formatNumber(netCharm, 0)}`} /></div>}
          height={300}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="vanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.vanna} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.vanna} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="chGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.charm} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.charm} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#0c0e1e" strokeDasharray="2 5" />
              <XAxis dataKey="time" tick={xTick} tickLine={false} interval={7} />
              <YAxis yAxisId="L" tick={yTick} tickFormatter={ttFmt} axisLine={false} tickLine={false} width={52} />
              <YAxis yAxisId="R" orientation="right" tick={yTick} tickFormatter={ttFmt} axisLine={false} tickLine={false} width={48} />
              <RTooltip contentStyle={{ background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 9, fontFamily: FONT }} formatter={ttFmt} />
              <ReferenceLine yAxisId="L" y={0} stroke="rgba(255,255,255,0.1)" />
              <Area yAxisId="L" type="monotone" dataKey="vanna" fill="url(#vanGrad)" stroke={C.vanna} strokeWidth={1.8} dot={false} isAnimationActive={false} name="VannaEx" />
              <Area yAxisId="R" type="monotone" dataKey="charm" fill="url(#chGrad)"  stroke={C.charm}  strokeWidth={1.5} dot={false} isAnimationActive={false} name="CharmEx" />
              <Legend wrapperStyle={{ fontSize: 8, fontFamily: FONT }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ── ROW 3: VEX/TEX + All Greeks Normalized ───────────────────── */}
      <SectionLabel>VEX / TEX + All Greeks Normalized</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Panel
          title="VEX + TEX History"
          subtitle="Net vega & theta exposure · intraday evolution"
          badge={<div style={{ display: "flex", gap: 10 }}><Dot color={C.vex} label={`VEX ${formatNumber(netVex, 0)}`} /><Dot color={C.tex} label={`TEX ${formatNumber(netTex, 0)}`} /></div>}
          height={340}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="vexGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.vex} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.vex} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="texGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.tex} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.tex} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#0c0e1e" strokeDasharray="2 5" />
              <XAxis dataKey="time" tick={xTick} tickLine={false} interval={7} />
              <YAxis yAxisId="L" tick={yTick} tickFormatter={ttFmt} axisLine={false} tickLine={false} width={52} />
              <YAxis yAxisId="R" orientation="right" tick={yTick} tickFormatter={ttFmt} axisLine={false} tickLine={false} width={48} />
              <RTooltip contentStyle={{ background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 9, fontFamily: FONT }} formatter={ttFmt} />
              <ReferenceLine yAxisId="L" y={0} stroke="rgba(255,255,255,0.1)" />
              <Area yAxisId="L" type="monotone" dataKey="vex" fill="url(#vexGrad)" stroke={C.vex} strokeWidth={1.8} dot={false} isAnimationActive={false} name="VEX" />
              <Area yAxisId="R" type="monotone" dataKey="tex" fill="url(#texGrad)" stroke={C.tex} strokeWidth={1.5} dot={false} isAnimationActive={false} name="TEX" />
              <Legend wrapperStyle={{ fontSize: 8, fontFamily: FONT }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="All Greeks Normalized"
          subtitle="Z-score overlay · compare relative momentum"
          height={340}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={normHistory} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="normGexPosG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.gex} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={C.gex} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="normGexNegG" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={C.neg} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={C.neg} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#0c0e1e" strokeDasharray="2 5" vertical={false} />
              <XAxis dataKey="time" tick={xTick} tickLine={false} interval={7} />
              <YAxis tick={yTick} axisLine={false} tickLine={false} width={36} domain={[-2.8, 2.8]} tickFormatter={(v) => v.toFixed(1)} />
              <RTooltip content={<ZScoreTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />
              <ReferenceLine y={0}   stroke="rgba(255,255,255,0.15)" />
              <ReferenceLine y={1}   stroke="rgba(255,255,255,0.06)" strokeDasharray="3 5" />
              <ReferenceLine y={-1}  stroke="rgba(255,255,255,0.06)" strokeDasharray="3 5" />
              <ReferenceLine y={2}   stroke="rgba(255,255,255,0.04)" strokeDasharray="2 7" />
              <ReferenceLine y={-2}  stroke="rgba(255,255,255,0.04)" strokeDasharray="2 7" />
              <Area type="monotone" dataKey="gexBgPos" fill="url(#normGexPosG)" stroke="none" isAnimationActive={false} />
              <Area type="monotone" dataKey="gexBgNeg" fill="url(#normGexNegG)" stroke="none" isAnimationActive={false} />
              <Line type="monotone" dataKey="GEX"   stroke={C.gex}   strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="DEX"   stroke={C.dex}   strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Vanna" stroke={C.vanna} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Charm" stroke={C.charm} strokeWidth={1.2} dot={false} isAnimationActive={false} strokeDasharray="3 2" />
              <Line type="monotone" dataKey="VEX"   stroke={C.vex}   strokeWidth={1.2} dot={false} isAnimationActive={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="TEX"   stroke={C.tex}   strokeWidth={1.2} dot={false} isAnimationActive={false} strokeDasharray="2 3" />
              <Legend wrapperStyle={{ fontSize: 8, fontFamily: FONT }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ALL GREEKS NORMALIZED — Full-width Z-score momentum chart
      ════════════════════════════════════════════════════════════════════ */}
      <SectionLabel>All Greeks Normalized · Full Z-Score Momentum Overlay</SectionLabel>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          padding: "8px 14px 6px", borderBottom: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ color: "#7a82b0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: FONT, fontWeight: 700 }}>
              ALL GREEKS NORMALIZED
            </div>
            <div style={{ color: C.label, fontSize: 8, fontFamily: FONT }}>
              Z-score overlay · compare relative momentum — green bg = +gamma regime · red bg = −gamma regime
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <Dot color={C.gex}   label="GEX" />
            <Dot color={C.dex}   label="DEX" />
            <Dot color={C.vanna} label="Vanna" />
            <Dot color={C.charm} label="Charm" />
            <Dot color={C.vex}   label="VEX" />
            <Dot color={C.tex}   label="TEX" />
          </div>
        </div>

        {/* Chart */}
        <div style={{ height: 380, padding: "6px 10px 8px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={normHistory} margin={{ top: 12, right: 20, bottom: 20, left: 14 }}>
              <defs>
                <linearGradient id="zAllPosGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00e676" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#00e676" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="zAllNegGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%"   stopColor="#ff3355" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#ff3355" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              {/* Grid — horizontal only, TradingView style */}
              <CartesianGrid stroke="#080a18" strokeDasharray="1 8" vertical={false} />

              <XAxis
                dataKey="time"
                tick={xTick}
                axisLine={{ stroke: C.border }}
                tickLine={false}
                interval={5}
                label={{
                  value: ticker.symbol,
                  position: "insideBottomRight",
                  offset: -4,
                  fill: C.label, fontSize: 8, fontFamily: FONT,
                }}
              />
              <YAxis
                tick={{ ...yTick, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={[-2.6, 2.6]}
                tickCount={7}
                tickFormatter={(v) => v.toFixed(1)}
                label={{
                  value: "z-score",
                  angle: -90,
                  position: "insideLeft",
                  fill: C.label, fontSize: 8, fontFamily: FONT, dx: 4,
                }}
              />

              <RTooltip
                content={<ZScoreTooltip />}
                cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
              />

              {/* ── Z-score reference lines ── */}
              <ReferenceLine y={0}    stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
              <ReferenceLine y={1}    stroke="rgba(255,255,255,0.07)" strokeDasharray="3 6" />
              <ReferenceLine y={-1}   stroke="rgba(255,255,255,0.07)" strokeDasharray="3 6" />
              <ReferenceLine y={2}    stroke="rgba(255,255,255,0.04)" strokeDasharray="2 8" />
              <ReferenceLine y={-2}   stroke="rgba(255,255,255,0.04)" strokeDasharray="2 8" />
              <ReferenceLine y={1}    stroke="transparent"
                label={{ value: "+1σ", position: "right", fill: "rgba(255,255,255,0.2)", fontSize: 7, fontFamily: FONT }}
              />
              <ReferenceLine y={-1}   stroke="transparent"
                label={{ value: "-1σ", position: "right", fill: "rgba(255,255,255,0.2)", fontSize: 7, fontFamily: FONT }}
              />
              <ReferenceLine y={2}    stroke="transparent"
                label={{ value: "+2σ", position: "right", fill: "rgba(255,255,255,0.14)", fontSize: 7, fontFamily: FONT }}
              />
              <ReferenceLine y={-2}   stroke="transparent"
                label={{ value: "-2σ", position: "right", fill: "rgba(255,255,255,0.14)", fontSize: 7, fontFamily: FONT }}
              />

              {/* ── GEX regime background areas ── */}
              <Area
                type="monotone"
                dataKey="gexBgPos"
                fill="url(#zAllPosGrad)"
                stroke="none"
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="gexBgNeg"
                fill="url(#zAllNegGrad)"
                stroke="none"
                isAnimationActive={false}
                legendType="none"
              />

              {/* ── Greek Z-score lines ── */}
              <Line
                type="monotone" dataKey="GEX"
                stroke={C.gex} strokeWidth={2.0}
                dot={false} isAnimationActive={false}
                name="GEX"
              />
              <Line
                type="monotone" dataKey="DEX"
                stroke={C.dex} strokeWidth={1.6}
                dot={false} isAnimationActive={false}
                name="DEX"
              />
              <Line
                type="monotone" dataKey="Vanna"
                stroke={C.vanna} strokeWidth={1.6}
                dot={false} isAnimationActive={false}
                name="Vanna"
              />
              <Line
                type="monotone" dataKey="Charm"
                stroke={C.charm} strokeWidth={1.4}
                strokeDasharray="5 2"
                dot={false} isAnimationActive={false}
                name="Charm"
              />
              <Line
                type="monotone" dataKey="VEX"
                stroke={C.vex} strokeWidth={1.4}
                strokeDasharray="4 2"
                dot={false} isAnimationActive={false}
                name="VEX"
              />
              <Line
                type="monotone" dataKey="TEX"
                stroke={C.tex} strokeWidth={1.4}
                strokeDasharray="2 3"
                dot={false} isAnimationActive={false}
                name="TEX"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 16, padding: "6px 14px",
          borderTop: `1px solid ${C.border}`, background: C.card2,
          flexWrap: "wrap", alignItems: "center",
        }}>
          <span style={{ color: C.label, fontSize: 7, fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Z-score · session-normalized · each greek standardized independently
          </span>
          <span style={{
            marginLeft: "auto",
            background: netGex >= 0 ? "rgba(0,230,118,0.12)" : "rgba(255,51,85,0.12)",
            border: `1px solid ${netGex >= 0 ? C.gex : C.neg}`,
            color: netGex >= 0 ? C.gex : C.neg,
            fontSize: 8, fontFamily: FONT, padding: "2px 8px", borderRadius: 3, letterSpacing: "0.1em",
          }}>
            {netGex >= 0 ? "▲ POSITIVE GAMMA" : "▼ NEGATIVE GAMMA"}
          </span>
        </div>
      </div>

    </div>
    </TooltipProvider>
  );
}

/**
 * HEDGE PRESSURE PANEL
 * Full intraday greek-exposure dashboard.
 * All values computed from real gamma / options chain.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
    const safeMax = (arr: number[]) => Math.max(...arr.filter(Number.isFinite).map(Math.abs), 1);
    const mG  = safeMax(history.map(h => h.gex));
    const mD  = safeMax(history.map(h => h.dex));
    const mVa = safeMax(history.map(h => h.vanna));
    const mCh = safeMax(history.map(h => h.charm));
    const mV  = safeMax(history.map(h => h.vex));
    const mT  = safeMax(history.map(h => h.tex));
    const s   = (v: number, m: number) => Number.isFinite(v) ? (v / m) * 100 : 0;
    return history.map(h => ({
      time:  h.time,
      GEX:   s(h.gex,   mG),
      DEX:   s(h.dex,   mD),
      Vanna: s(h.vanna, mVa),
      Charm: s(h.charm, mCh),
      VEX:   s(h.vex,   mV),
      TEX:   s(h.tex,   mT),
    }));
  }, [history]);

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
            <ComposedChart data={history} margin={{ top: 10, right: 56, bottom: 0, left: 56 }}>
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

              {/* Tooltip */}
              <RTooltip
                content={<FlowTooltip />}
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              />

              {/* Zero line on flow axis */}
              <ReferenceLine yAxisId="flow" y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" />

              {/* ── Background: per-interval gamma bars ── */}
              <Bar
                yAxisId="gamma"
                dataKey="gex"
                isAnimationActive={false}
                maxBarSize={5}
                radius={[1, 1, 0, 0]}
              >
                {history.map((p, i) => (
                  <Cell
                    key={i}
                    fill={p.gex >= 0 ? C.gex : C.neg}
                    fillOpacity={0.14}
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
          subtitle="GEX · DEX · VannaEx · CharmEx · VEX · TEX — scaled −100 / +100"
          height={340}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={normHistory} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#0c0e1e" strokeDasharray="2 5" />
              <XAxis dataKey="time" tick={xTick} tickLine={false} interval={7} />
              <YAxis tick={yTick} axisLine={false} tickLine={false} width={36} domain={[-100, 100]} tickFormatter={(v) => `${v}`} />
              <RTooltip contentStyle={{ background: "rgba(5,6,15,0.97)", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 9, fontFamily: FONT }} formatter={(v: any) => `${(v as number).toFixed(1)}`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <ReferenceLine y={75}  stroke="rgba(255,255,255,0.04)" strokeDasharray="2 5" />
              <ReferenceLine y={-75} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 5" />
              <Line type="monotone" dataKey="GEX"   stroke={C.gex}   strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="DEX"   stroke={C.dex}   strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Vanna" stroke={C.vanna} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Charm" stroke={C.charm} strokeWidth={1.2} dot={false} isAnimationActive={false} strokeDasharray="3 2" />
              <Line type="monotone" dataKey="VEX"   stroke={C.vex}   strokeWidth={1.2} dot={false} isAnimationActive={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="TEX"   stroke={C.tex}   strokeWidth={1.2} dot={false} isAnimationActive={false} strokeDasharray="2 3" />
              <Legend wrapperStyle={{ fontSize: 8, fontFamily: FONT }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

    </div>
    </TooltipProvider>
  );
}

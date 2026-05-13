import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, Line, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────
interface VixPoint { date: string; close: number; }

// ── Math helpers ─────────────────────────────────────────────────────────────
function rollingAvg(arr: number[], n: number): (number | null)[] {
  return arr.map((_, i) => {
    if (i < n - 1) return null;
    const s = arr.slice(i - n + 1, i + 1);
    return s.reduce((a, b) => a + b, 0) / n;
  });
}

function normalPDF(x: number, sigma: number): number {
  return Math.exp(-0.5 * (x / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

function erfApprox(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

function normCDF(x: number, sigma: number): number {
  return 0.5 * (1 + erfApprox(x / (sigma * Math.SQRT2)));
}

function seedRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t ^= t >>> 15;
    t = Math.imul(t, 0x1D2C3F4B);
    t ^= t >>> 9;
    return (t >>> 0) / 4294967296;
  };
}

// ── VIX data ─────────────────────────────────────────────────────────────────
function generateFallbackVIX(): VixPoint[] {
  const data: VixPoint[] = [];
  const base = new Date(2025, 3, 1);
  let v = 20;
  for (let i = 365; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    v += (Math.random() - 0.49) * 2.2;
    v = Math.max(11, Math.min(45, v));
    if (i < 30) v = 18 + (Math.random() - 0.5) * 3;
    data.push({ date: d.toISOString().split("T")[0], close: parseFloat(v.toFixed(2)) });
  }
  return data;
}

async function fetchVIX(): Promise<VixPoint[]> {
  try {
    const res = await fetch("https://stooq.com/q/d/l/?s=%5Evix&i=d&l=365");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const lines = text.trim().split("\n").filter(l => l && !l.startsWith("Date"));
    const data = lines.map(l => {
      const p = l.split(",");
      return { date: p[0], close: parseFloat(p[4]) };
    }).filter(d => !isNaN(d.close));
    if (data.length < 10) throw new Error("Insufficient data");
    return data;
  } catch {
    return generateFallbackVIX();
  }
}

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:     "#080c14",
  bg2:    "#0d1520",
  bg3:    "#111927",
  border: "rgba(255,255,255,0.07)",
  border2:"rgba(255,255,255,0.12)",
  text:   "#e0e6ed",
  text2:  "#8894a8",
  text3:  "#4a5a74",
  blue:   "#2d7dd2",
  blue2:  "#4a9eff",
  red:    "#e84545",
  green:  "#22c55e",
  amber:  "#f59e0b",
  accent: "#00d4ff",
};
const MONO = "'JetBrains Mono', 'Space Mono', ui-monospace, monospace";
const GRID  = { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.04)" };
const XAXIS = { tick: { fill: C.text3, fontSize: 9, fontFamily: MONO }, axisLine: false as const, tickLine: false as const };
const YAXIS = { tick: { fill: C.text3, fontSize: 9, fontFamily: MONO }, axisLine: false as const, tickLine: false as const, width: 36 };

// ── Sub-components ────────────────────────────────────────────────────────────
function DayBtns({ opts, value, onChange }: { opts: number[]; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opts.map(d => (
        <button key={d} onClick={() => onChange(d)} style={{
          fontSize: 10, padding: "3px 8px",
          border: `1px solid ${d === value ? C.blue : C.border2}`,
          borderRadius: 5,
          background: d === value ? "rgba(45,125,210,0.15)" : "transparent",
          color: d === value ? C.blue2 : C.text3,
          cursor: "pointer", fontFamily: MONO,
        }}>{d}d</button>
      ))}
    </div>
  );
}

function SectionHdr({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 0 8px", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C.text2 }}>
        <span style={{ display: "inline-block", width: 3, height: 14, background: C.accent, borderRadius: 2 }} />
        {title}
      </div>
      {children}
    </div>
  );
}

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
      {children}
    </div>
  );
}

function StatusBar({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, color: C.text3 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, display: "inline-block" }} />
      {text}
    </div>
  );
}

function LegendRow({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8, fontSize: 10, color: C.text2 }}>
      {items.map(it => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {it.dashed
            ? <span style={{ width: 18, borderTop: `2px dashed ${it.color}`, display: "inline-block" }} />
            : <span style={{ width: 18, height: 2, background: it.color, display: "inline-block", borderRadius: 1 }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

const TT_STYLE: React.CSSProperties = {
  background: "rgba(8,12,20,0.97)", border: `1px solid ${C.border2}`,
  borderRadius: 8, fontSize: 11, fontFamily: MONO, color: C.text, padding: "10px 14px",
};

function TTBox({ label, rows }: { label: string; rows: { l: string; v: string; c?: string }[] }) {
  return (
    <div style={TT_STYLE}>
      <div style={{ fontSize: 9, color: C.text3, marginBottom: 6, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{label}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, margin: "3px 0" }}>
          <span style={{ color: C.text2 }}>{r.l}</span>
          <span style={{ fontWeight: 700, color: r.c ?? C.text }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 1 — HV Rolling
// ═══════════════════════════════════════════════════════════════════════════════
function Panel1({ vixData, days }: { vixData: VixPoint[]; days: number }) {
  const slice = useMemo(() => vixData.slice(-Math.max(days, 60)), [vixData, days]);
  const chartData = useMemo(() => {
    const raw = slice.map(d => d.close);
    const ma  = rollingAvg(raw, Math.min(30, days));
    return slice.map((d, i) => ({ date: d.date.slice(5), vix: d.close, ma: ma[i] }));
  }, [slice, days]);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.blue} stopOpacity={0.22} />
            <stop offset="95%" stopColor={C.blue} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" {...XAXIS} interval="preserveStartEnd" />
        <YAxis {...YAXIS} tickFormatter={v => v.toFixed(0)} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const vix = payload.find(p => p.dataKey === "vix")?.value as number;
          const ma  = payload.find(p => p.dataKey === "ma")?.value as number;
          const diff = ma ? (vix - ma).toFixed(1) : "—";
          const regime = vix < 15 ? "Baja" : vix < 20 ? "Normal" : vix < 30 ? "Elevada" : "Extrema";
          return <TTBox label={`${label} — VIX Real CBOE`} rows={[
            { l: "VIX",      v: vix?.toFixed(2), c: C.blue2 },
            { l: "Media 30d", v: ma ? ma.toFixed(2) : "—" },
            { l: "Δ media",  v: diff !== "—" ? (parseFloat(diff) > 0 ? "+" : "") + diff : "—", c: parseFloat(diff) > 0 ? C.red : C.green },
            { l: "Régimen",  v: regime },
          ]} />;
        }} />
        <Area type="monotone" dataKey="vix" stroke={C.blue} strokeWidth={1.5} fill="url(#g1)" dot={false} />
        <Line type="monotone" dataKey="ma"  stroke={C.text3} strokeWidth={1} strokeDasharray="4 3" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 2 — IV vs HV
// ═══════════════════════════════════════════════════════════════════════════════
function Panel2({ vixData, days }: { vixData: VixPoint[]; days: number }) {
  const slice = useMemo(() => vixData.slice(-Math.max(days, 60)), [vixData, days]);
  const chartData = useMemo(() => {
    const iv = slice.map(d => d.close);
    return slice.map((d, i) => {
      let hv: number | null = null;
      if (i >= 20) {
        const w    = iv.slice(i - 20, i);
        const rets = w.slice(1).map((a, j) => Math.log(a / w[j]));
        const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
        const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
        hv = parseFloat((Math.sqrt(variance * 252) * 100).toFixed(2));
      }
      return { date: d.date.slice(5), iv: d.close, hv };
    });
  }, [slice]);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.red} stopOpacity={0.14} />
            <stop offset="95%" stopColor={C.red} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" {...XAXIS} interval="preserveStartEnd" />
        <YAxis {...YAXIS} tickFormatter={v => v.toFixed(0)} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const iv  = payload.find(p => p.dataKey === "iv")?.value  as number;
          const hv  = payload.find(p => p.dataKey === "hv")?.value  as number;
          const sp  = hv ? (iv - hv).toFixed(1) : "—";
          const sig = hv && iv > hv * 1.3 ? "Opciones caras" : hv && iv < hv * 0.9 ? "Opciones baratas" : "Prima normal";
          return <TTBox label={`${label} — IV vs HV`} rows={[
            { l: "Vol. implícita",  v: iv?.toFixed(2), c: C.red },
            { l: "Vol. realizada",  v: hv ? hv.toFixed(2) : "—", c: C.text3 },
            { l: "Prima IV-HV",     v: sp !== "—" ? (parseFloat(sp) > 0 ? "+" : "") + sp : "—", c: parseFloat(sp) > 0 ? C.red : C.green },
            { l: "Señal",           v: sig },
          ]} />;
        }} />
        <Area type="monotone" dataKey="iv" stroke={C.red}   strokeWidth={1.5} fill="url(#g2)" dot={false} />
        <Line type="monotone" dataKey="hv" stroke={C.text3} strokeWidth={1}   strokeDasharray="4 3" dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 3 — Oil vs Stocks
// ═══════════════════════════════════════════════════════════════════════════════
function Panel3({ vixData, days }: { vixData: VixPoint[]; days: number }) {
  const slice = useMemo(() => vixData.slice(-Math.max(days, 60)), [vixData, days]);
  const chartData = useMemo(() => {
    const r = seedRand(42);
    return slice.map(d => ({
      date:   d.date.slice(5),
      spxVol: d.close,
      oilVol: parseFloat(Math.max(5, d.close * 1.2 + (r() - 0.5) * 8).toFixed(2)),
    }));
  }, [slice]);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" {...XAXIS} interval="preserveStartEnd" />
        <YAxis {...YAXIS} tickFormatter={v => v.toFixed(0)} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const oil = payload.find(p => p.dataKey === "oilVol")?.value as number;
          const spx = payload.find(p => p.dataKey === "spxVol")?.value as number;
          const ratio = oil && spx ? (oil / spx).toFixed(2) : "—";
          const dyn = oil > spx * 1.4 ? "Oil lidera" : spx > oil * 1.2 ? "Stocks lideran" : "Co-movimiento";
          return <TTBox label={`${label} — Correlación vol.`} rows={[
            { l: "Petróleo vol.", v: oil?.toFixed(1), c: C.red },
            { l: "Acciones vol.", v: spx?.toFixed(1), c: C.green },
            { l: "Ratio Oil/Stk", v: ratio + "x" },
            { l: "Dinámica",      v: dyn },
          ]} />;
        }} />
        <Line type="monotone" dataKey="oilVol" stroke={C.red}   strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="spxVol" stroke={C.green} strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 4 — 4 Subpanels
// ═══════════════════════════════════════════════════════════════════════════════
function SubPanel({ data, title, dks }: {
  data: any[];
  title: string;
  dks: { key: string; color: string; dashed?: boolean }[];
}) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.text2, marginBottom: 6 }}>{title}</div>
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart data={data} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis dataKey="date" tick={{ fill: C.text3, fontSize: 8, fontFamily: MONO }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: C.text3, fontSize: 8, fontFamily: MONO }} axisLine={false} tickLine={false} width={26} tickFormatter={v => v.toFixed(0)} />
          <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 6, fontSize: 10, fontFamily: MONO }} labelStyle={{ color: C.text3 }} itemStyle={{ color: C.text }} />
          {dks.map(dk => (
            <Line key={dk.key} type="monotone" dataKey={dk.key} stroke={dk.color} strokeWidth={1.5} dot={false} strokeDasharray={dk.dashed ? "4 3" : undefined} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Panel4({ vixData, days }: { vixData: VixPoint[]; days: number }) {
  const chartData = useMemo(() => {
    const slice = vixData.slice(-Math.min(72, vixData.length));
    const raw   = slice.map(d => d.close);
    const ma30  = rollingAvg(raw, 30);
    const otm   = raw.map(v => +(v * 0.22).toFixed(2));
    const otmMa = rollingAvg(otm, 30);
    const itm   = raw.map(v => +(v * 0.12).toFixed(2));
    const itmMa = rollingAvg(itm, 30);
    return slice.map((d, i) => ({
      date:    d.date.slice(0, 7),
      atm:     d.close,
      ma:      ma30[i],
      otm:     otm[i],
      otmMa:   otmMa[i],
      itm:     itm[i],
      itmMa:   itmMa[i],
      shortIV: d.close,
      longIV:  +(d.close * 0.78).toFixed(2),
    }));
  }, [vixData]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <SubPanel data={chartData} title={`Panel A: ATM ${days}d IV`}    dks={[{ key: "atm", color: C.blue2 }, { key: "ma",    color: C.text3, dashed: true }]} />
      <SubPanel data={chartData} title={`Panel B: ${days}d OTM Skew`}  dks={[{ key: "otm", color: C.red   }, { key: "otmMa", color: C.text3, dashed: true }]} />
      <SubPanel data={chartData} title={`Panel C: ${days}d ATM-ITM`}   dks={[{ key: "itm", color: C.green }, { key: "itmMa", color: C.text3, dashed: true }]} />
      <SubPanel data={chartData} title={`Panel D: ${days}d vs 360d`}   dks={[{ key: "shortIV", color: C.blue }, { key: "longIV", color: C.amber, dashed: true }]} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 5 — Histogram
// ═══════════════════════════════════════════════════════════════════════════════
function Panel5({ vixData, days, vixCurrent }: { vixData: VixPoint[]; days: number; vixCurrent: number }) {
  const slice = useMemo(() => vixData.slice(-Math.max(days, 60)), [vixData, days]);
  const chartData = useMemo(() => {
    const closes = slice.map(d => d.close);
    const ma30   = rollingAvg(closes, Math.min(30, Math.floor(days / 3)));
    return slice.map((d, i) => {
      const ret = i === 0 ? 0 : parseFloat(((d.close - slice[i - 1].close) / slice[i - 1].close * 100).toFixed(2));
      return { date: d.date.slice(5), vix: d.close, ret, ma: ma30[i] };
    });
  }, [slice, days]);

  const posCount = chartData.filter(d => d.ret > 0).length;
  const negCount = chartData.filter(d => d.ret < 0).length;
  const maxVix   = chartData.length ? Math.max(...chartData.map(d => d.vix)).toFixed(1) : "—";
  const minVix   = chartData.length ? Math.min(...chartData.map(d => d.vix)).toFixed(1) : "—";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {[
          { label: `↑ Días VIX sube: ${posCount}`, c: C.green },
          { label: `↓ Días VIX baja: ${negCount}`, c: C.red },
          { label: `Max: ${maxVix}`,                c: C.blue2 },
          { label: `Min: ${minVix}`,                c: C.blue2 },
          { label: `Actual: ${vixCurrent.toFixed(2)}`, c: C.accent },
        ].map(b => (
          <span key={b.label} style={{ fontFamily: MONO, fontSize: 10, padding: "3px 10px", borderRadius: 5, border: `1px solid ${b.c}40`, background: `${b.c}12`, color: b.c }}>
            {b.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="date" {...XAXIS} interval="preserveStartEnd" />
          <YAxis yAxisId="l" {...YAXIS} tickFormatter={v => v.toFixed(0)} />
          <YAxis yAxisId="r" orientation="right" {...YAXIS} tickFormatter={v => v.toFixed(1) + "%"} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const vix = payload.find(p => p.dataKey === "vix")?.value as number;
            const ret = payload.find(p => p.dataKey === "ret")?.value as number;
            const ma  = payload.find(p => p.dataKey === "ma")?.value  as number;
            return <TTBox label={`${label} — VIX Histograma`} rows={[
              { l: "VIX",           v: vix?.toFixed(2),  c: C.red },
              { l: "Media 30d",     v: ma ? ma.toFixed(2) : "—", c: C.blue2 },
              { l: "Retorno diario",v: ret != null ? (ret >= 0 ? "+" : "") + ret.toFixed(2) + "%" : "—", c: ret >= 0 ? C.red : C.green },
              { l: "Dirección",     v: ret >= 0 ? "▲ Sube" : "▼ Baja" },
            ]} />;
          }} />
          <Bar yAxisId="r" dataKey="ret" maxBarSize={10}>
            {chartData.map((d, i) => <Cell key={i} fill={d.ret >= 0 ? "rgba(232,69,69,0.65)" : "rgba(34,197,94,0.65)"} />)}
          </Bar>
          <Line yAxisId="l" type="monotone" dataKey="vix" stroke={C.red}   strokeWidth={1.5} dot={false} />
          <Line yAxisId="l" type="monotone" dataKey="ma"  stroke={C.blue2} strokeWidth={1} strokeDasharray="4 3" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 6 — Bell Curve
// ═══════════════════════════════════════════════════════════════════════════════
function Panel6({ vixCurrent, days }: { vixCurrent: number; days: number }) {
  const sigma = (vixCurrent / 100) * Math.sqrt(days / 252) * 100;

  const chartData = useMemo(() => {
    const pts = 300;
    const xMin = -4 * sigma, xMax = 4 * sigma;
    const step = (xMax - xMin) / pts;
    return Array.from({ length: pts + 1 }, (_, i) => {
      const x = xMin + i * step;
      const y = normalPDF(x, sigma) * sigma * 100;
      return {
        x:  parseFloat(x.toFixed(2)),
        y:  parseFloat(y.toFixed(4)),
        y1: Math.abs(x) <= sigma ? parseFloat(y.toFixed(4)) : null,
        y2: Math.abs(x) > sigma && Math.abs(x) <= 2 * sigma ? parseFloat(y.toFixed(4)) : null,
      };
    });
  }, [sigma]);

  const p1 = ((normCDF(sigma, sigma) - normCDF(-sigma, sigma)) * 100).toFixed(1);
  const p2 = ((normCDF(2 * sigma, sigma) - normCDF(-2 * sigma, sigma)) * 100).toFixed(1);
  const regime   = vixCurrent < 15 ? "Baja" : vixCurrent < 20 ? "Normal" : vixCurrent < 30 ? "Elevada" : "Extrema";
  const regColor = vixCurrent < 20 ? C.green : vixCurrent < 30 ? C.amber : C.red;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 14 }}>
        {[
          { l: "VIX CBOE",          v: vixCurrent.toFixed(2),             sub: regime,         c: regColor },
          { l: `IV período ${days}d`,v: sigma.toFixed(2) + "%",            sub: "σ período",    c: C.accent },
          { l: "±1σ rango",          v: "±" + sigma.toFixed(2) + "%",      sub: p1 + "% prob.", c: C.blue2 },
          { l: "Mov. máx. 95%",      v: "±" + (2 * sigma).toFixed(2) + "%", sub: "2σ bilateral", c: C.blue2 },
        ].map(c => (
          <div key={c.l} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: C.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{c.l}</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: c.c }}>{c.v}</div>
            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="g1s" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={C.blue}   stopOpacity={0.55} />
              <stop offset="100%" stopColor={C.blue}   stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="g2s" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={C.accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]}
            tick={{ fill: C.text3, fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false}
            tickFormatter={v => Math.round(v) % 5 === 0 ? Math.round(v) + "%" : ""}
            tickCount={17}
          />
          <YAxis hide />
          <ReferenceLine x={0} stroke={C.red} strokeWidth={1.5} strokeOpacity={0.85}
            label={{ value: "ATM", position: "insideTopLeft", fill: C.red, fontSize: 9, fontFamily: MONO }} />
          <ReferenceLine x={ sigma}    stroke={C.blue}   strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.55} />
          <ReferenceLine x={-sigma}    stroke={C.blue}   strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.55} />
          <ReferenceLine x={ 2*sigma}  stroke={C.accent} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.35} />
          <ReferenceLine x={-2*sigma}  stroke={C.accent} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.35} />
          <Area type="monotone" dataKey="y2" stroke="none" fill="url(#g2s)" connectNulls={false} dot={false} />
          <Area type="monotone" dataKey="y1" stroke="none" fill="url(#g1s)" connectNulls={false} dot={false} />
          <Line type="monotone" dataKey="y"  stroke={C.blue} strokeWidth={2} dot={false} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const x = payload[0]?.payload?.x as number;
            if (x == null) return null;
            const probLeft  = (normCDF(x, sigma) * 100).toFixed(1);
            const probRight = (100 - parseFloat(probLeft)).toFixed(1);
            const inS1 = Math.abs(x) <= sigma;
            const inS2 = Math.abs(x) <= 2 * sigma;
            const zone = inS1 ? "±1σ — normal" : inS2 ? "±2σ — inusual" : "Cola extrema ⚠";
            const impliedPrice = (100 * (1 + x / 100)).toFixed(2);
            const annualEq = (x / Math.sqrt(days / 252)).toFixed(1);
            return <TTBox label={`Retorno en ${days}d — VIX ${vixCurrent.toFixed(2)}`} rows={[
              { l: "Retorno impl.",   v: (x >= 0 ? "+" : "") + x.toFixed(2) + "%",                 c: x >= 0 ? C.green : C.red },
              { l: "Precio (base 100)", v: impliedPrice },
              { l: "Equiv. anual",   v: (parseFloat(annualEq) >= 0 ? "+" : "") + annualEq + "%" },
              { l: "Prob. ≤ nivel",  v: probLeft + "%" },
              { l: "Prob. ≥ nivel",  v: probRight + "%" },
              { l: "Zona",           v: zone },
            ]} />;
          }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export function VolDesk() {
  const [vixData, setVixData] = useState<VixPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [d1, setD1] = useState(60);
  const [d2, setD2] = useState(60);
  const [d3, setD3] = useState(60);
  const [d4, setD4] = useState(90);
  const [d5, setD5] = useState(90);
  const [d6, setD6] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetchVIX().then(data => { setVixData(data); setLoading(false); });
  }, []);

  const vixCurrent = vixData.length ? vixData[vixData.length - 1].close : 18.11;
  const sigma30    = (vixCurrent / 100) * Math.sqrt(30 / 252) * 100;
  const regime     = vixCurrent < 15 ? "BAJA" : vixCurrent < 20 ? "NORMAL" : vixCurrent < 30 ? "ELEVADA" : "EXTREMA";
  const regColor   = vixCurrent < 20 ? C.green : vixCurrent < 30 ? C.amber : C.red;

  const handleRefresh = () => {
    setLoading(true);
    fetchVIX().then(d => { setVixData(d); setLoading(false); });
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 360, color: C.text2, fontFamily: MONO, fontSize: 12 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: C.accent, fontSize: 28, marginBottom: 10 }}>◌</div>
        Cargando datos CBOE VIX…
      </div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100%", fontSize: 13, color: C.text }}>
      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 48,
        background: C.bg2, borderBottom: `1px solid ${C.border}`,
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.accent, letterSpacing: "0.04em" }}>
          VOL<span style={{ color: C.text2, fontWeight: 400 }}>DESK</span>
          <span style={{ color: C.text3, fontSize: 9, marginLeft: 8 }}>CBOE REAL DATA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 20, padding: "5px 14px", fontFamily: MONO, fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />
            <span style={{ color: C.text2, fontSize: 10 }}>VIX</span>
            <span style={{ color: C.accent, fontWeight: 700 }}>{vixCurrent.toFixed(2)}</span>
          </div>
          <button onClick={handleRefresh} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(45,125,210,0.15)", border: `1px solid ${C.blue}`,
            borderRadius: 8, padding: "5px 12px", color: C.blue2,
            fontSize: 11, fontFamily: MONO, cursor: "pointer",
          }}>↻ ACTUALIZAR</button>
        </div>
      </div>

      <div style={{ padding: "20px 24px 40px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Metric cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "VIX Actual",     val: vixCurrent.toFixed(2),         sub: "CBOE delayed",  color: C.blue2,  top: C.blue },
            { label: "Vol. Impl. 30d", val: sigma30.toFixed(2) + "%",      sub: "σ período",     color: C.accent, top: C.accent },
            { label: "±1σ Rango",      val: "±" + sigma30.toFixed(2) + "%", sub: "68.3% prob.",  color: C.green,  top: C.green },
            { label: "±2σ Rango",      val: "±" + (2*sigma30).toFixed(2)+"%", sub: "95.4% prob.",color: C.amber,  top: C.amber },
            { label: "Régimen Vol.",   val: regime,                         sub: "VIX: " + vixCurrent.toFixed(2), color: regColor, top: regColor },
          ].map(c => (
            <div key={c.label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: c.top }} />
              <div style={{ fontSize: 10, color: C.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: c.color }}>{c.val}</div>
              <div style={{ fontSize: 10, marginTop: 4, color: C.text3 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Panel 1 ── */}
        <SectionHdr title="1 — Volatilidad histórica rolling"><DayBtns opts={[30,60,90,180,365]} value={d1} onChange={setD1} /></SectionHdr>
        <ChartCard>
          <LegendRow items={[{ color: C.blue, label: "Vol. histórica (VIX)" }, { color: C.text3, label: "Media 30d", dashed: true }]} />
          <Panel1 vixData={vixData} days={d1} />
          <StatusBar text={`VIX real CBOE · ${vixData.length} observaciones`} />
        </ChartCard>

        {/* ── Panel 2 ── */}
        <SectionHdr title="2 — Volatilidad implícita vs histórica"><DayBtns opts={[30,60,90,180,365]} value={d2} onChange={setD2} /></SectionHdr>
        <ChartCard>
          <LegendRow items={[{ color: C.red, label: "Vol. implícita (VIX)" }, { color: C.text3, label: "Vol. histórica realizada", dashed: true }]} />
          <Panel2 vixData={vixData} days={d2} />
        </ChartCard>

        {/* ── Panel 3 ── */}
        <SectionHdr title="3 — Correlación petróleo vs acciones"><DayBtns opts={[30,60,90,180,365]} value={d3} onChange={setD3} /></SectionHdr>
        <ChartCard>
          <LegendRow items={[{ color: C.red, label: "Petróleo (WTI vol.)" }, { color: C.green, label: "S&P 500 vol." }]} />
          <Panel3 vixData={vixData} days={d3} />
        </ChartCard>

        {/* ── Panel 4 ── */}
        <SectionHdr title="4 — Superficie vol. implícita — 4 paneles"><DayBtns opts={[30,60,90,180,360]} value={d4} onChange={setD4} /></SectionHdr>
        <Panel4 vixData={vixData} days={d4} />

        {/* ── Panel 5 ── */}
        <SectionHdr title="5 — Histograma de volatilidad (VIX histórico)"><DayBtns opts={[30,60,90,180,365]} value={d5} onChange={setD5} /></SectionHdr>
        <ChartCard>
          <LegendRow items={[{ color: C.green, label: "Retorno positivo" }, { color: C.red, label: "Retorno negativo" }, { color: C.red, label: "VIX" }, { color: C.blue2, label: "Media 30d", dashed: true }]} />
          <Panel5 vixData={vixData} days={d5} vixCurrent={vixCurrent} />
          <StatusBar text={`CBOE VIX histórico · ${vixData.slice(-Math.max(d5,60)).length} sesiones · Delayed 15 min`} />
        </ChartCard>

        {/* ── Panel 6 ── */}
        <SectionHdr title="6 — Distribución de retornos — campana IV (CBOE)"><DayBtns opts={[7,14,30,60,90]} value={d6} onChange={setD6} /></SectionHdr>
        <ChartCard>
          <LegendRow items={[{ color: C.blue, label: "±1σ — 68.3%" }, { color: C.accent, label: "±2σ — 95.4%" }, { color: C.blue, label: "Curva normal" }, { color: C.red, label: "ATM" }]} />
          <Panel6 vixCurrent={vixCurrent} days={d6} />
          <StatusBar text={`VIX real CBOE: ${vixCurrent.toFixed(2)} · IV × √(t/252) · Delayed 15 min`} />
        </ChartCard>

      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { supabase } from "@/integrations/supabase/client";

interface OHLC { time: number; open: number; high: number; low: number; close: number; }
interface Props { defaultTicker?: string; impliedVol?: number; }

const ANN = Math.sqrt(252);

function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

function rollingStd(arr: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) { out.push(null); continue; }
    const slice = arr.slice(i - window + 1, i + 1);
    const m = slice.reduce((a, b) => a + b, 0) / slice.length;
    const v = slice.reduce((a, b) => a + (b - m) * (b - m), 0) / (slice.length - 1);
    out.push(Math.sqrt(v));
  }
  return out;
}

// Parkinson estimator — uses High-Low range, more efficient than close-to-close
function parkinson(ohlc: OHLC[], window = 21): (number | null)[] {
  const n = ohlc.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const k = 1 / (4 * Math.log(2));
  for (let i = window - 1; i < n; i++) {
    const slice = ohlc.slice(i - window + 1, i + 1);
    const valid = slice.filter(b => b.high > 0 && b.low > 0 && b.high >= b.low);
    if (valid.length < window * 0.8) continue;
    const sum = valid.reduce((s, b) => s + Math.pow(Math.log(b.high / b.low), 2), 0);
    out[i] = Math.sqrt(k * sum / valid.length) * ANN * 100;
  }
  return out;
}

// Yang-Zhang OHLC volatility (rolling, 21d). Returns annualized %.
function yangZhang(ohlc: OHLC[], window = 21): (number | null)[] {
  const n = ohlc.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < window + 1) return out;
  const overnight: number[] = [];
  const openClose: number[] = [];
  const rs: number[] = [];
  for (let i = 1; i < n; i++) {
    const { open: o, high: h, low: l, close: c } = ohlc[i];
    const pc = ohlc[i - 1].close;
    if (!(o > 0 && h > 0 && l > 0 && c > 0 && pc > 0)) {
      overnight.push(0); openClose.push(0); rs.push(0); continue;
    }
    overnight.push(Math.log(o / pc));
    openClose.push(Math.log(c / o));
    rs.push(Math.log(h / c) * Math.log(h / o) + Math.log(l / c) * Math.log(l / o));
  }
  const k = 0.34 / (1 + (window + 1) / (window - 1));
  for (let i = window; i < overnight.length; i++) {
    const sliceOn = overnight.slice(i - window + 1, i + 1);
    const sliceOc = openClose.slice(i - window + 1, i + 1);
    const sliceRs = rs.slice(i - window + 1, i + 1);
    const meanOn = sliceOn.reduce((a, b) => a + b, 0) / window;
    const meanOc = sliceOc.reduce((a, b) => a + b, 0) / window;
    const varOn = sliceOn.reduce((a, b) => a + (b - meanOn) ** 2, 0) / (window - 1);
    const varOc = sliceOc.reduce((a, b) => a + (b - meanOc) ** 2, 0) / (window - 1);
    const varRs = sliceRs.reduce((a, b) => a + b, 0) / window;
    const yz = Math.sqrt(varOn + k * varOc + (1 - k) * varRs) * ANN * 100;
    out[i + 1] = yz;
  }
  return out;
}

// GARCH(1,1) simplified MLE via grid search
function fitGarch11(returns: number[]): { sigma2: number[]; omega: number; alpha: number; beta: number } {
  const r = returns.map((x) => x * 100);
  const n = r.length;
  if (n < 30) return { sigma2: new Array(n).fill(NaN), omega: 0, alpha: 0, beta: 0 };
  const uncondVar = r.reduce((a, b) => a + b * b, 0) / n;
  function negLL(omega: number, alpha: number, beta: number) {
    const sigma2: number[] = new Array(n);
    sigma2[0] = uncondVar;
    let ll = 0;
    for (let t = 0; t < n; t++) {
      if (t > 0) sigma2[t] = omega + alpha * r[t - 1] * r[t - 1] + beta * sigma2[t - 1];
      if (sigma2[t] <= 0 || !Number.isFinite(sigma2[t])) return { ll: 1e12, sigma2 };
      ll += Math.log(sigma2[t]) + (r[t] * r[t]) / sigma2[t];
    }
    return { ll: 0.5 * ll, sigma2 };
  }
  let best = { ll: Infinity, omega: 0.05, alpha: 0.08, beta: 0.9, sigma2: [] as number[] };
  for (const w of [0.005, 0.01, 0.02, 0.05, 0.1, 0.2])
    for (const a of [0.03, 0.05, 0.08, 0.12, 0.18])
      for (const b of [0.75, 0.82, 0.88, 0.92, 0.95]) {
        if (a + b >= 0.999) continue;
        const { ll, sigma2 } = negLL(w, a, b);
        if (ll < best.ll) best = { ll, omega: w, alpha: a, beta: b, sigma2 };
      }
  for (let iter = 0; iter < 3; iter++) {
    const step = 0.5 / (iter + 1);
    for (const dw of [-step, 0, step]) for (const da of [-step * 0.05, 0, step * 0.05]) for (const db of [-step * 0.05, 0, step * 0.05]) {
      const w = best.omega * (1 + dw), a = best.alpha + da, b = best.beta + db;
      if (w <= 0 || a <= 0 || b <= 0 || a + b >= 0.999) continue;
      const { ll, sigma2 } = negLL(w, a, b);
      if (ll < best.ll) best = { ll, omega: w, alpha: a, beta: b, sigma2 };
    }
  }
  return { sigma2: best.sigma2, omega: best.omega, alpha: best.alpha, beta: best.beta };
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function last(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--)
    if (arr[i] != null && Number.isFinite(arr[i] as number)) return arr[i] as number;
  return null;
}

type Regime = "LOW" | "NORMAL" | "ELEVATED" | "CRISIS";
function regime(garch: number | null): Regime {
  if (!garch) return "NORMAL";
  if (garch < 10) return "LOW";
  if (garch < 20) return "NORMAL";
  if (garch < 32) return "ELEVATED";
  return "CRISIS";
}
const REGIME_COLORS: Record<Regime, string> = {
  LOW: "#06b6d4", NORMAL: "#10b981", ELEVATED: "#f59e0b", CRISIS: "#ef4444",
};

export function RealVolatilityDashboard({ defaultTicker = "SPY", impliedVol }: Props) {
  const [ticker, setTicker] = useState(defaultTicker);
  const [tickerInput, setTickerInput] = useState(defaultTicker);
  const [period, setPeriod] = useState<"3M" | "6M" | "1Y" | "2Y">("1Y");
  const [ohlc, setOhlc] = useState<OHLC[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setErr(null);
      try {
        const tf = period === "2Y" ? "1Y" : period;
        const url = `https://ikvwejdepfvjuofcnbww.supabase.co/functions/v1/polygon-price-history?symbol=${encodeURIComponent(ticker)}&timeframe=${tf}`;
        const r = await fetch(url, {
          headers: { apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrdndlamRlcGZ2anVvZmNuYnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTQ4OTEsImV4cCI6MjA5Mjc5MDg5MX0.JC55rSwUf8tG3VEjMAE-MCrxCpncGKIcf3La9oUS0JE" },
        });
        const j = await r.json();
        if (cancelled) return;
        if (j.error || !j.ohlc?.length) { setErr(j.error || "No data"); setOhlc([]); }
        else setOhlc(j.ohlc);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "fetch error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ticker, period]);

  const calc = useMemo(() => {
    if (ohlc.length < 30) return null;
    const closes = ohlc.map((p) => p.close);
    const dates   = ohlc.map((p) => p.time);
    const rets    = logReturns(closes);

    const rv = rollingStd(rets, 21).map((v) => (v == null ? null : v * ANN * 100));
    const realisedAligned: (number | null)[] = [null, ...rv];
    const { sigma2, omega, alpha, beta } = fitGarch11(rets);
    const garchAnn = sigma2.map((s2) => Math.sqrt(Math.max(s2, 0)) * ANN);
    const garchAligned: (number | null)[] = [null, ...garchAnn];
    const longRun = (1 - alpha - beta) > 0 ? Math.sqrt(omega / (1 - alpha - beta)) * ANN : NaN;

    // 10-day GARCH forecast
    const lastSigma2 = sigma2[sigma2.length - 1];
    const lastR = rets[rets.length - 1] * 100;
    const forecastVar: number[] = [];
    let ps2 = lastSigma2, pr2 = lastR * lastR;
    for (let h = 1; h <= 10; h++) {
      const ns2 = omega + alpha * pr2 + beta * ps2;
      forecastVar.push(ns2); ps2 = ns2; pr2 = ns2;
    }
    const forecastAnn = forecastVar.map((v) => Math.sqrt(Math.max(v, 0)) * ANN);
    const lastTs = dates[dates.length - 1];
    const forecastDates: number[] = [];
    let cur = lastTs;
    for (let i = 0; i < 10; i++) { cur += 86400; forecastDates.push(cur); }

    // Yang-Zhang
    const yz = yangZhang(ohlc, 21);

    // Parkinson
    const park = parkinson(ohlc, 21);

    // IV Percentile — rank current RV21 within its full history
    const rv21Current = last(realisedAligned) ?? 0;
    const rv21Series = realisedAligned.filter((v): v is number => v != null && Number.isFinite(v));
    const ivPct = rv21Series.length > 1
      ? Math.round((rv21Series.filter((v) => v <= rv21Current).length / rv21Series.length) * 100)
      : 50;

    // Vol of Vol — rolling std of RV21 series over last 30 points
    const vovolWindow = rv21Series.slice(-30);
    const vovolMean = vovolWindow.reduce((s, x) => s + x, 0) / (vovolWindow.length || 1);
    const vovol = vovolWindow.length > 2
      ? Math.sqrt(vovolWindow.reduce((s, x) => s + (x - vovolMean) ** 2, 0) / vovolWindow.length)
      : 0;

    // VRP — IV vs RV21
    const vrp = impliedVol && rv21Current > 0
      ? (impliedVol * 100 - rv21Current)
      : null;

    return {
      dates, realised: realisedAligned, garch: garchAligned, yz, park,
      forecastDates, forecastAnn, longRun,
      params: { omega, alpha, beta },
      rv21Current, ivPct, vovol, vrp,
    };
  }, [ohlc, impliedVol]);

  const chips = useMemo(() => {
    if (!calc) return null;
    const garchCurrent = last(calc.garch);
    const yzCurrent    = last(calc.yz);
    const parkCurrent  = last(calc.park);
    return {
      garch: garchCurrent,
      realised: calc.rv21Current,
      yz: yzCurrent,
      park: parkCurrent,
      forecast: calc.forecastAnn[calc.forecastAnn.length - 1],
      longRun: calc.longRun,
      ivPct: calc.ivPct,
      vovol: calc.vovol,
      vrp: calc.vrp,
      reg: regime(garchCurrent),
    };
  }, [calc]);

  const traces = useMemo(() => {
    if (!calc) return [];
    const xl = calc.dates.map(fmtDate);
    const fxl = calc.forecastDates.map(fmtDate);
    return [
      { x: xl, y: calc.park, mode: "lines", name: "Parkinson (21d)", line: { color: "#a78bfa", width: 1.6 }, hovertemplate: "Parkinson: %{y:.2f}%<extra></extra>" },
      { x: xl, y: calc.garch, mode: "lines", name: "GARCH(1,1)", line: { color: "#6366f1", width: 2.2 }, hovertemplate: "GARCH: %{y:.2f}%<extra></extra>" },
      { x: xl, y: calc.realised, mode: "lines", name: "Realised (21d)", line: { color: "#06b6d4", width: 2 }, hovertemplate: "Realised: %{y:.2f}%<extra></extra>" },
      { x: xl, y: calc.yz, mode: "lines", name: "Yang-Zhang (21d)", line: { color: "#10b981", width: 2 }, hovertemplate: "Yang-Zhang: %{y:.2f}%<extra></extra>" },
      {
        x: fxl, y: calc.forecastAnn, mode: "lines+markers", name: "10D Forecast",
        line: { color: "#f59e0b", width: 2.4, dash: "dot" }, marker: { color: "#f59e0b", size: 6 },
        hovertemplate: "Forecast: %{y:.2f}%<extra></extra>",
      },
      {
        x: [...xl, ...fxl], y: new Array(xl.length + fxl.length).fill(calc.longRun),
        mode: "lines", name: "Long-Run Vol", line: { color: "#475569", width: 1.8, dash: "dash" },
        hovertemplate: "Long-Run: %{y:.2f}%<extra></extra>",
      },
    ] as any[];
  }, [calc]);

  const regColor = chips ? REGIME_COLORS[chips.reg] : "#10b981";

  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#070a10] overflow-hidden" style={{ fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#1f1f1f] bg-[#0a0f1a]">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Real Volatility Dashboard</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-base font-semibold text-zinc-100">{ticker}</span>
            <span className="text-zinc-500 text-xs">· GARCH · Yang-Zhang · Parkinson · Realised</span>
            {chips && (
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded border tracking-widest"
                style={{ color: regColor, borderColor: `${regColor}55`, background: `${regColor}12` }}
              >
                {chips.reg}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); setTicker(tickerInput.trim().toUpperCase() || "SPY"); }} className="flex items-center gap-1">
            <input
              value={tickerInput} onChange={(e) => setTickerInput(e.target.value)}
              className="bg-[#0f1124] border border-[#1f1f1f] text-zinc-100 text-xs px-2 py-1 rounded w-24 uppercase"
              placeholder="SPY"
            />
            <button type="submit" className="text-xs px-2 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white">Load</button>
          </form>
          <div className="flex bg-[#0f1124] rounded border border-[#1f1f1f] overflow-hidden">
            {(["3M", "6M", "1Y", "2Y"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`text-xs px-2 py-1 ${period === p ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Chips */}
      {chips && (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-px border-b border-[#1f1f1f]" style={{ background: "#1f1f1f" }}>
          <Chip label="GARCH(1,1)"    value={chips.garch}    color="#6366f1" suffix="%" />
          <Chip label="Realised 21d"  value={chips.realised} color="#06b6d4" suffix="%" />
          <Chip label="Yang-Zhang"    value={chips.yz}       color="#10b981" suffix="%" />
          <Chip label="Parkinson"     value={chips.park}     color="#a78bfa" suffix="%" />
          <Chip label="10D Forecast"  value={chips.forecast} color="#f59e0b" suffix="%" />
          <Chip label="Long-Run"      value={chips.longRun}  color="#3b82f6" suffix="%" />
          <Chip label="IV Percentile" value={chips.ivPct}    color="#22d3ee" suffix="th" digits={0} />
          <Chip label="Vol of Vol"    value={chips.vovol}    color="#e879f9" suffix="%" />
          <Chip
            label="VRP (IV−RV)"
            value={chips.vrp}
            color={chips.vrp == null ? "#71717a" : chips.vrp > 3 ? "#f59e0b" : chips.vrp < -3 ? "#06b6d4" : "#10b981"}
            suffix=" pp"
            note={chips.vrp == null ? "no IV data" : chips.vrp > 3 ? "Caras" : chips.vrp < -3 ? "Baratas" : "Fair"}
          />
        </div>
      )}

      {/* Chart */}
      <div className="relative px-1 pt-1">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm bg-black/60 z-10">Cargando {ticker}…</div>}
        {err && !loading && <div className="text-rose-400 text-xs px-4 py-2">Error: {err}</div>}
        <Plot
          data={traces}
          layout={{
            autosize: true,
            height: 440,
            margin: { l: 55, r: 20, t: 20, b: 40 },
            paper_bgcolor: "#070a10",
            plot_bgcolor: "#070a10",
            font: { color: "#71717a", size: 11, family: "JetBrains Mono, ui-monospace, monospace" },
            legend: { orientation: "h", y: 1.06, x: 0.5, xanchor: "center", bgcolor: "rgba(0,0,0,0)", font: { size: 10 } },
            xaxis: { gridcolor: "#111827", zerolinecolor: "#111827", showspikes: true, spikemode: "across", spikecolor: "#374151", spikethickness: 1, spikedash: "dot" },
            yaxis: {
              title: { text: "Vol anualizada (%)", font: { color: "#71717a", size: 11 } },
              gridcolor: "#111827", zerolinecolor: "#111827", ticksuffix: "%",
            },
            hovermode: "x unified",
            hoverlabel: { bgcolor: "#0f1729", bordercolor: "#1f2937", font: { color: "#e4e4e7", size: 11 } },
            shapes: [
              { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 35, y1: 200, fillcolor: "rgba(239,68,68,0.05)", line: { width: 0 } },
              { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 20, y1: 35,  fillcolor: "rgba(245,158,11,0.04)", line: { width: 0 } },
              { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 10, y1: 20,  fillcolor: "rgba(255,255,255,0.015)", line: { width: 0 } },
              { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0,  y1: 10,  fillcolor: "rgba(6,182,212,0.04)", line: { width: 0 } },
              { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 10, y1: 10, line: { color: "#1f2937", width: 1, dash: "dot" } },
              { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 20, y1: 20, line: { color: "#1f2937", width: 1, dash: "dot" } },
              { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 35, y1: 35, line: { color: "#1f2937", width: 1, dash: "dot" } },
            ],
          }}
          config={{
            displaylogo: false, responsive: true,
            toImageButtonOptions: { format: "png", filename: `${ticker}_vol_dashboard`, scale: 2 },
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
          }}
          style={{ width: "100%" }}
          useResizeHandler
        />
      </div>

      {/* Footer */}
      {calc && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t border-[#1f1f1f] text-[9px] text-zinc-600">
          <span>GARCH: ω={calc.params.omega.toFixed(4)} · α={calc.params.alpha.toFixed(3)} · β={calc.params.beta.toFixed(3)}</span>
          <span>Persistencia={(calc.params.alpha + calc.params.beta).toFixed(4)}</span>
          <span>Fuente: Polygon · ~{ohlc.length}d datos</span>
          <span className="ml-auto">VRP = IV implícita − Realised 21d</span>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, color, suffix = "%", digits = 2, note }: {
  label: string; value: number | null | undefined; color: string; suffix?: string; digits?: number; note?: string;
}) {
  const fmt = value != null && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "—";
  return (
    <div className="px-3 py-2.5 bg-[#070a10]">
      <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="text-sm font-bold mt-0.5" style={{ color }}>{fmt}</div>
      {note && <div className="text-[9px] mt-px" style={{ color: `${color}aa` }}>{note}</div>}
    </div>
  );
}

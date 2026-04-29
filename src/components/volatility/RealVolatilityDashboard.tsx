import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { supabase } from "@/integrations/supabase/client";

interface OHLC { time: number; open: number; high: number; low: number; close: number; }
interface Props { defaultTicker?: string; }

const ANN = Math.sqrt(252);

// ─── Helpers ─────────────────────────────────────────────
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

// Yang-Zhang OHLC volatility (rolling, 21d). Returns annualized %.
function yangZhang(ohlc: OHLC[], window = 21): (number | null)[] {
  const n = ohlc.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < window + 1) return out;

  // Per-day components, requires previous close
  const overnight: number[] = []; // ln(O_t / C_{t-1})
  const openClose: number[] = []; // ln(C_t / O_t)
  const rs: number[] = [];        // Rogers-Satchell
  for (let i = 1; i < n; i++) {
    const o = ohlc[i].open, h = ohlc[i].high, l = ohlc[i].low, c = ohlc[i].close, pc = ohlc[i - 1].close;
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
    // align to ohlc index (overnight starts at i=1)
    out[i + 1] = yz;
  }
  return out;
}

// GARCH(1,1) — simplified MLE via grid search/refinement on ω, α, β.
// returns { sigma2_series (variance), omega, alpha, beta }
function fitGarch11(returns: number[]): { sigma2: number[]; omega: number; alpha: number; beta: number } {
  const r = returns.map((x) => x * 100); // percent units, classic arch convention
  const n = r.length;
  if (n < 30) return { sigma2: new Array(n).fill(NaN), omega: 0, alpha: 0, beta: 0 };

  const uncondVar = r.reduce((a, b) => a + b * b, 0) / n;

  function negLL(omega: number, alpha: number, beta: number): { ll: number; sigma2: number[] } {
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

  // Coarse grid then local refine
  let best = { ll: Infinity, omega: 0.05, alpha: 0.08, beta: 0.9, sigma2: [] as number[] };
  const omegas = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2];
  const alphas = [0.03, 0.05, 0.08, 0.12, 0.18];
  const betas = [0.75, 0.82, 0.88, 0.92, 0.95];
  for (const w of omegas) for (const a of alphas) for (const b of betas) {
    if (a + b >= 0.999) continue;
    const { ll, sigma2 } = negLL(w, a, b);
    if (ll < best.ll) best = { ll, omega: w, alpha: a, beta: b, sigma2 };
  }
  // local refine
  for (let iter = 0; iter < 3; iter++) {
    const step = 0.5 / (iter + 1);
    const cand: Array<[number, number, number]> = [];
    for (const dw of [-step, 0, step]) for (const da of [-step * 0.05, 0, step * 0.05]) for (const db of [-step * 0.05, 0, step * 0.05]) {
      const w = best.omega * (1 + dw); const a = best.alpha + da; const b = best.beta + db;
      if (w <= 0 || a <= 0 || b <= 0 || a + b >= 0.999) continue;
      cand.push([w, a, b]);
    }
    for (const [w, a, b] of cand) {
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

export function RealVolatilityDashboard({ defaultTicker = "SPY" }: Props) {
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
        const tf = period === "2Y" ? "1Y" : period; // edge supports up to 1Y; we'll concatenate if 2Y
        const { data, error } = await supabase.functions.invoke("polygon-price-history", {
          body: null,
          // GET-style via query
        });
        // fallback: fetch via URL directly to support query params
        const url = `https://ikvwejdepfvjuofcnbww.supabase.co/functions/v1/polygon-price-history?symbol=${encodeURIComponent(ticker)}&timeframe=${tf}`;
        const r = await fetch(url, {
          headers: { apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrdndlamRlcGZ2anVvZmNuYnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTQ4OTEsImV4cCI6MjA5Mjc5MDg5MX0.JC55rSwUf8tG3VEjMAE-MCrxCpncGKIcf3La9oUS0JE" },
        });
        const j = await r.json();
        if (cancelled) return;
        if (j.error || !j.ohlc?.length) {
          setErr(j.error || "No data");
          setOhlc([]);
        } else {
          setOhlc(j.ohlc);
        }
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
    const dates = ohlc.map((p) => p.time);
    const rets = logReturns(closes); // length n-1, aligned to dates[1..]

    // Realised vol (21d rolling) — annualized %
    const rv = rollingStd(rets, 21).map((v) => (v == null ? null : v * ANN * 100));
    // Pad to align with dates (length n)
    const realisedAligned: (number | null)[] = [null, ...rv];

    // GARCH(1,1) — daily conditional vol annualized
    const { sigma2, omega, alpha, beta } = fitGarch11(rets);
    // sigma2 is in (% units)^2; sqrt -> daily % vol; *sqrt(252) -> annualized %
    const garchDailyPct = sigma2.map((s2) => Math.sqrt(Math.max(s2, 0)));
    const garchAnnualized = garchDailyPct.map((g) => g * ANN);
    const garchAligned: (number | null)[] = [null, ...garchAnnualized];

    // Long-run vol
    const longRun = (1 - alpha - beta) > 0
      ? Math.sqrt(omega / (1 - alpha - beta)) * ANN
      : NaN;

    // 10-day forecast (variance recursion)
    const lastSigma2 = sigma2[sigma2.length - 1];
    const lastR = rets[rets.length - 1] * 100;
    const forecastVar: number[] = [];
    let prevSigma2 = lastSigma2;
    let prevR2 = lastR * lastR;
    for (let h = 1; h <= 10; h++) {
      const nextS2 = omega + alpha * prevR2 + beta * prevSigma2;
      forecastVar.push(nextS2);
      prevSigma2 = nextS2;
      prevR2 = nextS2; // E[r_t^2] = sigma_t^2 in expectation
    }
    const forecastAnn = forecastVar.map((v) => Math.sqrt(Math.max(v, 0)) * ANN);
    // Build forecast dates (extend by trading days approx +1d each)
    const lastTs = dates[dates.length - 1];
    const forecastDates: number[] = [];
    let cur = lastTs;
    for (let i = 0; i < 10; i++) { cur += 86400; forecastDates.push(cur); }

    // Yang-Zhang aligned to dates (length n)
    const yz = yangZhang(ohlc, 21);

    return {
      dates,
      realised: realisedAligned,
      garch: garchAligned,
      yz,
      forecastDates,
      forecastAnn,
      longRun,
      params: { omega, alpha, beta },
    };
  }, [ohlc]);

  const traces = useMemo(() => {
    if (!calc) return [];
    const xLabels = calc.dates.map(fmtDate);
    const fxLabels = calc.forecastDates.map(fmtDate);
    const last = (arr: (number | null)[]) => {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as number;
      return null;
    };
    return [
      {
        x: xLabels, y: calc.garch, mode: "lines", name: "GARCH(1,1)",
        line: { color: "#6366f1", width: 2.2 }, hovertemplate: "GARCH: %{y:.2f}%<extra></extra>",
      },
      {
        x: xLabels, y: calc.realised, mode: "lines", name: "Realised (21d)",
        line: { color: "#06b6d4", width: 2 }, hovertemplate: "Realised: %{y:.2f}%<extra></extra>",
      },
      {
        x: xLabels, y: calc.yz, mode: "lines", name: "Yang-Zhang (21d)",
        line: { color: "#10b981", width: 2 }, hovertemplate: "Yang-Zhang: %{y:.2f}%<extra></extra>",
      },
      {
        x: fxLabels, y: calc.forecastAnn, mode: "lines+markers", name: "10-Day Forecast",
        line: { color: "#f59e0b", width: 2.4, dash: "dot" }, marker: { color: "#f59e0b", size: 6 },
        hovertemplate: "Forecast: %{y:.2f}%<extra></extra>",
      },
      {
        x: [...xLabels, ...fxLabels],
        y: new Array(xLabels.length + fxLabels.length).fill(calc.longRun),
        mode: "lines", name: "Long-Run Vol",
        line: { color: "#1e3a8a", width: 1.8, dash: "dash" },
        hovertemplate: "Long-Run: %{y:.2f}%<extra></extra>",
      },
    ] as any[];
  }, [calc]);

  const currentVals = useMemo(() => {
    if (!calc) return null;
    const last = (arr: (number | null)[]) => {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && Number.isFinite(arr[i] as number)) return arr[i] as number;
      return null;
    };
    return {
      garch: last(calc.garch),
      realised: last(calc.realised),
      yz: last(calc.yz),
      forecast: calc.forecastAnn[calc.forecastAnn.length - 1],
      longRun: calc.longRun,
    };
  }, [calc]);

  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] p-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Real Volatility Dashboard</div>
          <div className="text-lg font-semibold text-zinc-100">
            {ticker} <span className="text-zinc-500 text-sm">· GARCH · Yang-Zhang · Realised</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => { e.preventDefault(); setTicker(tickerInput.trim().toUpperCase() || "SPY"); }}
            className="flex items-center gap-1"
          >
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              className="bg-[#0f1124] border border-[#1f1f1f] text-zinc-100 text-xs px-2 py-1 rounded w-24 uppercase"
              placeholder="SPY"
            />
            <button type="submit" className="text-xs px-2 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white">Load</button>
          </form>
          <div className="flex bg-[#0f1124] rounded border border-[#1f1f1f] overflow-hidden">
            {(["3M", "6M", "1Y", "2Y"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs px-2 py-1 ${period === p ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric chips */}
      {currentVals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          <Chip label="GARCH(1,1)" value={currentVals.garch} color="#6366f1" />
          <Chip label="Realised 21d" value={currentVals.realised} color="#06b6d4" />
          <Chip label="Yang-Zhang 21d" value={currentVals.yz} color="#10b981" />
          <Chip label="10D Forecast" value={currentVals.forecast} color="#f59e0b" />
          <Chip label="Long-Run" value={currentVals.longRun} color="#3b82f6" />
        </div>
      )}

      {/* Chart */}
      <div className="relative">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm bg-black/40 z-10">Loading {ticker}…</div>}
        {err && !loading && <div className="text-rose-400 text-xs mb-2">Error: {err}</div>}
        <Plot
          data={traces}
          layout={{
            autosize: true,
            height: 460,
            margin: { l: 55, r: 20, t: 30, b: 45 },
            paper_bgcolor: "#0a0a0a",
            plot_bgcolor: "#0a0a0a",
            font: { color: "#a1a1aa", size: 11, family: "Inter, system-ui, sans-serif" },
            legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", bgcolor: "rgba(0,0,0,0)" },
            xaxis: {
              gridcolor: "#1f1f1f", zerolinecolor: "#1f1f1f",
              showspikes: true, spikemode: "across", spikecolor: "#71717a", spikethickness: 1, spikedash: "dot",
            },
            yaxis: {
              title: { text: "Annualised Volatility (%)", font: { color: "#a1a1aa", size: 11 } },
              gridcolor: "#1f1f1f", zerolinecolor: "#1f1f1f", ticksuffix: "%",
            },
            hovermode: "x unified",
            hoverlabel: { bgcolor: "#1a1a2e", bordercolor: "#3f3f46", font: { color: "#e4e4e7", size: 11 } },
            shapes: [
              // background gradient bands (high / mid / low vol)
              { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 35, y1: 1000, fillcolor: "rgba(244,63,94,0.06)", line: { width: 0 } },
              { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 18, y1: 35, fillcolor: "rgba(255,255,255,0.02)", line: { width: 0 } },
              { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0, y1: 18, fillcolor: "rgba(59,130,246,0.05)", line: { width: 0 } },
              // reference lines
              { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 12, y1: 12, line: { color: "#3f3f46", width: 1, dash: "dot" } },
              { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 25, y1: 25, line: { color: "#3f3f46", width: 1, dash: "dot" } },
              { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 35, y1: 35, line: { color: "#3f3f46", width: 1, dash: "dot" } },
            ],
          }}
          config={{
            displaylogo: false,
            responsive: true,
            toImageButtonOptions: { format: "png", filename: `${ticker}_vol_dashboard`, scale: 2 },
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
          }}
          style={{ width: "100%" }}
          useResizeHandler
        />
      </div>

      {calc && (
        <div className="mt-2 text-[10px] text-zinc-500">
          GARCH params: ω={calc.params.omega.toFixed(4)} · α={calc.params.alpha.toFixed(3)} · β={calc.params.beta.toFixed(3)} · persistence={(calc.params.alpha + calc.params.beta).toFixed(3)}
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0f1124] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-semibold" style={{ color }}>
        {value != null && Number.isFinite(value) ? `${value.toFixed(2)}%` : "—"}
      </div>
    </div>
  );
}

// Log Return Anomaly Detector — implementación fiel al algoritmo Python original
// Fuente: GEXSATELIT 5m · Ventana rolling 20 · Umbral ±2σ · Zona horaria NY
import { useEffect, useRef, useState, useCallback } from "react";
import Plot from "react-plotly.js";

interface Bar { ts: number; close: number }

interface AnomalyPoint {
  ts: number;
  logReturn: number;
  upper: number;
  lower: number;
  direction: "above" | "below";
}

const SYMBOLS: { label: string; yahoo: string }[] = [
  { label: "S&P 500",      yahoo: "^GSPC"    },
  { label: "NASDAQ 100",   yahoo: "^NDX"     },
  { label: "EUR/JPY",      yahoo: "EURJPY=X" },
  { label: "SPY",          yahoo: "SPY"      },
  { label: "QQQ",          yahoo: "QQQ"      },
  { label: "VIX",          yahoo: "^VIX"     },
  { label: "NVDA",         yahoo: "NVDA"     },
  { label: "TSLA",         yahoo: "TSLA"     },
];

const WINDOW   = 20;
const THRESHOLD = 2;

// ── GEXSATELIT parser (v8 chart API) ──────────────────────────────────────
function parseYahoo(raw: unknown): Bar[] {
  let d = raw as Record<string, unknown>;
  if (typeof (d as any).contents === "string") {
    try { d = JSON.parse((d as any).contents); } catch { return []; }
  }
  const result = (((d as any)?.chart?.result) as any[])?.[0];
  if (!result) return [];
  const timestamps: number[]     = result.timestamp ?? [];
  const closes:     (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c) && c > 0) bars.push({ ts: timestamps[i] * 1000, close: c });
  }
  return bars;
}

async function fetchYahoo(yahoo: string): Promise<Bar[]> {
  const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=5m&range=5d&includePrePost=false`;
  const urls = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(base)}`,
    `https://corsproxy.io/?${encodeURIComponent(base)}`,
    base.replace("query1", "query2"),
    base,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { mode: "cors" });
      if (!r.ok) continue;
      const j = await r.json();
      const bars = parseYahoo(j);
      if (bars.length > 20) return bars;
    } catch { /* try next */ }
  }
  return [];
}

// ── Rolling stats + anomaly detection ────────────────────────────────────────
interface Computed {
  dates:      number[];
  logRets:    (number | null)[];
  upper:      (number | null)[];
  lower:      (number | null)[];
  anomalies:  AnomalyPoint[];
}

function compute(bars: Bar[]): Computed {
  const n = bars.length;
  const logRets: (number | null)[] = [null];
  for (let i = 1; i < n; i++) {
    logRets.push(bars[i].close > 0 && bars[i - 1].close > 0
      ? Math.log(bars[i].close / bars[i - 1].close)
      : null);
  }

  const upper:     (number | null)[] = new Array(n).fill(null);
  const lower:     (number | null)[] = new Array(n).fill(null);
  const anomalies: AnomalyPoint[]   = [];

  for (let i = WINDOW; i < n; i++) {
    const slice = logRets.slice(i - WINDOW + 1, i + 1).filter((v): v is number => v != null);
    if (slice.length < WINDOW * 0.8) continue;
    const mean = slice.reduce((s, x) => s + x, 0) / slice.length;
    const std  = Math.sqrt(slice.reduce((s, x) => s + (x - mean) ** 2, 0) / slice.length) || 1e-10;
    const u = mean + THRESHOLD * std;
    const l = mean - THRESHOLD * std;
    upper[i] = u;
    lower[i] = l;
    const lr = logRets[i];
    if (lr != null && (lr > u || lr < l)) {
      anomalies.push({ ts: bars[i].ts, logReturn: lr, upper: u, lower: l, direction: lr > u ? "above" : "below" });
    }
  }

  return { dates: bars.map((b) => b.ts), logRets, upper, lower, anomalies };
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function fmtNY(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LogReturnAnomalyPanel() {
  const [symIdx,   setSymIdx]   = useState(0);
  const [bars,     setBars]     = useState<Bar[]>([]);
  const [status,   setStatus]   = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errMsg,   setErrMsg]   = useState("");
  const aborted = useRef(false);

  const load = useCallback(async (idx: number) => {
    aborted.current = false;
    setStatus("loading");
    setBars([]);
    const { yahoo } = SYMBOLS[idx];
    const result = await fetchYahoo(yahoo);
    if (aborted.current) return;
    if (!result.length) { setStatus("error"); setErrMsg("Cargando datos de GEXSATELIT…"); return; }
    setBars(result);
    setStatus("ok");
  }, []);

  useEffect(() => {
    load(symIdx);
    return () => { aborted.current = true; };
  }, [symIdx, load]);

  const computed = bars.length > WINDOW ? compute(bars) : null;
  const last5    = computed ? computed.anomalies.slice(-5) : [];
  const lastAnom = last5[last5.length - 1];

  const isoX = computed?.dates.map((ts) =>
    new Date(ts).toISOString()
  ) ?? [];

  // ── Plotly traces ─────────────────────────────────────────────────────────
  const traces: any[] = computed ? [
    {
      x: isoX,
      y: computed.logRets,
      type: "scatter", mode: "lines",
      name: "Log Return",
      line: { color: "#94a3b8", width: 1.2 },
      hovertemplate: "%{x|%m/%d %H:%M}<br>LogRet: %{y:.5f}<extra></extra>",
    },
    {
      x: isoX,
      y: computed.upper,
      type: "scatter", mode: "lines",
      name: "Upper Threshold (+2σ)",
      line: { color: "#ef4444", width: 1.5, dash: "dash" },
      hovertemplate: "+2σ: %{y:.5f}<extra></extra>",
    },
    {
      x: isoX,
      y: computed.lower,
      type: "scatter", mode: "lines",
      name: "Lower Threshold (−2σ)",
      line: { color: "#10b981", width: 1.5, dash: "dash" },
      hovertemplate: "−2σ: %{y:.5f}<extra></extra>",
    },
    {
      x: computed.anomalies.map((a) => new Date(a.ts).toISOString()),
      y: computed.anomalies.map((a) => a.logReturn),
      type: "scatter", mode: "markers",
      name: "Anomalía",
      marker: { color: "#f97316", size: 9, symbol: "circle", line: { width: 1.5, color: "#fbbf24" } },
      hovertemplate: "%{x|%m/%d %H:%M}<br>LogRet: %{y:.5f}<extra>Anomalía</extra>",
    },
  ] : [];

  // Last anomaly annotation
  const annotations: any[] = [];
  if (lastAnom) {
    const dir  = lastAnom.direction === "above" ? "por arriba" : "por debajo";
    const sign = lastAnom.direction === "above" ? "↑ Posible rechazo / corrección" : "↓ Buscar posible rebote";
    annotations.push({
      x: new Date(lastAnom.ts).toISOString(),
      y: lastAnom.logReturn,
      xref: "x", yref: "y",
      text: `LogRet ${dir} de 2σ<br>${sign}`,
      showarrow: true,
      arrowhead: 2,
      arrowcolor: "#ef4444",
      ax: 0, ay: lastAnom.direction === "above" ? -48 : 48,
      bgcolor: "#fbbf24",
      bordercolor: "#f59e0b",
      borderwidth: 1,
      font: { color: "#000", size: 10, family: "JetBrains Mono, monospace" },
      borderpad: 4,
    });
  }

  const sym = SYMBOLS[symIdx];

  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{ background: "#070a10", border: "1px solid rgba(255,255,255,0.07)", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ background: "#0a0d16", borderColor: "rgba(255,255,255,0.07)" }}>
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>
            Anomalías en Rendimientos Logarítmicos
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-bold text-white">{sym.yahoo}</span>
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              · 5min · Rolling {WINDOW} · ±{THRESHOLD}σ · Zona NY
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SYMBOLS.map((s, i) => (
            <button
              key={s.yahoo}
              onClick={() => setSymIdx(i)}
              className="text-[10px] font-bold px-2.5 py-1 rounded border transition-all"
              style={i === symIdx
                ? { background: "#f97316", borderColor: "#f97316", color: "#000" }
                : { background: "transparent", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 border-b flex items-center gap-3" style={{ borderColor: "rgba(255,255,255,0.05)", background: "#060810" }}>
        {status === "loading" && (
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "#f59e0b" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Descargando {sym.yahoo} (GEXSATELIT 5m, últimos 5 días)…
          </div>
        )}
        {status === "ok" && computed && (
          <div className="flex items-center gap-4 text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {bars.length} barras 5m cargadas
            </span>
            <span className="text-orange-400 font-bold">{computed.anomalies.length} anomalías detectadas</span>
            {bars.length > 0 && (
              <span>Último: {fmtNY(bars[bars.length - 1].ts)} NY</span>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="text-[10px] text-red-400">{errMsg}</div>
        )}
        <button
          onClick={() => load(symIdx)}
          className="ml-auto text-[10px] px-2 py-0.5 rounded border hover:opacity-80 transition-opacity"
          style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}
        >
          ↺ Recargar
        </button>
      </div>

      {/* Chart */}
      <div className="relative" style={{ minHeight: 400 }}>
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#070a10", zIndex: 10 }}>
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Cargando datos de GEXSATELIT…</div>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#070a10" }}>
            <div className="text-center space-y-2">
              <div className="text-2xl">⚠</div>
              <div className="text-sm text-red-400">Cargando datos de GEXSATELIT…</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>Verifica tu conexión a internet e intenta de nuevo</div>
              <button onClick={() => load(symIdx)} className="mt-2 text-xs px-3 py-1 rounded bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30">
                Reintentar
              </button>
            </div>
          </div>
        )}
        {computed && status === "ok" && (
          <Plot
            data={traces}
            layout={{
              autosize: true,
              height: 440,
              margin: { l: 65, r: 20, t: 20, b: 50 },
              paper_bgcolor: "#070a10",
              plot_bgcolor:  "#070a10",
              font: { color: "#71717a", size: 11, family: "JetBrains Mono, ui-monospace, monospace" },
              legend: {
                orientation: "h", y: 1.06, x: 0.5, xanchor: "center",
                bgcolor: "rgba(0,0,0,0)", font: { size: 10 },
              },
              xaxis: {
                type: "date",
                gridcolor: "#111827", zerolinecolor: "#111827",
                tickformat: "%m/%d %H:%M",
                showspikes: true, spikemode: "across",
                spikecolor: "#374151", spikethickness: 1, spikedash: "dot",
              },
              yaxis: {
                title: { text: "Log Return", font: { color: "#71717a", size: 11 } },
                gridcolor: "#111827", zerolinecolor: "rgba(255,255,255,0.15)",
                zeroline: true, zerolinewidth: 1,
                tickformat: ".5f",
              },
              hovermode: "x unified",
              hoverlabel: { bgcolor: "#0f1729", bordercolor: "#1f2937", font: { color: "#e4e4e7", size: 10 } },
              annotations,
              shapes: [
                // Zero line highlight band
                { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: -0.0002, y1: 0.0002, fillcolor: "rgba(255,255,255,0.03)", line: { width: 0 } },
              ],
            }}
            config={{
              displaylogo: false, responsive: true,
              toImageButtonOptions: { format: "png", filename: `logreturn_anomaly_${sym.yahoo}`, scale: 2 },
              modeBarButtonsToRemove: ["lasso2d", "select2d"],
            }}
            style={{ width: "100%" }}
            useResizeHandler
          />
        )}
      </div>

      {/* Last 5 anomalies table */}
      {last5.length > 0 && (
        <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="px-4 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Últimas 5 anomalías detectadas (hora NY)
          </div>
          <div className="px-4 pb-4">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Fecha/Hora (NY)", "Log Return", "Upper +2σ", "Lower −2σ", "Dirección", "Señal"].map((h) => (
                    <th key={h} className="py-1.5 px-2 text-left font-bold uppercase text-[8px]" style={{ color: "rgba(255,255,255,0.25)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {last5.map((a, i) => {
                  const isLast = i === last5.length - 1;
                  const col    = a.direction === "above" ? "#f97316" : "#ef4444";
                  const signal = a.direction === "above"
                    ? "↑ Posible corrección / rechazo"
                    : "↓ Posible rebote / soporte";
                  return (
                    <tr
                      key={a.ts}
                      className="border-b transition-colors"
                      style={{
                        borderColor: "rgba(255,255,255,0.04)",
                        background: isLast ? "rgba(249,115,22,0.06)" : "transparent",
                      }}
                    >
                      <td className="py-1.5 px-2 font-bold" style={{ color: isLast ? "#fbbf24" : "rgba(255,255,255,0.6)" }}>
                        {fmtDate(a.ts)}{isLast && <span className="ml-1 text-[7px] bg-orange-500/20 text-orange-400 px-1 rounded">ÚLTIMA</span>}
                      </td>
                      <td className="py-1.5 px-2 font-bold tabular-nums" style={{ color: col }}>
                        {a.logReturn >= 0 ? "+" : ""}{a.logReturn.toFixed(5)}
                      </td>
                      <td className="py-1.5 px-2 tabular-nums" style={{ color: "rgba(239,68,68,0.8)" }}>
                        +{a.upper.toFixed(5)}
                      </td>
                      <td className="py-1.5 px-2 tabular-nums" style={{ color: "rgba(16,185,129,0.8)" }}>
                        {a.lower.toFixed(5)}
                      </td>
                      <td className="py-1.5 px-2">
                        <span className="font-bold text-[9px] px-1.5 py-0.5 rounded border"
                          style={{ color: col, borderColor: `${col}44`, background: `${col}15` }}>
                          {a.direction === "above" ? "ARRIBA" : "ABAJO"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 font-semibold" style={{ color: col }}>{signal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t text-[8px] uppercase tracking-wider"
        style={{ borderColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.2)" }}>
        <span>Fuente: GEXSATELIT · Intervalo 5m · Últimos 5 días de trading</span>
        <span>Ventana rolling {WINDOW} barras · Umbral ±{THRESHOLD}σ · Zona horaria America/New_York</span>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  CandlestickData,
  UTCTimestamp,
  IPriceLine,
} from "lightweight-charts";
import { GEXBarsPanel, type StrikeRow } from "./GEXBarsPanel";
import { GEXSidebar } from "./GEXSidebar";

const TICKERS = ["QQQ", "SPY", "NQ", "IWM", "DIA", "AAPL", "MSFT", "NVDA", "TSLA", "AMD", "META"];
const TIMEFRAMES = ["1D", "5D", "1M", "3M", "6M", "1Y"] as const;
type TF = typeof TIMEFRAMES[number];
type ChartMode = "line" | "candle";
type DteFilter = "0" | "1" | "1D";

interface PricePoint { time: number; value: number }
interface OhlcPoint { time: number; open: number; high: number; low: number; close: number }
interface PricePayload {
  symbol: string;
  points: PricePoint[];
  ohlc?: OhlcPoint[];
  spot: number;
  change: number;
  changePct: number;
  error?: string;
}

interface ChainContract {
  ticker: string; strike: number; expiration: string; side: "call" | "put";
  bid: number; ask: number; last: number; iv: number; oi: number; volume: number;
  delta: number; gamma: number; theta: number; vega: number;
}
interface ChainPayload {
  symbol: string; spot: number; selectedExpiration: string; expirations: string[];
  contracts: ChainContract[]; error?: string;
}

interface Props {
  defaultSymbol?: string;
}

function daysUntil(iso: string): number {
  const exp = new Date(iso + "T21:00:00Z").getTime();
  return Math.max(0, Math.round((exp - Date.now()) / 86_400_000));
}

export function IntegratedGEXChart({ defaultSymbol = "QQQ" }: Props) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState<TF>("3M");
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [dteFilter, setDteFilter] = useState<DteFilter>("1D");
  const [price, setPrice] = useState<PricePayload | null>(null);
  const [chain, setChain] = useState<ChainPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const lineSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);

  // Fetchers
  const fetchPrice = async () => {
    try {
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/polygon-price-history?symbol=${symbol}&timeframe=${timeframe}`;
      const r = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const j: PricePayload = await r.json();
      setPrice(j);
    } catch (e) {
      console.error(e);
    }
  };
  const fetchChain = async () => {
    try {
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/polygon-options-chain?symbol=${symbol}`;
      const r = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const j: ChainPayload = await r.json();
      setChain(j);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPrice(), fetchChain()]).finally(() => setLoading(false));
    const t = setInterval(() => { fetchPrice(); fetchChain(); }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  // Init chart
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      layout: { background: { color: "#000000" }, textColor: "#6b7280", fontFamily: "monospace" },
      grid: { vertLines: { color: "#0f0f0f" }, horzLines: { color: "#0f0f0f" } },
      crosshair: { mode: 1 },
      timeScale: { borderColor: "#1f1f1f", timeVisible: true },
      rightPriceScale: { borderColor: "#1f1f1f" },
    });
    chartApi.current = chart;

    const ro = new ResizeObserver(() => {
      if (chartRef.current && chartApi.current) {
        chartApi.current.applyOptions({
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight,
        });
      }
    });
    ro.observe(chartRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartApi.current = null;
      lineSeries.current = null;
      candleSeries.current = null;
      priceLines.current = [];
    };
  }, []);

  // Build strike rows (filtered by DTE) from chain
  const strikeRows: StrikeRow[] = useMemo(() => {
    if (!chain || !chain.contracts.length) return [];
    const spot = chain.spot;
    const maxDte = parseInt(dteFilter, 10);
    const filtered = chain.contracts.filter((c) => daysUntil(c.expiration) <= maxDte);
    const map = new Map<number, StrikeRow>();
    filtered.forEach((c) => {
      const cur = map.get(c.strike) ?? { strike: c.strike, callGEX: 0, putGEX: 0, callOI: 0, putOI: 0 };
      const gex = (c.gamma || 0) * (c.oi || 0) * 100 * spot * spot * 0.01;
      if (c.side === "call") { cur.callGEX += gex; cur.callOI += c.oi; }
      else { cur.putGEX += gex; cur.putOI += c.oi; }
      map.set(c.strike, cur);
    });
    const all = Array.from(map.values()).sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 28);
    return all;
  }, [chain, dteFilter]);

  // Sidebar metrics & key levels
  const metrics = useMemo(() => {
    const callGEX = strikeRows.reduce((s, r) => s + r.callGEX, 0);
    const putGEX = strikeRows.reduce((s, r) => s + r.putGEX, 0);
    const callOI = strikeRows.reduce((s, r) => s + r.callOI, 0);
    const putOI = strikeRows.reduce((s, r) => s + r.putOI, 0);
    // Call wall: max positive call GEX. Put wall: max put GEX (most negative net)
    const sortedByCall = [...strikeRows].sort((a, b) => b.callGEX - a.callGEX);
    const sortedByPut = [...strikeRows].sort((a, b) => b.putGEX - a.putGEX);
    const callWall = sortedByCall[0]?.strike;
    const putWall = sortedByPut[0]?.strike;
    // Zero gamma estimate: nearest strike where cumulative net GEX flips
    const sorted = [...strikeRows].sort((a, b) => a.strike - b.strike);
    let zg: number | undefined = chain?.spot;
    let cum = 0;
    for (const r of sorted) {
      const before = cum;
      cum += r.callGEX - r.putGEX;
      if ((before <= 0 && cum > 0) || (before >= 0 && cum < 0)) { zg = r.strike; break; }
    }
    return {
      keyLevels: { zeroGamma: zg, callWall, putWall },
      aggregates: { netGEX: callGEX - putGEX, callGEX, putGEX, totalCallOI: callOI, totalPutOI: putOI },
    };
  }, [strikeRows, chain]);

  // Switch series when chartMode changes (or on mount once chart exists)
  useEffect(() => {
    const chart = chartApi.current;
    if (!chart) return;
    // Remove previous series
    if (lineSeries.current) { try { chart.removeSeries(lineSeries.current); } catch {} lineSeries.current = null; }
    if (candleSeries.current) { try { chart.removeSeries(candleSeries.current); } catch {} candleSeries.current = null; }
    priceLines.current = [];

    if (chartMode === "line") {
      lineSeries.current = chart.addLineSeries({
        color: "#06b6d4", lineWidth: 2, lastValueVisible: true, priceLineVisible: true,
        priceLineColor: "#ffffff", priceLineStyle: 2, priceLineWidth: 1,
      });
    } else {
      candleSeries.current = chart.addCandlestickSeries({
        upColor: "#10b981", downColor: "#ef4444",
        borderUpColor: "#10b981", borderDownColor: "#ef4444",
        wickUpColor: "#10b981", wickDownColor: "#ef4444",
        priceLineVisible: true, priceLineColor: "#ffffff", priceLineStyle: 2, priceLineWidth: 1,
      });
    }
  }, [chartMode]);

  // Update data when price or mode changes
  useEffect(() => {
    if (!price) return;
    if (chartMode === "line" && lineSeries.current && price.points?.length) {
      const data = price.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })) as LineData<UTCTimestamp>[];
      lineSeries.current.setData(data);
      chartApi.current?.timeScale().fitContent();
    } else if (chartMode === "candle" && candleSeries.current && price.ohlc?.length) {
      const data = price.ohlc.map((p) => ({
        time: p.time as UTCTimestamp,
        open: p.open, high: p.high, low: p.low, close: p.close,
      })) as CandlestickData<UTCTimestamp>[];
      candleSeries.current.setData(data);
      chartApi.current?.timeScale().fitContent();
    } else if (chartMode === "candle" && candleSeries.current && !price.ohlc?.length && price.points?.length) {
      // Fallback: synthesize candles from line points
      const pts = price.points;
      const data: CandlestickData<UTCTimestamp>[] = pts.map((p, i) => {
        const prev = i > 0 ? pts[i - 1].value : p.value;
        const o = prev, c = p.value;
        const h = Math.max(o, c) * 1.001, l = Math.min(o, c) * 0.999;
        return { time: p.time as UTCTimestamp, open: o, high: h, low: l, close: c };
      });
      candleSeries.current.setData(data);
      chartApi.current?.timeScale().fitContent();
    }
  }, [price, chartMode]);

  // Draw key-level price lines on top of the active series
  useEffect(() => {
    const series = chartMode === "line" ? lineSeries.current : candleSeries.current;
    if (!series) return;
    // Clear existing
    priceLines.current.forEach((pl) => { try { series.removePriceLine(pl); } catch {} });
    priceLines.current = [];

    const add = (price: number | undefined, color: string, title: string, style: 0 | 1 | 2 | 3 | 4 = 2) => {
      if (price == null || !Number.isFinite(price)) return;
      const pl = series.createPriceLine({
        price,
        color,
        lineStyle: style,
        lineWidth: 2,
        axisLabelVisible: true,
        title,
      });
      priceLines.current.push(pl);
    };

    add(metrics.keyLevels.callWall, "#10b981", `Call Wall ${metrics.keyLevels.callWall}`);
    add(metrics.keyLevels.putWall, "#ef4444", `Put Wall ${metrics.keyLevels.putWall}`);
    add(metrics.keyLevels.zeroGamma, "#a855f7", `0γ ${metrics.keyLevels.zeroGamma}`);
  }, [metrics, chartMode, price]);

  // Mock max-change rows
  const maxChanges = useMemo(() => {
    const top = [...strikeRows].sort((a, b) => Math.abs(b.callGEX - b.putGEX) - Math.abs(a.callGEX - a.putGEX)).slice(0, 5);
    const labels = ["1 min", "5 min", "10 min", "15 min", "30 min"];
    return top.map((r, i) => ({
      time: labels[i],
      strike: Math.round(r.strike),
      gex: fmtBn(r.callGEX - r.putGEX),
    }));
  }, [strikeRows]);

  const gammaAtSpot = useMemo(() => {
    const livePrice = price?.spot ?? chain?.spot ?? 0;
    if (!livePrice || strikeRows.length === 0) return 0;
    const sorted = [...strikeRows].sort((a, b) => a.strike - b.strike);
    let lower = sorted[0];
    let upper = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].strike <= livePrice && sorted[i + 1].strike >= livePrice) {
        lower = sorted[i]; upper = sorted[i + 1]; break;
      }
    }
    const lNet = lower.callGEX - lower.putGEX;
    const uNet = upper.callGEX - upper.putGEX;
    if (lower.strike === upper.strike) return lNet;
    const t = (livePrice - lower.strike) / (upper.strike - lower.strike);
    return lNet + (uNet - lNet) * t;
  }, [strikeRows, price, chain]);

  const expirationsSorted = useMemo(() => (chain?.expirations ?? []).slice(0, 2), [chain]);

  return (
    <div className="flex flex-col h-full bg-black text-foreground">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-foreground font-bold text-base tracking-wider">{symbol}</div>
          <div className="text-foreground text-sm tabular-nums">${price?.spot?.toFixed(2) ?? "—"}</div>
          <div className={`text-xs tabular-nums ${(price?.changePct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {(price?.changePct ?? 0) >= 0 ? "+" : ""}{price?.changePct?.toFixed(3) ?? "0.000"}%
          </div>

          {/* Chart-mode toggle */}
          <div className="ml-2 flex items-center rounded-sm border border-[#1f1f1f] overflow-hidden">
            {([
              { v: "line" as const, label: "LÍNEA" },
              { v: "candle" as const, label: "VELAS" },
            ]).map((m) => (
              <button
                key={m.v}
                onClick={() => setChartMode(m.v)}
                className="h-6 px-2.5 text-[10px] font-bold tracking-wider"
                style={{
                  background: chartMode === m.v ? "#10b981" : "transparent",
                  color: chartMode === m.v ? "#000" : "#9ca3af",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Timeframe */}
          <div className="ml-1 flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className="h-6 px-2 text-[10px] font-bold rounded-sm border"
                style={{
                  background: timeframe === tf ? "#06b6d4" : "transparent",
                  color: timeframe === tf ? "#000" : "#9ca3af",
                  borderColor: "#1f1f1f",
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* DTE filter for the GEX side panel */}
          <div className="ml-2 flex items-center gap-1">
            <span className="text-[9px] tracking-widest text-muted-foreground font-bold">GAMMA</span>
            {([
              { v: "1" as const, label: "1D" },
              { v: "2" as const, label: "2D" },
              { v: "3" as const, label: "3D" },
            ]).map((d) => (
              <button
                key={d.v}
                onClick={() => setDteFilter(d.v)}
                className="h-6 px-2 text-[10px] font-bold rounded-sm border"
                style={{
                  background: dteFilter === d.v ? "rgba(16,185,129,0.2)" : "transparent",
                  color: dteFilter === d.v ? "#10b981" : "#9ca3af",
                  borderColor: dteFilter === d.v ? "#10b981" : "#1f1f1f",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] flex-wrap">
          <span className="text-muted-foreground">PRICE + GAMMA EXPOSURE</span>
          <span className="flex items-center gap-1 text-foreground">
            <span className="text-muted-foreground">γ@spot:</span>
            <span className={`font-mono font-bold tabular-nums ${gammaAtSpot >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {gammaAtSpot >= 0 ? "+" : ""}{fmtBn(gammaAtSpot)}
            </span>
          </span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400" /> Call Wall</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400" /> Put Wall</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400" /> 0γ</span>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative" style={{ width: "55%" }}>
          <div ref={chartRef} className="absolute inset-0" />
          {loading && !price && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">Loading price…</div>
          )}
        </div>

        <div className="flex-1 border-l border-[#1f1f1f] overflow-hidden">
          {chain && strikeRows.length > 0 ? (
            <GEXBarsPanel rows={strikeRows} spot={chain.spot} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
              {`Sin opciones reales para ≤${dteFilter}D`}
            </div>
          )}
        </div>

        <GEXSidebar
          symbol={symbol}
          spot={chain?.spot ?? 0}
          keyLevels={metrics.keyLevels}
          aggregates={metrics.aggregates}
          maxChanges={maxChanges}
          tickers={TICKERS}
          onTickerChange={setSymbol}
          onLoadHistory={fetchPrice}
          onClearCache={() => { setPrice(null); setChain(null); fetchPrice(); fetchChain(); }}
          expirationLatest={expirationsSorted[0]}
          expirationNext={expirationsSorted[1]}
        />
      </div>
    </div>
  );
}

function fmtBn(v: number): string {
  if (!v) return "0";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(3)}Bn`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  return `${sign}${a.toFixed(0)}`;
}

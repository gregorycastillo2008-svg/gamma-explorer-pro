import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, LineData, UTCTimestamp } from "lightweight-charts";
import { GEXBarsPanel, type StrikeRow } from "./GEXBarsPanel";
import { GEXSidebar } from "./GEXSidebar";

const TICKERS = ["SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "NVDA", "TSLA", "AMD", "META"];
const TIMEFRAMES = ["1D", "5D", "1M", "3M", "6M", "1Y"] as const;
type TF = typeof TIMEFRAMES[number];

interface PricePayload {
  symbol: string;
  points: { time: number; value: number }[];
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

export function IntegratedGEXChart({ defaultSymbol = "QQQ" }: Props) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState<TF>("3M");
  const [price, setPrice] = useState<PricePayload | null>(null);
  const [chain, setChain] = useState<ChainPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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
    seriesRef.current = chart.addLineSeries({
      color: "#06b6d4", lineWidth: 2, lastValueVisible: true, priceLineVisible: true,
      priceLineColor: "#ffffff", priceLineStyle: 2, priceLineWidth: 1,
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current && chartApi.current) {
        chartApi.current.applyOptions({
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight,
        });
      }
    });
    ro.observe(chartRef.current);
    return () => { ro.disconnect(); chart.remove(); chartApi.current = null; seriesRef.current = null; };
  }, []);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || !price?.points?.length) return;
    const data = price.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })) as LineData<UTCTimestamp>[];
    seriesRef.current.setData(data);
    chartApi.current?.timeScale().fitContent();
  }, [price]);

  // Build strike rows from chain (±20 around spot)
  const strikeRows: StrikeRow[] = useMemo(() => {
    if (!chain || !chain.contracts.length) return [];
    const spot = chain.spot;
    const map = new Map<number, StrikeRow>();
    chain.contracts.forEach((c) => {
      const cur = map.get(c.strike) ?? { strike: c.strike, callGEX: 0, putGEX: 0, callOI: 0, putOI: 0 };
      // GEX = gamma * OI * 100 * spot^2 * 0.01
      const gex = (c.gamma || 0) * (c.oi || 0) * 100 * spot * spot * 0.01;
      if (c.side === "call") { cur.callGEX += gex; cur.callOI += c.oi; }
      else { cur.putGEX += gex; cur.putOI += c.oi; }
      map.set(c.strike, cur);
    });
    const all = Array.from(map.values()).sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 28);
    return all;
  }, [chain]);

  // Sidebar metrics
  const metrics = useMemo(() => {
    const callGEX = strikeRows.reduce((s, r) => s + r.callGEX, 0);
    const putGEX = strikeRows.reduce((s, r) => s + r.putGEX, 0);
    const callOI = strikeRows.reduce((s, r) => s + r.callOI, 0);
    const putOI = strikeRows.reduce((s, r) => s + r.putOI, 0);
    // Key levels
    const sortedByGex = [...strikeRows].sort((a, b) => (b.callGEX - b.putGEX) - (a.callGEX - a.putGEX));
    const callWall = sortedByGex[0]?.strike;
    const putWall = sortedByGex[sortedByGex.length - 1]?.strike;
    // Zero gamma estimate: nearest strike where cumulative net GEX flips
    const sorted = [...strikeRows].sort((a, b) => a.strike - b.strike);
    let zg = chain?.spot;
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

  // Mock max-change rows (per-strike intraday delta would need a snapshot history — placeholder real-shape)
  const maxChanges = useMemo(() => {
    const top = [...strikeRows].sort((a, b) => Math.abs(b.callGEX - b.putGEX) - Math.abs(a.callGEX - a.putGEX)).slice(0, 5);
    const labels = ["1 min", "5 min", "10 min", "15 min", "30 min"];
    return top.map((r, i) => ({
      time: labels[i],
      strike: Math.round(r.strike),
      gex: fmtBn(r.callGEX - r.putGEX),
    }));
  }, [strikeRows]);

  // Gamma exposure interpolated AT the current live spot price
  const gammaAtSpot = useMemo(() => {
    const livePrice = price?.spot ?? chain?.spot ?? 0;
    if (!livePrice || strikeRows.length === 0) return 0;
    // Find the two strikes bracketing spot and linearly interpolate net GEX
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
        <div className="flex items-center gap-3">
          <div className="text-foreground font-bold text-base tracking-wider">{symbol}</div>
          <div className="text-foreground text-sm tabular-nums">${price?.spot?.toFixed(2) ?? "—"}</div>
          <div className={`text-xs tabular-nums ${(price?.changePct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {(price?.changePct ?? 0) >= 0 ? "+" : ""}{price?.changePct?.toFixed(3) ?? "0.000"}%
          </div>
          <div className="ml-3 flex gap-1">
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
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-muted-foreground">PRICE + GAMMA EXPOSURE</span>
          <span className="flex items-center gap-1 text-foreground">
            <span className="text-muted-foreground">γ@spot:</span>
            <span className={`font-mono font-bold tabular-nums ${gammaAtSpot >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {gammaAtSpot >= 0 ? "+" : ""}{fmtBn(gammaAtSpot)}
            </span>
          </span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00f514]" /> Call GEX</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ff0000]" /> Put GEX</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> OI %</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-yellow-400" /> Spot</span>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">
        {/* Price chart 55% */}
        <div className="relative" style={{ width: "55%" }}>
          <div ref={chartRef} className="absolute inset-0" />
          {loading && !price && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">Loading price…</div>
          )}
        </div>

        {/* GEX bars */}
        <div className="flex-1 border-l border-[#1f1f1f] overflow-hidden">
          {chain && strikeRows.length > 0 ? (
            <GEXBarsPanel rows={strikeRows} spot={chain.spot} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs">Loading GEX…</div>
          )}
        </div>

        {/* Sidebar */}
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

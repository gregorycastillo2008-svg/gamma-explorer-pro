import { useEffect, useRef, useState } from "react";
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickData, UTCTimestamp, LineStyle, ColorType, IPriceLine,
  LineData,
} from "lightweight-charts";
import type { ExposurePoint, KeyLevels, DemoTicker } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  embedded?: boolean;
}

// Map dashboard ticker symbol → Yahoo Finance symbol
function toYahooSym(sym: string): string {
  const s = sym.toUpperCase();
  if (s === "NQ" || s === "NQX") return "NQ=F";
  if (s === "ES" || s === "ESX") return "ES=F";
  if (s === "RTY")               return "RTY=F";
  if (s === "YM")                return "YM=F";
  return s; // QQQ, SPY, AAPL, etc.
}

const SYMS = [
  { label: "QQQ",  yf: "QQQ"    },
  { label: "NDX",  yf: "^NDX"   },
  { label: "SPX",  yf: "^GSPC"  },
  { label: "SPY",  yf: "SPY"    },
  { label: "NQ",   yf: "NQ=F"   },
];

const LEGEND = [
  { color: "#facc15", label: "ZERO γ",     solid: true  },
  { color: "#e8963a", label: "PRICE",      solid: true  },
  { color: "#00ff88", label: "MAX +GEX",   solid: true  },
  { color: "#ff3355", label: "MAX −GEX",   solid: true  },
  { color: "#16a34a", label: "CALL WALL",  solid: false },
  { color: "#dc2626", label: "PUT WALL",   solid: false },
  { color: "#c084fc", label: "MAJOR WALL", solid: false },
  { color: "#fbbf24", label: "MAX PAIN",   solid: false },
];

// ── Parse Yahoo Finance OHLC ──────────────────────────────────────
function parseYahooOHLC(raw: unknown): CandlestickData[] {
  let d = raw as Record<string, unknown>;
  if (typeof (d as { contents?: string }).contents === "string")
    d = JSON.parse((d as { contents: string }).contents) as Record<string, unknown>;
  const result = (
    (d?.chart as { result?: unknown[] } | undefined)?.result
  )?.[0] as {
    timestamp?: number[];
    indicators?: {
      quote?: Array<{
        open?: (number | null)[];
        high?: (number | null)[];
        low?:  (number | null)[];
        close?: (number | null)[];
      }>;
    };
  } | undefined;
  if (!result) return [];
  const ts = result.timestamp ?? [];
  const q  = result.indicators?.quote?.[0] ?? {};
  const out: CandlestickData[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null ||
        !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
    out.push({ time: ts[i] as UTCTimestamp, open: o, high: h, low: l, close: c });
  }
  return out;
}

async function fetchOHLC(sym: string): Promise<CandlestickData[]> {
  const u1 = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d&includePrePost=false`;
  const u2 = u1.replace("query1", "query2");
  const px1 = `https://api.allorigins.win/get?url=${encodeURIComponent(u1)}`;
  const px2 = `https://corsproxy.io/?${encodeURIComponent(u1)}`;
  for (const url of [u1, u2, px1, px2]) {
    try {
      const r = await fetch(url, { mode: "cors" });
      const data = parseYahooOHLC(await r.json());
      if (data.length > 0) return data;
    } catch { /* try next */ }
  }
  return [];
}

// ── GEX bars overlay ─────────────────────────────────────────────
function GexOverlay({
  tick, chart, series, wrapper, exposures, spot,
}: {
  tick: number;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  wrapper: HTMLDivElement | null;
  exposures: ExposurePoint[];
  spot: number;
}) {
  if (!chart || !series || !wrapper) return null;

  const totalW  = wrapper.clientWidth;
  const scaleW  = chart.priceScale("right").width();
  const usableW = Math.max(80, totalW - scaleW);
  const centerX = usableW / 2;
  const halfMax = usableW * 0.44;
  const wrapH   = wrapper.clientHeight;

  const visible = exposures
    .filter(p => Math.abs(p.strike - spot) / spot < 0.08)
    .sort((a, b) => a.strike - b.strike);
  if (!visible.length) return null;

  const maxAbs  = Math.max(1, ...visible.map(p => Math.max(Math.abs(p.callGex), Math.abs(p.putGex))));
  const maxCall = visible.reduce((b, p) => p.callGex > b.callGex ? p : b, visible[0]);
  const maxPut  = visible.reduce((b, p) => p.putGex  > b.putGex  ? p : b, visible[0]);

  const yMap = new Map<number, number>();
  for (const p of visible) {
    const y = series.priceToCoordinate(p.strike);
    if (y != null) yMap.set(p.strike, y);
  }

  return (
    <div className="pointer-events-none absolute inset-0" data-tick={tick} style={{ overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: 6, left: 0, right: scaleW,
        display: "flex", justifyContent: "center", gap: 24,
        fontFamily: "'Courier New',monospace", fontSize: 10, fontWeight: 700,
        pointerEvents: "none",
      }}>
        <span style={{ color: "#f05050" }}>← PUT GEX</span>
        <span style={{ color: "#2dd4a0" }}>CALL GEX →</span>
      </div>
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: centerX,
        borderLeft: "1px solid rgba(255,255,255,0.08)", pointerEvents: "none",
      }} />
      {visible.map((p, idx) => {
        const y0 = yMap.get(p.strike);
        if (y0 == null || y0 < -20 || y0 > wrapH + 20) return null;
        const next  = visible[idx + 1];
        const yNext = next ? yMap.get(next.strike) : null;
        const slot  = yNext != null ? Math.abs(y0 - yNext) : 14;
        const barH  = Math.max(3, slot * 0.88);
        const bTop  = y0 - barH / 2;
        const callPx    = (Math.abs(p.callGex) / maxAbs) * halfMax;
        const putPx     = (Math.abs(p.putGex)  / maxAbs) * halfMax;
        const isMaxCall = maxCall.strike === p.strike;
        const isMaxPut  = maxPut.strike  === p.strike;
        const isAtm     = Math.abs(p.strike - spot) / spot < 0.002;
        return (
          <div key={p.strike} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {putPx > 1 && (
              <div style={{
                position: "absolute", top: bTop, left: centerX - putPx, width: putPx, height: barH,
                background: isMaxPut ? "rgba(255,50,50,1)" : "rgba(220,60,60,0.75)",
                boxShadow: isMaxPut ? "0 0 10px 2px rgba(255,50,50,0.6)" : "none",
              }} />
            )}
            {callPx > 1 && (
              <div style={{
                position: "absolute", top: bTop, left: centerX, width: callPx, height: barH,
                background: isMaxCall ? "rgba(40,255,170,1)" : "rgba(34,197,140,0.75)",
                boxShadow: isMaxCall ? "0 0 10px 2px rgba(0,255,170,0.6)" : "none",
              }} />
            )}
            {(isAtm || isMaxCall || isMaxPut || slot > 12) && (
              <div style={{
                position: "absolute", top: bTop + barH / 2 - 6,
                left: centerX - 22, width: 44, textAlign: "center",
                fontFamily: "'Courier New',monospace",
                fontSize: 9, fontWeight: isAtm || isMaxCall || isMaxPut ? 700 : 400,
                color: isAtm ? "#e8963a" : (isMaxCall || isMaxPut) ? "#fff" : "#1a2535",
                pointerEvents: "none", lineHeight: "12px",
              }}>
                {p.strike}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
export function TradingViewGexChart({ ticker, exposures, levels, embedded }: Props) {
  // Auto-sync chart symbol to dashboard ticker
  const [sym, setSym]             = useState(() => toYahooSym(ticker.symbol));
  const [loading, setLoading]     = useState(true);
  const [tick, setTick]           = useState(0);
  const [lastClose, setLastClose] = useState<number | null>(null);

  // When the dashboard ticker changes, switch the chart symbol
  useEffect(() => {
    setSym(toYahooSym(ticker.symbol));
  }, [ticker.symbol]);

  const containerRef  = useRef<HTMLDivElement>(null);
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const deltaZeroRef  = useRef<ISeriesApi<"Line"> | null>(null);
  const candleDataRef = useRef<CandlestickData[]>([]);
  const pLinesRef     = useRef<IPriceLine[]>([]);
  const levelsRef     = useRef(levels);
  const lastCloseRef  = useRef<number | null>(null);

  useEffect(() => { levelsRef.current = levels; }, [levels]);
  useEffect(() => { lastCloseRef.current = lastClose; }, [lastClose]);

  // ── Init chart once ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#4a6688",
        fontFamily: "'Courier New', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#090d14" },
        horzLines: { color: "#090d14" },
      },
      rightPriceScale: { borderColor: "#0e1420" },
      timeScale: {
        borderColor: "#0e1420",
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#1a2535", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0e1420" },
        horzLine: { color: "#1a2535", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0e1420" },
      },
    });
    chartRef.current = chart;

    const candles = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    seriesRef.current = candles;

    // Delta Zero — rendered as a VWAP-style line ON the candlesticks
    const dzLine = chart.addLineSeries({
      color: "#facc15",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: "DELTA ZERO",
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    deltaZeroRef.current = dzLine;

    const trigger = () => setTick(n => n + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(trigger);
    const ro = new ResizeObserver(trigger);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
      deltaZeroRef.current = null;
      pLinesRef.current = [];
      candleDataRef.current = [];
    };
  }, []);

  // ── Sync Delta Zero line across all loaded candles ───────────
  const syncDeltaZero = (data: CandlestickData[], flipPrice: number | null | undefined, chartPrice: number | null) => {
    const dz = deltaZeroRef.current;
    if (!dz || !data.length || flipPrice == null || !isFinite(flipPrice)) return;
    // Only draw if gamma flip is within ±25% of the chart's actual price
    if (chartPrice != null && Math.abs(flipPrice - chartPrice) / chartPrice > 0.25) return;
    dz.setData(data.map(c => ({ time: c.time, value: flipPrice } as LineData)));
  };

  // ── Fetch OHLC when symbol changes ───────────────────────────
  useEffect(() => {
    setLoading(true);
    setLastClose(null);
    // Clear delta zero while loading
    if (deltaZeroRef.current) deltaZeroRef.current.setData([]);

    fetchOHLC(sym).then(data => {
      if (!seriesRef.current || !chartRef.current) return;
      if (data.length > 0) {
        seriesRef.current.setData(data);
        chartRef.current.timeScale().fitContent();
        const close = data[data.length - 1].close;
        setLastClose(close);
        candleDataRef.current = data;
        syncDeltaZero(data, levelsRef.current.gammaFlip ?? levelsRef.current.volTrigger, close);
      }
      setLoading(false);
    });
  }, [sym]);

  // ── Update delta zero when gamma flip level changes ──────────
  useEffect(() => {
    syncDeltaZero(
      candleDataRef.current,
      levels.gammaFlip ?? levels.volTrigger,
      lastCloseRef.current,
    );
  }, [levels.gammaFlip, levels.volTrigger]);

  // ── Price lines — only levels within ±22% of real chart price ─
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    pLinesRef.current.forEach(pl => series.removePriceLine(pl));
    pLinesRef.current = [];

    // Use the actual fetched price as the reference; fall back to ticker.spot
    const refPrice = lastClose ?? ticker.spot;

    const add = (
      price: number | null | undefined,
      color: string, title: string,
      style: LineStyle = LineStyle.Dashed,
      width: 1 | 2 = 1,
    ) => {
      if (price == null || !isFinite(price)) return;
      // Skip lines that are too far from the visible chart range
      if (Math.abs(price - refPrice) / refPrice > 0.22) return;
      pLinesRef.current.push(
        series.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title }),
      );
    };

    // Highest positive net GEX strike (green solid) and highest negative (red solid)
    const maxPosEntry = exposures.length
      ? exposures.reduce((b, p) => p.netGex > b.netGex ? p : b, exposures[0])
      : null;
    const maxNegEntry = exposures.length
      ? exposures.reduce((b, p) => p.netGex < b.netGex ? p : b, exposures[0])
      : null;

    // PRICE = actual last close of the chart (not options ticker.spot which may differ)
    add(lastClose ?? ticker.spot,       "#e8963a", "● PRICE",      LineStyle.Solid,  2);
    add(maxPosEntry?.strike,            "#00ff88", "▲ MAX +GEX",   LineStyle.Solid,  2);
    add(maxNegEntry?.strike,            "#ff3355", "▼ MAX −GEX",   LineStyle.Solid,  2);
    add(levels.callWall,                "#16a34a", "CALL WALL",    LineStyle.Dashed, 1);
    add(levels.putWall,                 "#dc2626", "PUT WALL",     LineStyle.Dashed, 1);
    add(levels.majorWall,               "#c084fc", "MAJOR WALL",   LineStyle.Dashed, 1);
    add(levels.maxPain,                 "#fbbf24", "MAX PAIN",     LineStyle.Dashed, 1);

    setTick(n => n + 1);
  }, [levels, ticker.spot, exposures, lastClose]);

  // ── Render ────────────────────────────────────────────────────
  const symBar = (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      padding: "5px 10px", borderBottom: "1px solid #0e1420",
      background: "#04060a", flexShrink: 0,
    }}>
      {SYMS.map(s => (
        <button key={s.yf} onClick={() => setSym(s.yf)} style={{
          padding: "2px 10px",
          background: sym === s.yf ? "#0e1a0a" : "transparent",
          border: `1px solid ${sym === s.yf ? "#a3e635" : "#0e1420"}`,
          color: sym === s.yf ? "#a3e635" : "#2a3848",
          borderRadius: 4, cursor: "pointer",
          fontFamily: "'Courier New',monospace", fontSize: 10, fontWeight: 700,
        }}>
          {s.label}
        </button>
      ))}

      {/* Live price badge */}
      {lastClose != null && (
        <span style={{
          fontFamily: "'Courier New',monospace", fontSize: 10, fontWeight: 700,
          color: "#e8963a", background: "#1a0e00", border: "1px solid #e8963a44",
          borderRadius: 3, padding: "1px 6px",
        }}>
          ${lastClose.toFixed(2)}
        </span>
      )}

      {/* Legend */}
      <div style={{
        marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: "3px 8px",
        fontFamily: "'Courier New',monospace", fontSize: 9,
      }}>
        {LEGEND.map(l => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{
              display: "inline-block", width: 12, height: 2,
              background: l.solid ? l.color : "none",
              boxShadow: l.solid ? `0 0 5px ${l.color}` : "none",
              borderBottom: l.solid ? "none" : `2px dashed ${l.color}`,
            }} />
            <span style={{ color: l.color }}>{l.label}</span>
          </span>
        ))}
      </div>

      <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: "#1a2535", marginLeft: 6 }}>
        {loading ? "loading…" : "● 1m"}
      </span>
    </div>
  );

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000", minHeight: 0 }}>
      {symBar}
      <div ref={wrapperRef} style={{ position: "relative", width: "100%", minHeight: 0, flex: 1 }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            color: "#4a6688", fontFamily: "'Courier New',monospace", fontSize: 11,
          }}>
            Cargando {sym} 1m…
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        <GexOverlay
          tick={tick}
          chart={chartRef.current}
          series={seriesRef.current}
          wrapper={wrapperRef.current}
          exposures={exposures}
          spot={lastClose ?? ticker.spot}
        />
      </div>
    </div>
  );
}

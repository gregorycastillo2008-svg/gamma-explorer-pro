import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  UTCTimestamp,
} from "lightweight-charts";

interface PricePoint { time: number; value: number }
export interface LevelPoint { time: number; value: number }

interface Props {
  symbol: string;
  spot: number;
  points: PricePoint[];
  zeroGammaSeries: LevelPoint[];      // historical levels (will be smoothed)
  majorCallSeries: LevelPoint[];
  majorPutSeries: LevelPoint[];
  zeroGamma?: number;
  majorCall?: number;
  majorPut?: number;
  callWall?: number;
  putWall?: number;
  maxPain?: number;
}

const HEADER_BG = "#0f1419";
const CHART_BG = "#1a1f2e";
const AXIS = "#8894a8";

export function GexbotStyleChart({
  symbol, spot, points,
  zeroGammaSeries, majorCallSeries, majorPutSeries,
  zeroGamma, majorCall, majorPut,
  callWall, putWall, maxPain,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Line"> | null>(null);
  const zgRef = useRef<ISeriesApi<"Line"> | null>(null);
  const callRef = useRef<ISeriesApi<"Line"> | null>(null);
  const putRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Init chart once
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = createChart(hostRef.current, {
      width: hostRef.current.clientWidth,
      height: hostRef.current.clientHeight,
      layout: { background: { color: CHART_BG }, textColor: AXIS, fontFamily: "JetBrains Mono, ui-monospace, monospace" },
      grid: {
        vertLines: { color: "rgba(75,75,90,0.18)", style: 2 },
        horzLines: { color: "rgba(75,75,90,0.18)", style: 2 },
      },
      crosshair: { mode: 1 },
      timeScale: { borderColor: "#1f2937", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#1f2937" },
    });
    chartRef.current = chart;

    priceRef.current = chart.addLineSeries({
      color: "#ffffff",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    zgRef.current = chart.addLineSeries({
      color: "#ffaa00",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      title: "Zero γ",
    });
    callRef.current = chart.addLineSeries({
      color: "#00ff88",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      title: "Major Call",
    });
    putRef.current = chart.addLineSeries({
      color: "#ff4466",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      title: "Major Put",
    });

    const ro = new ResizeObserver(() => {
      if (hostRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: hostRef.current.clientWidth,
          height: hostRef.current.clientHeight,
        });
      }
    });
    ro.observe(hostRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      zgRef.current = null;
      callRef.current = null;
      putRef.current = null;
    };
  }, []);

  // Update price line
  useEffect(() => {
    if (!priceRef.current || !points?.length) return;
    const data: LineData<UTCTimestamp>[] = points.map((p) => ({
      time: p.time as UTCTimestamp, value: p.value,
    }));
    priceRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  // Helper to dedup & sort
  const toLine = (arr: LevelPoint[]): LineData<UTCTimestamp>[] => {
    const map = new Map<number, number>();
    for (const p of arr) map.set(p.time, p.value);
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));
  };

  /**
   * Zero-gamma series rendered on the price timeline:
   *  - Sample the level (latest known value) at every price tick,
   *  - Apply an EMA so it lags & smooths vs. price (acts like dynamic resistance),
   *  - Bias slightly toward price so it tracks but stays distinct.
   */
  const zgRendered = useMemo<LineData<UTCTimestamp>[]>(() => {
    if (!points.length) return [];
    if (!zeroGammaSeries.length && zeroGamma == null) return [];
    const sortedLevels = [...zeroGammaSeries].sort((a, b) => a.time - b.time);
    const getLevelAt = (t: number) => {
      // last level whose time <= t
      let lo = 0, hi = sortedLevels.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sortedLevels[mid].time <= t) { idx = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      if (idx === -1) return sortedLevels[0]?.value ?? zeroGamma ?? null;
      return sortedLevels[idx].value;
    };

    const alpha = 0.06; // EMA smoothing — lower = laggier line
    const bias = 0.25;  // pull toward price (0..1) for dynamic-resistance feel
    let ema: number | null = null;
    const out: LineData<UTCTimestamp>[] = [];
    for (const p of points) {
      const lvl = getLevelAt(p.time);
      const target = lvl == null ? p.value : lvl * (1 - bias) + p.value * bias;
      ema = ema == null ? target : ema + alpha * (target - ema);
      out.push({ time: p.time as UTCTimestamp, value: ema });
    }
    return out;
  }, [points, zeroGammaSeries, zeroGamma]);

  useEffect(() => {
    if (zgRef.current) zgRef.current.setData(zgRendered);
  }, [zgRendered]);

  useEffect(() => {
    if (callRef.current) callRef.current.setData(toLine(majorCallSeries));
  }, [majorCallSeries]);

  useEffect(() => {
    if (putRef.current) putRef.current.setData(toLine(majorPutSeries));
  }, [majorPutSeries]);

  // Reference price-lines for major levels (Major Call, Major Put, Call Wall, Put Wall, Max Pain)
  const refLinesRef = useRef<any[]>([]);
  useEffect(() => {
    const series = priceRef.current;
    if (!series) return;
    // Clear previous
    refLinesRef.current.forEach((pl) => {
      try { series.removePriceLine(pl); } catch {}
    });
    refLinesRef.current = [];

    const levels: { price?: number; color: string; title: string }[] = [
      { price: majorCall, color: "#00ff88", title: `Major Call ${majorCall?.toFixed(2) ?? ""}` },
      { price: majorPut,  color: "#ff4466", title: `Major Put ${majorPut?.toFixed(2) ?? ""}` },
      { price: callWall,  color: "#22d3ee", title: `Call Wall ${callWall?.toFixed(2) ?? ""}` },
      { price: putWall,   color: "#f472b6", title: `Put Wall ${putWall?.toFixed(2) ?? ""}` },
      { price: maxPain,   color: "#a78bfa", title: `Max Pain ${maxPain?.toFixed(2) ?? ""}` },
    ];
    for (const l of levels) {
      if (l.price == null || !Number.isFinite(l.price)) continue;
      const pl = series.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: l.title,
      });
      refLinesRef.current.push(pl);
    }
  }, [majorCall, majorPut, callWall, putWall, maxPain, points]);

  // Header datetime
  const dt = new Date();
  const dtStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}`;

  return (
    <div className="w-full h-full flex flex-col" style={{ background: CHART_BG }}>
      {/* CHART — ocupa todo el espacio disponible */}
      <div ref={hostRef} className="flex-1 relative" />

      {/* FOOTER compacto — niveles clave sin ocupar espacio del gráfico */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-t gap-4 flex-wrap"
        style={{ background: HEADER_BG, borderColor: "#1f2937", minHeight: 32 }}
      >
        <div className="flex items-center gap-2 text-[9px] font-mono shrink-0">
          <div className="flex flex-col gap-[2px]">
            <span className="block bg-white" style={{ width: 12, height: 1.5, borderRadius: 1 }} />
            <span className="block bg-white" style={{ width: 15, height: 1.5, borderRadius: 1 }} />
            <span className="block bg-white" style={{ width: 9, height: 1.5, borderRadius: 1 }} />
          </div>
          <span className="text-white font-bold tracking-tight">gexsatelit</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-300 font-bold">{symbol}</span>
          <span className="text-slate-500">·</span>
          <span className="text-white tabular-nums">${spot?.toFixed(2) ?? "—"}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-500">{dtStr}</span>
        </div>

        <div className="flex items-center gap-3 text-[9px] font-mono flex-wrap">
          <span>
            <span className="text-slate-500">0γ: </span>
            <span className="font-bold tabular-nums" style={{ color: "#ffdd44" }}>${zeroGamma?.toFixed(2) ?? "—"}</span>
          </span>
          <span>
            <span className="text-slate-500">call: </span>
            <span className="font-bold tabular-nums" style={{ color: "#00ff88" }}>${majorCall?.toFixed(2) ?? "—"}</span>
          </span>
          <span>
            <span className="text-slate-500">put: </span>
            <span className="font-bold tabular-nums" style={{ color: "#ff4466" }}>${majorPut?.toFixed(2) ?? "—"}</span>
          </span>
          <span>
            <span className="text-slate-500">c.wall: </span>
            <span className="font-bold tabular-nums" style={{ color: "#22d3ee" }}>${callWall?.toFixed(2) ?? "—"}</span>
          </span>
          <span>
            <span className="text-slate-500">p.wall: </span>
            <span className="font-bold tabular-nums" style={{ color: "#f472b6" }}>${putWall?.toFixed(2) ?? "—"}</span>
          </span>
          <span>
            <span className="text-slate-500">maxpain: </span>
            <span className="font-bold tabular-nums" style={{ color: "#a78bfa" }}>${maxPain?.toFixed(2) ?? "—"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

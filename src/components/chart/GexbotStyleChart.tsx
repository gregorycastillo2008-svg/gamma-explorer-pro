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
  zeroGammaSeries: LevelPoint[];
  majorCallSeries: LevelPoint[];
  majorPutSeries: LevelPoint[];
  // current values (for header readout)
  zeroGamma?: number;
  majorCall?: number;
  majorPut?: number;
}

/**
 * Gexbot-style chart: white spot line + dynamic series for Zero Gamma / Walls.
 * Each level evolves over time (recomputed each chain refresh).
 */
export function GexbotStyleChart({
  symbol, spot, points,
  zeroGammaSeries, majorCallSeries, majorPutSeries,
  zeroGamma, majorCall, majorPut,
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
      layout: { background: { color: "#0a0a0a" }, textColor: "#9ca3af", fontFamily: "monospace" },
      grid: {
        vertLines: { color: "rgba(75,75,75,0.15)", style: 2 },
        horzLines: { color: "rgba(75,75,75,0.15)", style: 2 },
      },
      crosshair: { mode: 1 },
      timeScale: { borderColor: "#1f1f1f", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#1f1f1f" },
    });
    chartRef.current = chart;

    priceRef.current = chart.addLineSeries({
      color: "#ffffff", lineWidth: 1, lastValueVisible: true, priceLineVisible: false,
    });
    zgRef.current = chart.addLineSeries({
      color: "#eab308", lineWidth: 2, lastValueVisible: true, priceLineVisible: false,
      title: "Zero γ",
    });
    callRef.current = chart.addLineSeries({
      color: "#22c55e", lineWidth: 2, lastValueVisible: true, priceLineVisible: false,
      title: "Major Call",
    });
    putRef.current = chart.addLineSeries({
      color: "#ef4444", lineWidth: 2, lastValueVisible: true, priceLineVisible: false,
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

  // Helper to feed level series, dedup'd & sorted
  const toLine = (arr: LevelPoint[]): LineData<UTCTimestamp>[] => {
    const map = new Map<number, number>();
    for (const p of arr) map.set(p.time, p.value);
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));
  };

  useEffect(() => {
    if (zgRef.current) zgRef.current.setData(toLine(zeroGammaSeries));
  }, [zeroGammaSeries]);

  useEffect(() => {
    if (callRef.current) callRef.current.setData(toLine(majorCallSeries));
  }, [majorCallSeries]);

  useEffect(() => {
    if (putRef.current) putRef.current.setData(toLine(majorPutSeries));
  }, [majorPutSeries]);

  return (
    <div className="w-full h-full flex flex-col bg-[#0a0a0a] border-t border-[#1f1f1f]">
      {/* Header strip — gexbot-style */}
      <div className="grid grid-cols-3 gap-4 px-4 py-2 border-b border-[#1f1f1f] text-[10px] font-mono">
        <div className="space-y-0.5">
          <div className="flex gap-2"><span className="text-muted-foreground font-bold">source:</span><span className="text-foreground">live · polygon</span></div>
          <div className="flex gap-2"><span className="text-muted-foreground font-bold">model:</span><span className="text-foreground">gex by oi · live</span></div>
        </div>
        <div className="space-y-0.5">
          <div className="flex gap-2"><span className="text-muted-foreground font-bold">ticker:</span><span className="text-foreground">{symbol}</span></div>
          <div className="flex gap-2"><span className="text-muted-foreground font-bold">spot:</span><span className="text-foreground tabular-nums">${spot?.toFixed(2) ?? "—"}</span></div>
        </div>
        <div className="space-y-0.5">
          <div className="flex gap-2 justify-end"><span className="text-muted-foreground font-bold">major call:</span><span className="text-emerald-400 tabular-nums w-20 text-right">${majorCall?.toFixed(2) ?? "—"}</span></div>
          <div className="flex gap-2 justify-end"><span className="text-muted-foreground font-bold">zero gamma:</span><span className="text-yellow-400 tabular-nums w-20 text-right">${zeroGamma?.toFixed(2) ?? "—"}</span></div>
          <div className="flex gap-2 justify-end"><span className="text-muted-foreground font-bold">major put:</span><span className="text-red-400 tabular-nums w-20 text-right">${majorPut?.toFixed(2) ?? "—"}</span></div>
        </div>
      </div>

      <div ref={hostRef} className="flex-1 relative" />
    </div>
  );
}

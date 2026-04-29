import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  UTCTimestamp,
  IPriceLine,
} from "lightweight-charts";

interface PricePoint { time: number; value: number }

interface Props {
  symbol: string;
  spot: number;
  points: PricePoint[];
  zeroGamma?: number;   // delta-flip (cumulative net GEX = 0)
  majorCall?: number;   // call wall
  majorPut?: number;    // put wall
}

/**
 * Gexbot-style chart: white spot line + horizontal levels.
 * - Yellow = Zero Gamma (delta flip), recomputed live from real options chain
 * - Green  = Major Call wall
 * - Red    = Major Put wall
 */
export function GexbotStyleChart({ symbol, spot, points, zeroGamma, majorCall, majorPut }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

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

    const series = chart.addLineSeries({
      color: "#ffffff",
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    lineRef.current = series;

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
      lineRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Update price data
  useEffect(() => {
    if (!lineRef.current || !points?.length) return;
    const data: LineData<UTCTimestamp>[] = points.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    lineRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  // Redraw key-level price lines whenever they change
  useEffect(() => {
    const series = lineRef.current;
    if (!series) return;
    linesRef.current.forEach((pl) => { try { series.removePriceLine(pl); } catch {} });
    linesRef.current = [];

    const add = (price: number | undefined, color: string, title: string) => {
      if (price == null || !Number.isFinite(price)) return;
      const pl = series.createPriceLine({
        price,
        color,
        lineStyle: 0,           // solid
        lineWidth: 2,
        axisLabelVisible: true,
        title,
      });
      linesRef.current.push(pl);
    };

    add(majorCall, "#22c55e", `Major Call ${majorCall?.toFixed(2) ?? ""}`);
    add(zeroGamma, "#eab308", `Zero Gamma ${zeroGamma?.toFixed(2) ?? ""}`);
    add(majorPut, "#ef4444", `Major Put ${majorPut?.toFixed(2) ?? ""}`);
  }, [zeroGamma, majorCall, majorPut]);

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

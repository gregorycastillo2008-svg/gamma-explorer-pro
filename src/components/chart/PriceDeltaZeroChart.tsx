import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  UTCTimestamp,
} from "lightweight-charts";

interface PricePoint { time: number; value: number }

interface Props {
  symbol: string;
  spot: number;
  pricePoints: PricePoint[];
  deltaZeroHistory: PricePoint[];
}

const CHART_BG = "#0a0e18";
const PRICE_COLOR = "#0066ff";
const DELTA_COLOR = "#ffd700";

export function PriceDeltaZeroChart({
  symbol,
  spot,
  pricePoints,
  deltaZeroHistory,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const deltaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Init chart once
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = createChart(hostRef.current, {
      width: hostRef.current.clientWidth,
      height: hostRef.current.clientHeight,
      layout: {
        background: { color: CHART_BG },
        textColor: "#8894a8",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(75,75,90,0.12)", style: 2 },
        horzLines: { color: "rgba(75,75,90,0.12)", style: 2 },
      },
      crosshair: { mode: 1 },
      timeScale: { 
        borderColor: "#1f2937", 
        timeVisible: true, 
        secondsVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) => {
          const date = new Date(time * 1000);
          return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
      },
      rightPriceScale: { borderColor: "#1f2937" },
    });
    chartRef.current = chart;

    // Price line - thick, smooth, continuous blue
    priceSeriesRef.current = chart.addLineSeries({
      color: PRICE_COLOR,
      lineWidth: 4,
      lastValueVisible: true,
      priceLineVisible: false,
      title: "Price",
      crosshairMarkerVisible: true,
    });

    // Delta Zero line - smooth golden line
    deltaSeriesRef.current = chart.addLineSeries({
      color: DELTA_COLOR,
      lineWidth: 3,
      lastValueVisible: true,
      priceLineVisible: false,
      title: "Delta Zero",
      crosshairMarkerVisible: true,
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
      priceSeriesRef.current = null;
      deltaSeriesRef.current = null;
    };
  }, []);

  // Update price data
  useEffect(() => {
    if (!priceSeriesRef.current || !pricePoints?.length) return;
    const data: LineData<UTCTimestamp>[] = pricePoints.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    priceSeriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [pricePoints]);

  // Update delta zero data with smoothing
  useEffect(() => {
    if (!deltaSeriesRef.current || !deltaZeroHistory?.length) return;

    // Apply EMA smoothing for more fluid appearance
    const alpha = 0.12;
    let ema: number | null = null;
    const smoothed: LineData<UTCTimestamp>[] = [];

    const sorted = [...deltaZeroHistory].sort((a, b) => a.time - b.time);

    for (const point of sorted) {
      if (ema === null) {
        ema = point.value;
      } else {
        ema = ema + alpha * (point.value - ema);
      }
      smoothed.push({
        time: point.time as UTCTimestamp,
        value: ema,
      });
    }

    deltaSeriesRef.current.setData(smoothed);
  }, [deltaZeroHistory]);

  return (
    <div className="w-full h-full flex flex-col" style={{ background: CHART_BG }}>
      <div
        ref={hostRef}
        className="flex-1 relative"
        style={{ minHeight: 300 }}
      />

      {/* Legend */}
      <div
        className="flex items-center gap-6 px-4 py-2 border-t text-xs font-mono"
        style={{
          background: CHART_BG,
          borderColor: "#1f2937",
          color: "#8894a8",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-1 rounded"
            style={{ background: PRICE_COLOR, boxShadow: `0 0 6px ${PRICE_COLOR}66` }}
          />
          <span>
            <span className="text-slate-500">Price · </span>
            <span style={{ color: PRICE_COLOR, fontWeight: 600 }}>
              ${spot.toFixed(2)}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="w-3 h-1 rounded"
            style={{ background: DELTA_COLOR, boxShadow: `0 0 6px ${DELTA_COLOR}66` }}
          />
          <span>
            <span className="text-slate-500">Delta Zero</span>
          </span>
        </div>

        <span className="ml-auto text-slate-600 text-[10px]">
          {new Date().toLocaleTimeString()} · {symbol}
        </span>
      </div>
    </div>
  );
}

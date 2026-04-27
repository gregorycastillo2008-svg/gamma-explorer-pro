import { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData, UTCTimestamp } from "lightweight-charts";
import { generateCandles } from "@/lib/gexSimData";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TIMEFRAMES = ["1D", "5D", "1M", "3M", "6M", "1Y"] as const;
type TF = typeof TIMEFRAMES[number];

interface PriceChartProps {
  symbol: string;
  basePrice: number;
  currentPrice: number;
  zeroGamma?: number;
  majorPositive?: number;
  majorNegative?: number;
}

export function PriceChart({ symbol, basePrice, currentPrice, zeroGamma, majorPositive, majorNegative }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const priceLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const [tf, setTf] = useState<TF>("1D");
  const [type, setType] = useState<"candlestick" | "line">("candlestick");

  // Build chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: { background: { color: "#000000" }, textColor: "#9ca3af", fontSize: 11 },
      grid: { vertLines: { color: "#1a1a1a" }, horzLines: { color: "#1a1a1a" } },
      crosshair: { mode: 1 },
      timeScale: { borderColor: "#2a2a2a", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#2a2a2a" },
    });
    chartRef.current = chart;
    const onResize = () => containerRef.current && chart.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.remove(); chartRef.current = null; };
  }, []);

  // Rebuild series when type or data changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current as any); } catch { /* noop */ }
      seriesRef.current = null;
      priceLineRef.current = null;
    }
    const candles = generateCandles(symbol, tf, basePrice);

    if (type === "candlestick") {
      const s = chart.addCandlestickSeries({
        upColor: "#10b981", downColor: "#ef4444",
        borderUpColor: "#10b981", borderDownColor: "#ef4444",
        wickUpColor: "#10b981", wickDownColor: "#ef4444",
      });
      s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })) as CandlestickData[]);
      seriesRef.current = s;
    } else {
      const s = chart.addLineSeries({ color: "#06b6d4", lineWidth: 2 });
      s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })) as LineData[]);
      seriesRef.current = s;
    }
    chart.timeScale().fitContent();
  }, [symbol, basePrice, tf, type]);

  // Price + level lines
  useEffect(() => {
    const s = seriesRef.current as any;
    if (!s) return;
    // Clear existing
    if (priceLineRef.current) { try { s.removePriceLine(priceLineRef.current); } catch { /* noop */ } }
    priceLineRef.current = s.createPriceLine({
      price: currentPrice, color: "#fbbf24", lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: "Spot",
    });
    const extra: any[] = [];
    if (zeroGamma) extra.push(s.createPriceLine({ price: zeroGamma, color: "#a855f7", lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "0γ" }));
    if (majorPositive) extra.push(s.createPriceLine({ price: majorPositive, color: "#10b981", lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "Call+" }));
    if (majorNegative) extra.push(s.createPriceLine({ price: majorNegative, color: "#ef4444", lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "Put-" }));
    return () => { extra.forEach((l) => { try { s.removePriceLine(l); } catch { /* noop */ } }); };
  }, [currentPrice, zeroGamma, majorPositive, majorNegative, type, tf]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={tf} onValueChange={(v) => setTf(v as TF)}>
          <TabsList className="h-7 bg-[#0a0a0a] border border-[#1f1f1f]">
            {TIMEFRAMES.map((t) => (
              <TabsTrigger key={t} value={t} className="text-[11px] px-2 py-0.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">{t}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className={`h-7 px-2 text-[11px] ${type === "candlestick" ? "bg-cyan-500/20 text-cyan-400" : "text-muted-foreground"}`} onClick={() => setType("candlestick")}>Candles</Button>
          <Button variant="ghost" size="sm" className={`h-7 px-2 text-[11px] ${type === "line" ? "bg-cyan-500/20 text-cyan-400" : "text-muted-foreground"}`} onClick={() => setType("line")}>Line</Button>
        </div>
      </div>
      <div ref={containerRef} className="w-full rounded border border-[#1f1f1f] bg-black" style={{ height: 420 }} />
    </div>
  );
}

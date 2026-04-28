import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  UTCTimestamp,
  IPriceLine,
  LineStyle,
  ColorType,
} from "lightweight-charts";
import { Panel } from "../terminal/Panel";
import { Button } from "@/components/ui/button";
import { ExposurePoint, KeyLevels, DemoTicker } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
}

const SYMBOLS = [
  { label: "QQQ", key: "QQQ" },
  { label: "SPY", key: "SPY" },
  { label: "NQ", key: "NQ" },
];

function buildIntradayWalk(spot: number, points = 260): LineData[] {
  const out: LineData[] = [];
  const start = new Date();
  start.setUTCHours(13, 30, 0, 0);
  const startSec = Math.floor(start.getTime() / 1000);
  let v = spot * 0.998;
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const noise = Math.sin(i / 7) + Math.sin(i / 13.7) * 0.6 + (Math.random() - 0.5) * 0.8;
    v += noise * spot * 0.0004;
    const target = spot * (0.997 + 0.006 * t);
    v = v + (target - v) * 0.02;
    out.push({ time: (startSec + i * 60) as UTCTimestamp, value: +v.toFixed(2) });
  }
  out[out.length - 1] = { ...out[out.length - 1], value: spot };
  return out;
}

/**
 * Compute Zero Gamma (delta-neutral) strike via linear interpolation on cumulative netGex.
 * This is the level where dealer gamma flips sign — same concept as the orange line in gexbot.
 */
function computeZeroGamma(exposures: ExposurePoint[]): number | null {
  if (exposures.length < 2) return null;
  const sorted = [...exposures].sort((a, b) => a.strike - b.strike);
  let cum = 0;
  const cumPoints: { strike: number; cum: number }[] = [];
  for (const p of sorted) {
    cum += p.netGex;
    cumPoints.push({ strike: p.strike, cum });
  }
  for (let i = 1; i < cumPoints.length; i++) {
    const a = cumPoints[i - 1];
    const b = cumPoints[i];
    if (a.cum === 0) return a.strike;
    if (Math.sign(a.cum) !== Math.sign(b.cum)) {
      // linear interp where cum = 0
      const t = a.cum / (a.cum - b.cum);
      return +(a.strike + t * (b.strike - a.strike)).toFixed(2);
    }
  }
  return null;
}

export function TradingViewGexChart({ ticker, exposures, levels }: Props) {
  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0].key);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const lineSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);

  const [overlayTick, setOverlayTick] = useState(0);
  const data = useMemo(() => buildIntradayWalk(ticker.spot, 260), [ticker.spot, activeSymbol]);

  const zeroGamma = useMemo(() => computeZeroGamma(exposures), [exposures]);

  // Init chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const el = chartContainerRef.current;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.07)" },
        horzLines: { color: "rgba(148,163,184,0.07)" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.2)" },
      timeScale: {
        borderColor: "rgba(148,163,184,0.2)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(56,189,248,0.5)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(56,189,248,0.5)", width: 1, style: LineStyle.Dashed },
      },
    });
    chartApi.current = chart;

    const series = chart.addLineSeries({
      color: "#22d3ee",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "#22d3ee",
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true,
    });
    lineSeries.current = series;

    // re-render overlay on any visible-range / size change
    const trigger = () => setOverlayTick((n) => n + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(trigger);
    const ro = new ResizeObserver(trigger);
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartApi.current = null;
      lineSeries.current = null;
      priceLines.current = [];
    };
  }, []);

  // Update data + level lines (Call Wall, Put Wall, Zero Gamma solid)
  useEffect(() => {
    if (!lineSeries.current || !chartApi.current) return;
    lineSeries.current.setData(data);
    chartApi.current.timeScale().fitContent();

    priceLines.current.forEach((pl) => lineSeries.current?.removePriceLine(pl));
    priceLines.current = [];

    const addLine = (
      price: number,
      color: string,
      title: string,
      style: LineStyle = LineStyle.Dashed,
      width: 1 | 2 = 1
    ) => {
      const pl = lineSeries.current!.createPriceLine({
        price,
        color,
        lineWidth: width,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      priceLines.current.push(pl);
    };

    addLine(levels.callWall, "#22c55e", "Call Wall");
    addLine(levels.putWall, "#ef4444", "Put Wall");
    if (zeroGamma) addLine(zeroGamma, "#f59e0b", "Zero Γ (Δ0)", LineStyle.Solid, 2);
    setOverlayTick((n) => n + 1);
  }, [data, levels, zeroGamma]);

  return (
    <Panel
      title="Realtime Chart + GEX Profile"
      subtitle={`${activeSymbol} · spot $${ticker.spot.toFixed(2)} · Zero Γ ${zeroGamma ?? "—"}`}
      noPad
      className="h-full flex flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-border bg-card/40 px-3 py-2">
        {SYMBOLS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={activeSymbol === item.key ? "default" : "outline"}
            className="h-7 px-3 text-[10px] font-bold tracking-widest"
            onClick={() => setActiveSymbol(item.key)}
          >
            {item.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          <LegendDot color="#22c55e" label="Call γ" />
          <LegendDot color="#ef4444" label="Put γ" />
          <LegendDot color="#f59e0b" label="Zero Γ (Δ0)" />
          <LegendDot color="#22d3ee" label="Price" />
        </div>
      </div>

      <div ref={wrapperRef} className="relative min-h-0 flex-1">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <GexOverlay
          tick={overlayTick}
          chart={chartApi.current}
          series={lineSeries.current}
          wrapper={wrapperRef.current}
          exposures={exposures}
          spot={ticker.spot}
        />
      </div>
    </Panel>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/**
 * Absolute overlay rendered ON TOP of the price chart.
 * Bars are placed at each strike's Y coordinate via series.priceToCoordinate.
 * Calls extend right from the zero-line, puts extend left.
 */
function GexOverlay({
  tick,
  chart,
  series,
  wrapper,
  exposures,
  spot,
}: {
  tick: number;
  chart: IChartApi | null;
  series: ISeriesApi<"Line"> | null;
  wrapper: HTMLDivElement | null;
  exposures: ExposurePoint[];
  spot: number;
}) {
  if (!chart || !series || !wrapper) return null;

  const width = wrapper.clientWidth;
  const height = wrapper.clientHeight;
  // Reserve right side for price scale
  const priceScaleW = chart.priceScale("right").width();
  const usableW = Math.max(50, width - priceScaleW);

  // Filter strikes within ±3% of spot to avoid clutter
  const visible = exposures.filter((p) => Math.abs(p.strike - spot) / spot < 0.03);
  if (!visible.length) return null;

  const maxAbs = Math.max(
    1,
    ...visible.map((p) => Math.max(Math.abs(p.callGex), Math.abs(p.putGex)))
  );

  // Bars centered around the chart horizontal middle
  const centerX = usableW / 2;
  const halfMaxBarPx = usableW * 0.32; // each side max 32% of width
  const barH = 4;
  const hitH = 14; // invisible hit area for easier hover

  return (
    <div className="pointer-events-none absolute inset-0" data-tick={tick}>
      {/* zero line marker (vertical) */}
      <div
        className="absolute top-0 bottom-0 border-l border-dashed border-cyan-400/40"
        style={{ left: centerX }}
      />
      {visible.map((p) => {
        const y = series.priceToCoordinate(p.strike);
        if (y == null) return null;
        const callPx = (Math.abs(p.callGex) / maxAbs) * halfMaxBarPx;
        const putPx = (Math.abs(p.putGex) / maxAbs) * halfMaxBarPx;
        return (
          <div
            key={p.strike}
            className="group pointer-events-auto absolute"
            style={{
              top: y - hitH / 2,
              left: centerX - putPx,
              width: putPx + callPx,
              height: hitH,
            }}
          >
            {/* tooltip */}
            <div
              className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-cyan-500/40 bg-background/95 px-2 py-0.5 text-[10px] font-mono text-cyan-200 opacity-0 shadow-lg shadow-cyan-500/20 transition-opacity duration-150 group-hover:opacity-100"
            >
              ${p.strike} · C {p.callGex.toFixed(1)} · P {p.putGex.toFixed(1)}
            </div>
            {/* Put bar (left, red) */}
            <div
              className="absolute origin-right rounded-l-sm transition-all duration-150 ease-out group-hover:scale-y-[2.2] group-hover:brightness-125"
              style={{
                top: (hitH - barH) / 2,
                left: 0,
                width: putPx,
                height: barH,
                background: "rgba(239,68,68,0.8)",
                boxShadow: "0 0 0 rgba(239,68,68,0)",
              }}
            />
            {/* Call bar (right, green) */}
            <div
              className="absolute origin-left rounded-r-sm transition-all duration-150 ease-out group-hover:scale-y-[2.2] group-hover:brightness-125"
              style={{
                top: (hitH - barH) / 2,
                left: putPx,
                width: callPx,
                height: barH,
                background: "rgba(34,197,94,0.8)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

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

// Generate intraday-looking price walk anchored to spot
function buildIntradayWalk(spot: number, points = 240): LineData[] {
  const out: LineData[] = [];
  // 6:30 AM PT today in UTC seconds
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(13, 30, 0, 0); // 13:30 UTC = 6:30 PT / 9:30 ET
  const startSec = Math.floor(start.getTime() / 1000);
  let v = spot * 0.998;
  // bias drift toward spot at end
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const noise = (Math.sin(i / 7) + Math.sin(i / 13.7) * 0.6 + (Math.random() - 0.5) * 0.8);
    v += noise * spot * 0.0004;
    // pull back to spot
    const target = spot * (0.997 + 0.006 * t);
    v = v + (target - v) * 0.02;
    out.push({ time: (startSec + i * 60) as UTCTimestamp, value: +v.toFixed(2) });
  }
  // ensure final ~ spot
  out[out.length - 1] = { ...out[out.length - 1], value: spot };
  return out;
}

export function TradingViewGexChart({ ticker, exposures, levels }: Props) {
  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0].key);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const lineSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);

  const data = useMemo(() => buildIntradayWalk(ticker.spot, 260), [ticker.spot, activeSymbol]);

  // Init chart once
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
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.2)",
      },
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

    return () => {
      chart.remove();
      chartApi.current = null;
      lineSeries.current = null;
      priceLines.current = [];
    };
  }, []);

  // Update data + level lines
  useEffect(() => {
    if (!lineSeries.current || !chartApi.current) return;
    lineSeries.current.setData(data);
    chartApi.current.timeScale().fitContent();

    // remove old
    priceLines.current.forEach((pl) => lineSeries.current?.removePriceLine(pl));
    priceLines.current = [];

    const addLine = (price: number, color: string, title: string) => {
      const pl = lineSeries.current!.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
      priceLines.current.push(pl);
    };
    addLine(levels.callWall, "#22c55e", "Call Wall");
    addLine(levels.putWall, "#ef4444", "Put Wall");
    if (levels.gammaFlip) addLine(levels.gammaFlip, "#eab308", "γ Flip");
  }, [data, levels]);

  return (
    <Panel
      title="Realtime Chart + GEX Profile"
      subtitle={`${activeSymbol} · spot $${ticker.spot.toFixed(2)} · mock intraday`}
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
          <LegendDot color="#f97316" label="Call γ" />
          <LegendDot color="#a855f7" label="Put γ" />
          <LegendDot color="#22d3ee" label="Price" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_220px]">
        <div ref={chartContainerRef} className="min-h-0 w-full" />
        <GexProfile exposures={exposures} spot={ticker.spot} levels={levels} />
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

/** Vertical strike profile with horizontal call/put gamma bars (gexbot-style) */
function GexProfile({
  exposures,
  spot,
  levels,
}: {
  exposures: ExposurePoint[];
  spot: number;
  levels: KeyLevels;
}) {
  // Filter strikes within reasonable range around spot
  const filtered = useMemo(() => {
    const sorted = [...exposures].sort((a, b) => b.strike - a.strike);
    return sorted.filter((p) => Math.abs(p.strike - spot) / spot < 0.05);
  }, [exposures, spot]);

  const maxAbs = useMemo(
    () => Math.max(1, ...filtered.map((p) => Math.max(Math.abs(p.callGex), Math.abs(p.putGex)))),
    [filtered]
  );

  return (
    <div className="border-l border-border bg-background/40 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/60 px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        <span>Strike</span>
        <span>Gamma γ</span>
      </div>
      <div className="flex flex-col">
        {filtered.map((p) => {
          const isSpot = Math.abs(p.strike - spot) < 0.5;
          const isCallWall = p.strike === levels.callWall;
          const isPutWall = p.strike === levels.putWall;
          const callPct = Math.min(100, (Math.abs(p.callGex) / maxAbs) * 100);
          const putPct = Math.min(100, (Math.abs(p.putGex) / maxAbs) * 100);
          return (
            <div
              key={p.strike}
              className={`relative flex h-5 items-center border-b border-border/30 px-1 text-[9px] font-mono ${
                isSpot ? "bg-cyan-500/10" : ""
              }`}
            >
              <span
                className={`w-10 shrink-0 text-right pr-1 ${
                  isCallWall
                    ? "text-call font-bold"
                    : isPutWall
                    ? "text-put font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {p.strike}
              </span>
              {/* bars area split in two: put on the left, call on the right */}
              <div className="relative flex h-3 flex-1 items-center">
                <div className="flex h-full w-1/2 justify-end pr-px">
                  <div
                    className="h-full rounded-l-sm"
                    style={{ width: `${putPct}%`, background: "#a855f7" }}
                    title={`Put γ ${p.putGex.toFixed(2)}`}
                  />
                </div>
                <div className="absolute left-1/2 top-0 h-full w-px bg-border/60" />
                <div className="flex h-full w-1/2 pl-px">
                  <div
                    className="h-full rounded-r-sm"
                    style={{ width: `${callPct}%`, background: "#f97316" }}
                    title={`Call γ ${p.callGex.toFixed(2)}`}
                  />
                </div>
              </div>
              {isSpot && (
                <span className="absolute right-1 text-[8px] font-bold text-cyan-300">
                  ● {spot.toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

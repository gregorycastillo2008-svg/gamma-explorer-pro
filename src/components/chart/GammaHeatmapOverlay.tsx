import { useEffect, useRef, useMemo } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { ExposurePoint } from "@/lib/gex";

interface Props {
  tick: number;
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  exposures: ExposurePoint[];
  spot: number;
  bucketSize?: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function gexColor(n: number): string | null {
  const a = Math.abs(n);
  if (a < 0.03) return null;
  if (n > 0) {
    // Positive GEX — dealer long gamma — red (pin/support/resistance)
    if (a <= 0.2) return `rgba(180,0,0,${lerp(0.04, 0.08, a / 0.2).toFixed(3)})`;
    if (a <= 0.4) return `rgba(200,0,0,${lerp(0.08, 0.18, (a - 0.2) / 0.2).toFixed(3)})`;
    if (a <= 0.6) return `rgba(220,0,0,${lerp(0.18, 0.32, (a - 0.4) / 0.2).toFixed(3)})`;
    if (a <= 0.8) return `rgba(240,20,20,${lerp(0.32, 0.52, (a - 0.6) / 0.2).toFixed(3)})`;
    return `rgba(255,40,40,${lerp(0.52, 0.78, (a - 0.8) / 0.2).toFixed(3)})`;
  } else {
    // Negative GEX — dealer short gamma — green (acceleration/volatility zone)
    if (a <= 0.2) return `rgba(0,180,100,${lerp(0.02, 0.06, a / 0.2).toFixed(3)})`;
    if (a <= 0.4) return `rgba(0,200,120,${lerp(0.06, 0.14, (a - 0.2) / 0.2).toFixed(3)})`;
    if (a <= 0.6) return `rgba(0,220,140,${lerp(0.14, 0.26, (a - 0.4) / 0.2).toFixed(3)})`;
    if (a <= 0.8) return `rgba(0,240,160,${lerp(0.26, 0.42, (a - 0.6) / 0.2).toFixed(3)})`;
    return `rgba(0,255,180,${lerp(0.42, 0.62, (a - 0.8) / 0.2).toFixed(3)})`;
  }
}

const LEGEND_STOPS = [
  { color: "rgba(255,40,40,0.78)", label: "MAX GEX+" },
  { color: "rgba(220,0,0,0.32)",   label: "GEX+" },
  { color: "rgba(0,0,0,0)",        label: "NEUTRAL", border: true },
  { color: "rgba(0,220,140,0.26)", label: "GEX−" },
  { color: "rgba(0,255,180,0.62)", label: "MAX GEX−" },
];

export function GammaHeatmapOverlay({
  tick, chartRef, seriesRef, wrapperRef, exposures, spot, bucketSize = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build normalized GEX buckets — memoized until exposures/bucketSize change
  const buckets = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of exposures) {
      const key = Math.round(e.strike / bucketSize) * bucketSize;
      map.set(key, (map.get(key) ?? 0) + e.netGex);
    }
    const vals = Array.from(map.values());
    const maxAbs = Math.max(1, ...vals.map(Math.abs));
    return Array.from(map.entries())
      .map(([price, gex]) => ({ price, normalized: gex / maxAbs }))
      .filter(b => Math.abs(b.normalized) >= 0.03);
  }, [exposures, bucketSize]);

  // Redraw canvas whenever tick (chart scroll/resize) or buckets change
  useEffect(() => {
    const canvas = canvasRef.current;
    const series = seriesRef.current;
    const chart  = chartRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !series || !chart || !wrapper) return;

    const W = wrapper.clientWidth;
    const H = wrapper.clientHeight;
    if (W <= 0 || H <= 0) return;

    const scaleW = chart.priceScale("right").width();
    const drawW  = Math.max(0, W - scaleW);

    const dpr = window.devicePixelRatio ?? 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const half = bucketSize * 0.5;
    for (const b of buckets) {
      const yTop = series.priceToCoordinate(b.price + half);
      const yBot = series.priceToCoordinate(b.price - half);
      if (yTop == null || yBot == null) continue;
      const top    = Math.min(yTop, yBot);
      const height = Math.max(1, Math.abs(yBot - yTop));
      if (top > H || top + height < 0) continue;

      const color = gexColor(b.normalized);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(0, Math.floor(top), drawW, Math.ceil(height));
    }
  }, [tick, buckets, seriesRef, chartRef, wrapperRef, bucketSize]);

  return (
    <>
      {/* Canvas heatmap — pointer-events:none so chart interactions work */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute", top: 0, left: 0,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Legend — top-right corner inside chart area */}
      <div style={{
        position: "absolute", top: 8, right: 68,
        background: "rgba(0,0,0,0.72)",
        border: "1px solid #222",
        borderRadius: 4,
        padding: "4px 7px",
        pointerEvents: "none",
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}>
        {LEGEND_STOPS.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 10, height: 8, borderRadius: 1, flexShrink: 0,
              background: s.color,
              border: s.border ? "1px solid #333" : "none",
            }} />
            <span style={{
              fontFamily: "monospace", fontSize: 8,
              color: "#777", whiteSpace: "nowrap",
            }}>{s.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

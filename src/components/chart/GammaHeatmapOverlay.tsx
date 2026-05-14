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

// Smoke color: positive gamma = green diffuse, negative gamma = red diffuse
function smokeColor(normalized: number): string | null {
  const a = Math.abs(normalized);
  if (a < 0.03) return null;
  const opacity = lerp(0.04, 0.20, a);
  if (normalized > 0) {
    return `rgba(74,222,128,${opacity.toFixed(3)})`;
  } else {
    return `rgba(248,113,113,${opacity.toFixed(3)})`;
  }
}

export function GammaHeatmapOverlay({
  tick, chartRef, seriesRef, wrapperRef, exposures, bucketSize = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

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

  // Redraw via rAF whenever tick (chart scroll/resize) or buckets change
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas  = canvasRef.current;
      const series  = seriesRef.current;
      const chart   = chartRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !series || !chart || !wrapper) return;

      const W = wrapper.clientWidth;
      const H = wrapper.clientHeight;
      if (W <= 0 || H <= 0) return;

      const scaleW = chart.priceScale("right").width();
      const drawW  = Math.max(0, W - scaleW);

      const dpr = window.devicePixelRatio ?? 1;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width        = Math.round(W * dpr);
        canvas.height       = Math.round(H * dpr);
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

        const color = smokeColor(b.normalized);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(0, Math.floor(top), drawW, Math.ceil(height));
      }
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick, buckets, seriesRef, chartRef, wrapperRef, bucketSize]);

  return (
    // Smoke canvas — blur applied via CSS, pointer-events off so chart interactions pass through
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 1,
        filter: "blur(18px)",
      }}
    />
  );
}

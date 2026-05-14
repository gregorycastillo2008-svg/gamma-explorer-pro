import { useEffect, useRef, useMemo, useState, useCallback } from "react";
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

interface BucketData {
  price:      number;
  normalized: number;
  netGex:     number;
  callGex:    number;
  putGex:     number;
  callOI:     number;
  putOI:      number;
  pct:        number;
}

interface Tip {
  x: number;
  y: number;
  bucket: BucketData;
}

const MONO = "JetBrains Mono, ui-monospace, monospace";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

// Only show top concentrations — threshold 20%, cubic power curve so peaks dominate
const SMOKE_THRESHOLD = 0.20;

function smokeColor(normalized: number): string | null {
  const a = Math.abs(normalized);
  if (a < SMOKE_THRESHOLD) return null;
  // remap [SMOKE_THRESHOLD, 1] → [0, 1], then cube for peak emphasis
  const t = (a - SMOKE_THRESHOLD) / (1 - SMOKE_THRESHOLD);
  const opacity = lerp(0.05, 0.62, t * t * t + t * 0.3);
  return normalized > 0
    ? `rgba(74,222,128,${opacity.toFixed(3)})`
    : `rgba(248,113,113,${opacity.toFixed(3)})`;
}

function fmtGex(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "+";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(2)}`;
}

function fmtOI(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export function GammaHeatmapOverlay({
  tick, chartRef, seriesRef, wrapperRef, exposures, bucketSize = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const [tip, setTip] = useState<Tip | null>(null);

  // Build rich bucket data — includes callOI, putOI, callGex, putGex per bucket
  const allBuckets = useMemo<BucketData[]>(() => {
    const map = new Map<number, { netGex: number; callGex: number; putGex: number; callOI: number; putOI: number }>();
    for (const e of exposures) {
      const key = Math.round(e.strike / bucketSize) * bucketSize;
      const cur = map.get(key) ?? { netGex: 0, callGex: 0, putGex: 0, callOI: 0, putOI: 0 };
      cur.netGex  += e.netGex;
      cur.callGex += e.callGex;
      cur.putGex  += e.putGex;
      cur.callOI  += e.callOI;
      cur.putOI   += e.putOI;
      map.set(key, cur);
    }
    const allVals = Array.from(map.values());
    const maxPos  = Math.max(1, ...allVals.filter(v => v.netGex > 0).map(v => v.netGex));
    const maxNeg  = Math.max(1, ...allVals.filter(v => v.netGex < 0).map(v => Math.abs(v.netGex)));
    const maxAbs  = Math.max(maxPos, maxNeg);  // for pct display only
    return Array.from(map.entries()).map(([price, data]) => ({
      price,
      ...data,
      // separate normalization: positive vs max-positive, negative vs max-negative
      normalized: data.netGex >= 0 ? data.netGex / maxPos : -(Math.abs(data.netGex) / maxNeg),
      pct: Math.abs(data.netGex / maxAbs * 100),
    }));
  }, [exposures, bucketSize]);

  // Drawing buckets — only real concentration zones
  const drawBuckets = useMemo(
    () => allBuckets.filter(b => Math.abs(b.normalized) >= SMOKE_THRESHOLD),
    [allBuckets],
  );

  // Redraw via rAF
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
      for (const b of drawBuckets) {
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
  }, [tick, drawBuckets, seriesRef, chartRef, wrapperRef, bucketSize]);

  // Hover detection — native event listener on the wrapper
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const series  = seriesRef.current;
    const wrapper = wrapperRef.current;
    if (!series || !wrapper) { setTip(null); return; }

    const rect    = wrapper.getBoundingClientRect();
    const mouseY  = e.clientY - rect.top;
    const mouseX  = e.clientX - rect.left;
    const price   = series.coordinateToPrice(mouseY);
    if (price == null) { setTip(null); return; }

    const bucketPrice = Math.round(price / bucketSize) * bucketSize;
    const bucket      = allBuckets.find(b => b.price === bucketPrice);
    if (!bucket || bucket.pct < 1) { setTip(null); return; }

    setTip({ x: mouseX, y: mouseY, bucket });
  }, [allBuckets, bucketSize, seriesRef, wrapperRef]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.addEventListener("mousemove", handleMouseMove);
    wrapper.addEventListener("mouseleave", () => setTip(null));
    return () => {
      wrapper.removeEventListener("mousemove", handleMouseMove);
      wrapper.removeEventListener("mouseleave", () => setTip(null));
    };
  }, [wrapperRef, handleMouseMove]);

  const tipColor  = tip ? (tip.bucket.netGex >= 0 ? "#22c55e" : "#ef4444") : "#22c55e";
  const tipLabel  = tip ? (tip.bucket.netGex >= 0 ? "POSITIVE Γ · Dealer Long" : "NEGATIVE Γ · Dealer Short") : "";
  const wrapW     = wrapperRef.current?.clientWidth ?? 700;
  const wrapH     = wrapperRef.current?.clientHeight ?? 400;

  return (
    <>
      {/* Smoke canvas — blur 18px, pointer-events none */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute", top: 0, left: 0,
          pointerEvents: "none", zIndex: 1,
          filter: "blur(18px)",
        }}
      />

      {/* Hover tooltip */}
      {tip && (
        <div
          style={{
            position: "absolute",
            left:  Math.min(tip.x + 16, wrapW - 230),
            top:   Math.max(4, Math.min(tip.y - 80, wrapH - 180)),
            background: "#0d0d0d",
            border: `1px solid ${tipColor}`,
            borderRadius: 6,
            padding: "8px 12px",
            pointerEvents: "none",
            zIndex: 15,
            fontFamily: MONO,
            minWidth: 210,
            boxShadow: `0 0 20px ${tipColor}22`,
          }}
        >
          {/* Strike header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
            <span style={{ color: tipColor, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>
              ${tip.bucket.price.toLocaleString()}
            </span>
            <span style={{
              fontSize: 8, padding: "1px 5px", borderRadius: 2,
              background: `${tipColor}18`, color: tipColor,
              letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              {tipLabel}
            </span>
          </div>

          <div style={{ height: 1, background: "#1f1f1f", margin: "4px 0 6px" }} />

          {/* NET GEX + % */}
          <TipRow label="NET GEX"     value={fmtGex(tip.bucket.netGex)}              color={tipColor} bold />
          <TipRow label="% OF MAX"    value={`${tip.bucket.pct.toFixed(1)}%`}         color={tip.bucket.pct > 60 ? tipColor : "#9ca3af"} />

          <div style={{ height: 1, background: "#1a1a1a", margin: "5px 0" }} />

          {/* Call / Put GEX */}
          <TipRow label="CALL GEX"    value={fmtGex(tip.bucket.callGex)}             color="#22c55e" />
          <TipRow label="PUT GEX"     value={fmtGex(tip.bucket.putGex)}              color="#ef4444" />

          <div style={{ height: 1, background: "#1a1a1a", margin: "5px 0" }} />

          {/* OI */}
          <TipRow label="CALL OI"     value={fmtOI(tip.bucket.callOI)}               color="#22c55e" />
          <TipRow label="PUT OI"      value={fmtOI(tip.bucket.putOI)}                color="#ef4444" />
          <TipRow label="P/C OI"
            value={tip.bucket.callOI > 0
              ? (tip.bucket.putOI / tip.bucket.callOI).toFixed(2) : "—"}
            color="#6b7280"
          />
        </div>
      )}
    </>
  );
}

function TipRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ fontSize: 9, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 10, color, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

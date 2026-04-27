import { useEffect, useMemo, useRef, useState } from "react";
import type { GexSnapshot } from "@/lib/gexSimData";
import { generateCandles } from "@/lib/gexSimData";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TIMEFRAMES = ["1D", "5D", "1M", "3M", "6M", "1Y"] as const;
type TF = typeof TIMEFRAMES[number];

interface Props {
  symbol: string;
  basePrice: number;
  currentPrice: number;
  snapshot: GexSnapshot;
}

/**
 * Single integrated chart:
 *  - Price line on the left/center
 *  - GEX horizontal bars overlaid at the right side, aligned to strike (Y axis = price)
 *  - Blue OI percentile dots inside the bars
 *  - Yellow horizontal line at current price
 *  - Cyan vertical "now" line
 */
export function PriceGexChart({ symbol, basePrice, currentPrice, snapshot }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<TF>("1D");
  const [size, setSize] = useState({ w: 1000, h: 560 });
  const [hover, setHover] = useState<{ x: number; y: number; price: number } | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: Math.max(600, e.contentRect.width), h: 560 });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const candles = useMemo(() => generateCandles(symbol, tf, basePrice), [symbol, tf, basePrice]);

  // Layout
  const PAD = { top: 20, right: 70, bottom: 30, left: 50 };
  const W = size.w, H = size.h;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // GEX panel takes right ~38% of inner area
  const gexW = innerW * 0.38;
  const priceW = innerW - gexW;

  // Y range: union of candles + strikes within ±8% of spot (show all gamma)
  const priceRange = currentPrice * 0.08;
  const strikes = snapshot.gexByStrike.filter(
    (s) => Math.abs(s.strike - currentPrice) <= priceRange && (Math.abs(s.callGEX) > 0 || Math.abs(s.putGEX) > 0),
  );
  const allLow = Math.min(...candles.map((c) => c.low), ...strikes.map((s) => s.strike));
  const allHigh = Math.max(...candles.map((c) => c.high), ...strikes.map((s) => s.strike));
  const padY = (allHigh - allLow) * 0.05;
  const yMin = allLow - padY;
  const yMax = allHigh + padY;

  const yScale = (p: number) => PAD.top + ((yMax - p) / (yMax - yMin)) * innerH;
  const priceXScale = (i: number) => PAD.left + (i / Math.max(1, candles.length - 1)) * priceW;

  // GEX bars area: x = PAD.left + priceW .. PAD.left + innerW
  // Bar value scale: use absolute call/put GEX in billions
  const maxAbs = Math.max(1, ...strikes.map((s) => Math.max(Math.abs(s.callGEX), Math.abs(s.putGEX))));
  const barXScale = (gexB: number) => {
    // 0 at left edge of GEX panel
    const zeroX = PAD.left + priceW;
    const px = (Math.abs(gexB) / maxAbs) * (gexW - 10);
    return { zeroX, px };
  };

  // Build line path
  const linePath = candles.map((c, i) => `${i === 0 ? "M" : "L"}${priceXScale(i).toFixed(1)} ${yScale(c.close).toFixed(1)}`).join(" ");

  // Y ticks
  const yTicks = useMemo(() => {
    const step = (yMax - yMin) / 18;
    const niceStep = Math.pow(10, Math.floor(Math.log10(step)));
    const s = Math.ceil(step / niceStep) * niceStep;
    const ticks: number[] = [];
    const start = Math.ceil(yMin / s) * s;
    for (let v = start; v <= yMax; v += s) ticks.push(v);
    return ticks;
  }, [yMin, yMax]);

  // X ticks (time)
  const xTicks = useMemo(() => {
    const n = 8;
    return Array.from({ length: n }, (_, i) => Math.floor((candles.length - 1) * (i / (n - 1))));
  }, [candles.length]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts * 1000);
    if (tf === "1D" || tf === "5D") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < PAD.left || x > PAD.left + innerW || y < PAD.top || y > PAD.top + innerH) {
      setHover(null); return;
    }
    const price = yMax - ((y - PAD.top) / innerH) * (yMax - yMin);
    setHover({ x, y, price });
  };

  const yPriceLine = yScale(currentPrice);
  const yZeroGamma = yScale(snapshot.keyLevels.zeroGamma);
  const yMajorPos = yScale(snapshot.keyLevels.majorPositive);
  const yMajorNeg = yScale(snapshot.keyLevels.majorNegative);

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
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Call GEX</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Put GEX</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> OI %</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-yellow-400" /> Spot</span>
        </div>
      </div>

      <div ref={wrapRef} className="w-full rounded border border-[#1f1f1f] bg-black relative">
        <svg width={W} height={H} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)} style={{ display: "block" }}>
          {/* Background grid */}
          {yTicks.map((t) => (
            <line key={`yg${t}`} x1={PAD.left} x2={PAD.left + innerW} y1={yScale(t)} y2={yScale(t)} stroke="#1a1a1a" strokeWidth={1} />
          ))}
          {xTicks.map((i) => (
            <line key={`xg${i}`} x1={priceXScale(i)} x2={priceXScale(i)} y1={PAD.top} y2={PAD.top + innerH} stroke="#1a1a1a" strokeWidth={1} />
          ))}

          {/* Vertical separator between price and GEX panel */}
          <line x1={PAD.left + priceW} x2={PAD.left + priceW} y1={PAD.top} y2={PAD.top + innerH} stroke="#06b6d4" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />

          {/* Y axis labels (left) */}
          {yTicks.map((t) => (
            <text key={`yl${t}`} x={PAD.left - 6} y={yScale(t) + 3} fill="#6b7280" fontSize={10} fontFamily="monospace" textAnchor="end">
              {t.toFixed(t < 100 ? 2 : 0)}
            </text>
          ))}

          {/* X axis labels */}
          {xTicks.map((i) => (
            <text key={`xl${i}`} x={priceXScale(i)} y={PAD.top + innerH + 14} fill="#6b7280" fontSize={10} fontFamily="monospace" textAnchor="middle">
              {fmtTime(candles[i].time)}
            </text>
          ))}

          {/* GEX bars (horizontal, growing right from separator) */}
          {strikes.map((s, idx) => {
            const y = yScale(s.strike);
            const barH = Math.max(2, Math.min(10, innerH / strikes.length - 1));
            const { zeroX, px: callPx } = barXScale(s.callGEX);
            const { px: putPx } = barXScale(s.putGEX);
            const isAbove = s.strike >= currentPrice;
            return (
              <g key={s.strike}>
                {/* Call bar (green) */}
                {Math.abs(s.callGEX) > 0 && (
                  <rect
                    x={zeroX} y={y - barH / 2} width={callPx} height={barH}
                    fill={isAbove ? "#10b981" : "#10b98155"}
                    opacity={0.85}
                  />
                )}
                {/* Put bar (red) — same side, slightly offset down */}
                {Math.abs(s.putGEX) > 0 && (
                  <rect
                    x={zeroX} y={y - barH / 2 + barH * 0.1} width={putPx} height={barH * 0.8}
                    fill={isAbove ? "#ef444455" : "#ef4444"}
                    opacity={0.7}
                  />
                )}
                {/* OI percentile dots */}
                {[20, 40, 60, 80, 100].filter((p) => s.oiPct >= p).map((p, i) => (
                  <circle
                    key={p}
                    cx={zeroX + (p / 100) * (gexW - 10) * 0.6}
                    cy={y}
                    r={1.8}
                    fill="#3b82f6"
                    opacity={0.9}
                  />
                ))}
                {/* Strike label on far right */}
                {idx % 2 === 0 && (
                  <text x={W - PAD.right + 6} y={y + 3} fill="#9ca3af" fontSize={9} fontFamily="monospace">
                    {s.strike.toFixed(s.strike < 100 ? 1 : 0)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Key level horizontal lines (full width) */}
          <line x1={PAD.left} x2={PAD.left + innerW} y1={yMajorPos} y2={yMajorPos} stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          <text x={PAD.left + 4} y={yMajorPos - 3} fill="#10b981" fontSize={9} fontFamily="monospace">{snapshot.keyLevels.majorPositive.toFixed(2)}</text>

          <line x1={PAD.left} x2={PAD.left + innerW} y1={yMajorNeg} y2={yMajorNeg} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          <text x={PAD.left + 4} y={yMajorNeg - 3} fill="#ef4444" fontSize={9} fontFamily="monospace">{snapshot.keyLevels.majorNegative.toFixed(2)}</text>

          <line x1={PAD.left} x2={PAD.left + innerW} y1={yZeroGamma} y2={yZeroGamma} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
          <text x={PAD.left + 4} y={yZeroGamma - 3} fill="#fbbf24" fontSize={9} fontFamily="monospace">0γ {snapshot.keyLevels.zeroGamma.toFixed(2)}</text>

          {/* Price line */}
          <path d={linePath} fill="none" stroke="#06b6d4" strokeWidth={1.5} />

          {/* Spot horizontal line (white) */}
          <line x1={PAD.left} x2={PAD.left + innerW} y1={yPriceLine} y2={yPriceLine} stroke="#ffffff" strokeWidth={1} opacity={0.9} />
          <rect x={PAD.left - 48} y={yPriceLine - 8} width={46} height={16} fill="#ffffff" />
          <text x={PAD.left - 4} y={yPriceLine + 4} fill="#000" fontSize={10} fontFamily="monospace" fontWeight="bold" textAnchor="end">
            {currentPrice.toFixed(2)}
          </text>

          {/* "Now" vertical line at end of price area */}
          <line x1={PAD.left + priceW} x2={PAD.left + priceW} y1={PAD.top} y2={PAD.top + innerH} stroke="#06b6d4" strokeWidth={1} strokeDasharray="2 4" opacity={0.4} />

          {/* Hover crosshair */}
          {hover && (
            <g>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={hover.y} y2={hover.y} stroke="#6b7280" strokeWidth={1} strokeDasharray="2 2" />
              <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + innerH} stroke="#6b7280" strokeWidth={1} strokeDasharray="2 2" />
              <rect x={PAD.left + innerW + 2} y={hover.y - 9} width={62} height={18} fill="#06b6d4" />
              <text x={PAD.left + innerW + 6} y={hover.y + 4} fill="#000" fontSize={10} fontFamily="monospace" fontWeight="bold">
                {hover.price.toFixed(2)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

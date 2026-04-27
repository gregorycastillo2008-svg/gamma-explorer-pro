import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { OptionContract, DemoTicker, formatNumber } from "@/lib/gex";

type Greek = "speed" | "zomma" | "color";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

// ─────────── Black-Scholes helpers ───────────
function pdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1(S: number, K: number, r: number, sigma: number, T: number) {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

// Speed = ∂Γ/∂S
function speed(S: number, K: number, r: number, sigma: number, T: number) {
  if (T <= 0 || sigma <= 0) return 0;
  const D1 = d1(S, K, r, sigma, T);
  const gamma = pdf(D1) / (S * sigma * Math.sqrt(T));
  return -gamma / S * (D1 / (sigma * Math.sqrt(T)) + 1);
}

// Zomma = ∂Γ/∂σ
function zomma(S: number, K: number, r: number, sigma: number, T: number) {
  if (T <= 0 || sigma <= 0) return 0;
  const D1 = d1(S, K, r, sigma, T);
  const D2 = D1 - sigma * Math.sqrt(T);
  const gamma = pdf(D1) / (S * sigma * Math.sqrt(T));
  return (gamma * (D1 * D2 - 1)) / sigma;
}

// Color = ∂Γ/∂t  (gamma decay per unit time, per year)
function color(S: number, K: number, r: number, sigma: number, T: number) {
  if (T <= 0 || sigma <= 0) return 0;
  const D1 = d1(S, K, r, sigma, T);
  const D2 = D1 - sigma * Math.sqrt(T);
  const num = -pdf(D1) / (2 * S * T * sigma * Math.sqrt(T));
  return num * (2 * r * T + 1 + ((2 * r * T - D2 * sigma * Math.sqrt(T)) / (sigma * Math.sqrt(T))) * D1);
}

const META: Record<Greek, { title: string; subtitle: string; symbol: string }> = {
  speed: { title: "SPEEDEX BY STRIKE", subtitle: "ΔΓ / ΔS · gamma acceleration per $1", symbol: "Speed" },
  zomma: { title: "ZOMMAEX BY STRIKE", subtitle: "ΔΓ / ΔIV · gamma sensitivity to vol", symbol: "Zomma" },
  color: { title: "COLOREX BY STRIKE", subtitle: "ΔΓ / Δt · gamma decay per day", symbol: "Color" },
};

// signed log scale so ATM doesn't dwarf OTM
function signedLog(v: number, max: number) {
  if (v === 0 || max === 0) return 0;
  const sign = Math.sign(v);
  const a = Math.abs(v);
  const m = Math.log1p(a) / Math.log1p(max);
  return sign * Math.min(1, m);
}

function computeGreekByStrike(ticker: DemoTicker, contracts: OptionContract[], greek: Greek) {
  const r = 0.05;
  const byStrike = new Map<number, number>();
  for (const c of contracts) {
    const T = Math.max(c.expiry, 0.5) / 365;
    const sigma = Math.max(c.iv, 0.05);
    let g = 0;
    if (greek === "speed") g = speed(ticker.spot, c.strike, r, sigma, T);
    else if (greek === "zomma") g = zomma(ticker.spot, c.strike, r, sigma, T);
    else g = color(ticker.spot, c.strike, r, sigma, T) / 365; // per day
    // dealer perspective: short calls (negative) + long puts ish — sign per OI
    const signed = g * (c.openInterest ?? 0) * (c.type === "call" ? 1 : -1) * 100;
    byStrike.set(c.strike, (byStrike.get(c.strike) ?? 0) + signed);
  }
  const arr = Array.from(byStrike.entries())
    .map(([strike, value]) => ({ strike, value }))
    .sort((a, b) => b.strike - a.strike);
  return arr;
}

// ─────────── Single greek column ───────────
function GreekColumn({
  ticker,
  data,
  meta,
  pairValue,
  greek,
  pairGreek,
}: {
  ticker: DemoTicker;
  data: { strike: number; value: number }[];
  meta: { title: string; subtitle: string; symbol: string };
  pairValue: Map<number, number>;
  greek: Greek;
  pairGreek: Greek;
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const [hover, setHover] = useState<{ strike: number; value: number; x: number; y: number } | null>(null);

  // Find spot row
  const spotIdx = data.findIndex((p) => Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2);

  return (
    <div
      className="relative bg-black border border-[#1a1a1a] rounded flex flex-col h-full overflow-hidden"
      onMouseLeave={() => setHover(null)}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#1a1a1a] shrink-0">
        <div className="font-jetbrains text-[10px] uppercase tracking-[0.2em] text-[#00ffa3] font-bold">
          {meta.title}
        </div>
        <div className="font-jetbrains text-[9px] text-[#6b7280] mt-0.5">{meta.subtitle}</div>
      </div>

      {/* Bars */}
      <div className="flex-1 min-h-0 relative flex flex-col gap-[5px] px-2 py-2">
        {/* SPOT line — neon purple */}
        {spotIdx >= 0 && data.length > 0 && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20"
            style={{ top: `calc(${((spotIdx + 0.5) / data.length) * 100}% + 0px)` }}
          >
            <div
              className="h-px"
              style={{
                background: "repeating-linear-gradient(90deg, #b14dff 0 6px, transparent 6px 12px)",
                boxShadow: "0 0 8px #b14dff, 0 0 16px #b14dff66",
              }}
            />
            <div
              className="absolute right-1 -top-2 font-jetbrains text-[8px] px-1.5 py-0.5 rounded"
              style={{ background: "#b14dff22", color: "#d9a8ff", border: "1px solid #b14dff66" }}
            >
              SPOT ${ticker.spot.toFixed(2)}
            </div>
          </div>
        )}

        {data.map((p) => {
          const norm = signedLog(p.value, max);
          const w = Math.abs(norm) * 100;
          const isPos = p.value >= 0;
          const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
          const isHover = hover?.strike === p.strike;
          return (
            <div
              key={p.strike}
              onMouseMove={(e) => {
                const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setHover({ strike: p.strike, value: p.value, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              className="grid grid-cols-[44px_1fr_1fr] items-center cursor-crosshair flex-1 min-h-0 gap-1"
            >
              {/* Strike label */}
              <div
                className={`font-jetbrains text-[10px] text-right pr-1 ${
                  isSpot ? "text-[#b14dff] font-bold" : "text-[#9ca3af]"
                }`}
              >
                ${p.strike}
              </div>
              {/* Negative side */}
              <div className="flex justify-end items-center h-full pr-[1px]">
                {!isPos && (
                  <div
                    className="h-[70%] max-h-[12px] min-h-[3px] rounded-l transition-all relative"
                    style={{
                      width: `${w}%`,
                      background: "linear-gradient(90deg, #ff4d4d 0%, #ff4d4d88 80%, transparent 100%)",
                      boxShadow: isHover
                        ? "0 0 12px #ff4d4d, inset 0 0 6px #fff3"
                        : "0 0 5px rgba(255,77,77,0.35)",
                      outline: isHover ? "1px solid #ff4d4d" : undefined,
                    }}
                  >
                    {w > 35 && (
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 font-jetbrains text-[9px] text-white/90 pointer-events-none">
                        {formatNumber(p.value, 1)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Positive side */}
              <div className="flex items-center h-full pl-[1px]" style={{ borderLeft: "1px solid #1a1a1a" }}>
                {isPos && (
                  <div
                    className="h-[70%] max-h-[12px] min-h-[3px] rounded-r transition-all relative"
                    style={{
                      width: `${w}%`,
                      background: "linear-gradient(90deg, transparent 0%, #00ffa388 20%, #00ffa3 100%)",
                      boxShadow: isHover
                        ? "0 0 12px #00ffa3, inset 0 0 6px #fff3"
                        : "0 0 5px rgba(0,255,163,0.35)",
                      outline: isHover ? "1px solid #00ffa3" : undefined,
                    }}
                  >
                    {w > 35 && (
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 font-jetbrains text-[9px] text-black font-bold pointer-events-none">
                        {formatNumber(p.value, 1)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer legend */}
      <div className="px-3 py-1.5 border-t border-[#1a1a1a] shrink-0 flex items-center justify-between font-jetbrains text-[9px]">
        <span className="text-[#ff4d4d]">◀ Negative</span>
        <span className="text-[#b14dff]">┄ SPOT</span>
        <span className="text-[#00ffa3]">Positive ▶</span>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-30 bg-black/95 backdrop-blur border border-[#1f1f1f] rounded px-3 py-2 font-jetbrains text-[11px] shadow-2xl"
            style={{
              left: Math.min(hover.x + 14, 9999),
              top: hover.y + 14,
              boxShadow: "0 0 20px rgba(177,77,255,0.25)",
            }}
          >
            <div className="text-[9px] uppercase tracking-[0.18em] text-[#6b7280] mb-1">Strike</div>
            <div className="text-[#b14dff] text-sm font-bold">${hover.strike}</div>
            <div className="mt-1.5 space-y-0.5">
              <div style={{ color: hover.value >= 0 ? "#00ffa3" : "#ff4d4d" }}>
                {meta.symbol}: {formatNumber(hover.value)}
              </div>
              <div className="text-[#6b7280]">
                {pairGreek === "zomma" ? "Zomma" : pairGreek === "speed" ? "Speed" : "Color"}:{" "}
                <span style={{ color: (pairValue.get(hover.strike) ?? 0) >= 0 ? "#00ffa3" : "#ff4d4d" }}>
                  {formatNumber(pairValue.get(hover.strike) ?? 0)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────── Main panel ───────────
export function ThirdOrderGreeksPanel({ ticker, contracts }: Props) {
  const [leftGreek, setLeftGreek] = useState<Greek>("speed");
  const [rightGreek, setRightGreek] = useState<Greek>("zomma");

  const leftData = useMemo(() => computeGreekByStrike(ticker, contracts, leftGreek), [ticker, contracts, leftGreek]);
  const rightData = useMemo(() => computeGreekByStrike(ticker, contracts, rightGreek), [ticker, contracts, rightGreek]);

  const leftMap = useMemo(() => new Map(leftData.map((d) => [d.strike, d.value])), [leftData]);
  const rightMap = useMemo(() => new Map(rightData.map((d) => [d.strike, d.value])), [rightData]);

  const TabBtn = ({
    g,
    active,
    onClick,
  }: {
    g: Greek;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1 font-jetbrains text-[10px] uppercase tracking-[0.18em] rounded transition-all ${
        active
          ? "bg-[#00ffa3] text-black shadow-[0_0_10px_#00ffa388]"
          : "bg-black/60 text-[#6b7280] hover:text-[#9ca3af] border border-[#1a1a1a]"
      }`}
    >
      {g}
    </button>
  );

  return (
    <div className="h-full flex flex-col gap-2 min-h-0 bg-black p-2 rounded">
      {/* Tab selectors per column */}
      <div className="grid grid-cols-2 gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-jetbrains text-[9px] text-[#6b7280] uppercase tracking-[0.18em] mr-1">Left:</span>
          {(["speed", "zomma", "color"] as Greek[]).map((g) => (
            <TabBtn key={g} g={g} active={leftGreek === g} onClick={() => setLeftGreek(g)} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-jetbrains text-[9px] text-[#6b7280] uppercase tracking-[0.18em] mr-1">Right:</span>
          {(["speed", "zomma", "color"] as Greek[]).map((g) => (
            <TabBtn key={g} g={g} active={rightGreek === g} onClick={() => setRightGreek(g)} />
          ))}
        </div>
      </div>

      {/* Dual grid */}
      <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
        <GreekColumn
          ticker={ticker}
          data={leftData}
          meta={META[leftGreek]}
          pairValue={rightMap}
          greek={leftGreek}
          pairGreek={rightGreek}
        />
        <GreekColumn
          ticker={ticker}
          data={rightData}
          meta={META[rightGreek]}
          pairValue={leftMap}
          greek={rightGreek}
          pairGreek={leftGreek}
        />
      </div>
    </div>
  );
}

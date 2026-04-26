import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, ReactNode } from "react";

interface Props {
  sectionKey: string;
  children: ReactNode;
}

const SECTION_LABELS: Record<string, string> = {
  overview: "MARKET OVERVIEW",
  "oi-analytics": "OI ANALYTICS",
  "gex-dex": "GEX // DEX EXPOSURE",
  greeks: "GREEK LADDER",
  depth: "ORDER BOOK DEPTH",
  levels: "KEY LEVELS",
  hedge: "HEDGE PRESSURE",
  "vanna-charm": "VANNA & CHARM",
  "vega-theta": "VEGA & THETA",
  volatility: "VOLATILITY MATRIX",
  heatmap: "IV HEATMAP",
  regime: "MARKET REGIME",
  risk: "RISK PROFILE",
  anomaly: "ANOMALY DETECTION",
  "ai-bias": "AI BIAS FORECAST",
};

const BOOT_LINES = [
  "› init market feed",
  "› decoding option chain",
  "› computing greeks",
  "› aggregating exposure",
  "› ready",
];

export function SectionTransition({ sectionKey, children }: Props) {
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setTick(0);
    const lineId = setInterval(() => setTick((t) => Math.min(t + 1, BOOT_LINES.length)), 90);
    const doneId = setTimeout(() => setLoading(false), 600);
    return () => {
      clearInterval(lineId);
      clearTimeout(doneId);
    };
  }, [sectionKey]);

  const label = SECTION_LABELS[sectionKey] ?? sectionKey.toUpperCase();

  return (
    <div className="relative">
      <AnimatePresence>
        {loading && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background"
          >
            {/* Scanline backdrop */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div
                initial={{ y: "-100%" }}
                animate={{ y: "100%" }}
                transition={{ duration: 0.6, ease: "linear" }}
                className="absolute inset-x-0 h-32"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 0%, rgba(0,255,255,0.04) 45%, rgba(0,255,255,0.12) 50%, rgba(0,255,255,0.04) 55%, transparent 100%)",
                }}
              />
              {/* CRT grid */}
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(0deg, #00ffff 1px, transparent 1px), linear-gradient(90deg, #00ffff 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
            </div>

            <div className="relative flex flex-col items-center gap-6 max-w-md w-full px-6">
              {/* Animated orbital rings */}
              <div className="relative w-28 h-28">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    initial={{ rotate: 0, scale: 0.5, opacity: 0 }}
                    animate={{ rotate: 360, scale: 1, opacity: 1 }}
                    transition={{
                      rotate: { duration: 1.6 - i * 0.3, repeat: Infinity, ease: "linear" },
                      scale: { duration: 0.4, delay: i * 0.06 },
                      opacity: { duration: 0.3, delay: i * 0.06 },
                    }}
                    className="absolute inset-0 rounded-full border"
                    style={{
                      borderColor: i === 0 ? "#00ffff" : i === 1 ? "#00ff88" : "#0088ff",
                      borderTopColor: "transparent",
                      borderLeftColor: "transparent",
                      transform: `scale(${1 - i * 0.2})`,
                      boxShadow: `0 0 18px rgba(0, ${i === 0 ? 255 : 200}, ${i === 2 ? 255 : 180}, 0.5)`,
                    }}
                  />
                ))}
                {/* core */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 m-auto w-3 h-3 rounded-full"
                  style={{ background: "#00ffff", boxShadow: "0 0 24px #00ffff, 0 0 40px #00ffff" }}
                />
              </div>

              {/* Title */}
              <div className="text-center">
                <motion.div
                  initial={{ opacity: 0, y: 8, letterSpacing: "0.05em" }}
                  animate={{ opacity: 1, y: 0, letterSpacing: "0.4em" }}
                  transition={{ duration: 0.4 }}
                  className="text-[10px] uppercase font-jetbrains text-[#6b7280] mb-2"
                >
                  loading module
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.05 }}
                  className="text-xl font-bold font-jetbrains tracking-[0.25em] text-[#00ffff]"
                  style={{ textShadow: "0 0 14px rgba(0,255,255,0.55)" }}
                >
                  {label}
                </motion.div>
              </div>

              {/* Boot log */}
              <div className="w-full bg-black/60 border border-[#0d2626] rounded p-3 font-jetbrains text-[10px] text-[#00ff88] min-h-[110px]">
                {BOOT_LINES.slice(0, tick).map((l, i) => (
                  <motion.div
                    key={l}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className="leading-relaxed"
                  >
                    {l}
                    {i === tick - 1 && (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="ml-1"
                      >
                        ▌
                      </motion.span>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="w-full h-0.5 bg-[#0a1a1a] overflow-hidden rounded">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="h-full"
                  style={{
                    background: "linear-gradient(90deg, #0088ff, #00ffff, #00ff88)",
                    boxShadow: "0 0 10px #00ffff",
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        key={sectionKey}
        initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.45, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

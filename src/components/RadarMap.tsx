import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  size?: number;
}

interface Sat {
  id: string;
  angle: number; // degrees, 0 = +X axis, clockwise
  radiusFactor: number; // 0..1 of radar radius
}

export function RadarMap({ size = 560 }: Props) {
  const center = size / 2;
  const r = size / 2 - 10;

  // Two satellites: one on the left side, one on the right side of the radar
  const sats: Sat[] = [
    { id: "GEXSATELIT-01", angle: 175, radiusFactor: 0.7 }, // left
    { id: "GEXSATELIT-02", angle: 5, radiusFactor: 0.65 },  // right
  ];

  const SWEEP = 4;
  // Which satellites are currently "lit" by the sweep
  const [hits, setHits] = useState<Record<string, boolean>>({});
  // Centered banner toggle
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    let cancelled = false;

    const scheduleSat = (sat: Sat) => {
      const normalized = ((sat.angle % 360) + 360) % 360;
      const hitAt = (normalized / 360) * SWEEP * 1000;

      const tick = () => {
        if (cancelled) return;
        const now = performance.now();
        const phase = now % (SWEEP * 1000);
        const delay = (hitAt - phase + SWEEP * 1000) % (SWEEP * 1000);
        const id = window.setTimeout(() => {
          if (cancelled) return;
          setHits((h) => ({ ...h, [sat.id]: true }));
          setShowBanner(true);
          window.setTimeout(() => {
            setHits((h) => ({ ...h, [sat.id]: false }));
          }, 1400);
          window.setTimeout(() => setShowBanner(false), 2000);
          tick();
        }, delay);
        timers.push(id);
      };
      tick();
    };

    sats.forEach(scheduleSat);
    return () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
    };
  }, []);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 40%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative mx-[200px]">
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0a1a3a" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#020818" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
          </radialGradient>
          <linearGradient id="sweepGrad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.85" />
          </linearGradient>
          <filter id="blipGlow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={center} cy={center} r={r} fill="url(#radarBg)" stroke="#3b82f6" strokeOpacity="0.5" strokeWidth={1.5} />

        {[0.25, 0.5, 0.75].map((f, i) => (
          <circle key={i} cx={center} cy={center} r={r * f} fill="none" stroke="#3b82f6" strokeOpacity={0.18} strokeWidth={1} />
        ))}

        <line x1={center - r} y1={center} x2={center + r} y2={center} stroke="#3b82f6" strokeOpacity={0.18} strokeWidth={1} />
        <line x1={center} y1={center - r} x2={center} y2={center + r} stroke="#3b82f6" strokeOpacity={0.18} strokeWidth={1} />
        <line x1={center - r * 0.707} y1={center - r * 0.707} x2={center + r * 0.707} y2={center + r * 0.707} stroke="#3b82f6" strokeOpacity={0.08} strokeWidth={1} />
        <line x1={center - r * 0.707} y1={center + r * 0.707} x2={center + r * 0.707} y2={center - r * 0.707} stroke="#3b82f6" strokeOpacity={0.08} strokeWidth={1} />

        <g fill="#3b82f6" fillOpacity="0.5" fontSize={11} fontFamily="monospace" fontWeight="bold">
          <text x={center} y={14} textAnchor="middle">N</text>
          <text x={size - 8} y={center + 4} textAnchor="end">E</text>
          <text x={center} y={size - 4} textAnchor="middle">S</text>
          <text x={8} y={center + 4} textAnchor="start">W</text>
        </g>

        {/* Sweep arm */}
        <motion.g
          style={{ originX: `${center}px`, originY: `${center}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: SWEEP, repeat: Infinity, ease: "linear" }}
        >
          <path
            d={`M ${center} ${center} L ${center + r} ${center} A ${r} ${r} 0 0 0 ${center + r * Math.cos(-Math.PI / 3)} ${center + r * Math.sin(-Math.PI / 3)} Z`}
            fill="url(#sweepGrad)"
          />
          <line x1={center} y1={center} x2={center + r} y2={center} stroke="#3b82f6" strokeWidth={2} strokeOpacity={0.9} />
        </motion.g>

        <circle cx={center} cy={center} r={4} fill="#3b82f6" />
        <circle cx={center} cy={center} r={8} fill="none" stroke="#3b82f6" strokeOpacity={0.4} strokeWidth={1} />

        {/* Satellites — always visible inside the radar, brighter when detected */}
        {sats.map((sat) => {
          const rad = (sat.angle * Math.PI) / 180;
          const sx = center + Math.cos(rad) * r * sat.radiusFactor;
          const sy = center + Math.sin(rad) * r * sat.radiusFactor;
          const lit = hits[sat.id];

          return (
            <g key={sat.id} filter="url(#blipGlow)">
              <AnimatePresence>
                {lit && (
                  <>
                    <motion.circle
                      cx={sx}
                      cy={sy}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      initial={{ r: 12, opacity: 0.95 }}
                      animate={{ r: 70, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                    />
                    <motion.circle
                      cx={sx}
                      cy={sy}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1}
                      initial={{ r: 12, opacity: 0.7 }}
                      animate={{ r: 100, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Satellite drawing — only visible while detected */}
              {lit && (
                <motion.g
                  transform={`translate(${sx}, ${sy}) rotate(-15) scale(2.4)`}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Solar panels */}
                  <rect x={-22} y={-4} width={12} height={8} fill="#3b82f6" fillOpacity={0.9} stroke="#3b82f6" strokeWidth={0.5} />
                  <line x1={-22} y1={0} x2={-10} y2={0} stroke="#0a1a3a" strokeWidth={0.5} />
                  <line x1={-16} y1={-4} x2={-16} y2={4} stroke="#0a1a3a" strokeWidth={0.5} />
                  <rect x={10} y={-4} width={12} height={8} fill="#3b82f6" fillOpacity={0.9} stroke="#3b82f6" strokeWidth={0.5} />
                  <line x1={10} y1={0} x2={22} y2={0} stroke="#0a1a3a" strokeWidth={0.5} />
                  <line x1={16} y1={-4} x2={16} y2={4} stroke="#0a1a3a" strokeWidth={0.5} />
                  {/* Arms */}
                  <line x1={-10} y1={0} x2={-5} y2={0} stroke="#3b82f6" strokeWidth={1} />
                  <line x1={5} y1={0} x2={10} y2={0} stroke="#3b82f6" strokeWidth={1} />
                  {/* Body */}
                  <rect x={-5} y={-5} width={10} height={10} rx={1.5} fill="#3b82f6" stroke="#0a1a3a" strokeWidth={0.8} />
                  {/* Antenna */}
                  <line x1={0} y1={-5} x2={0} y2={-11} stroke="#3b82f6" strokeWidth={1} />
                  <circle cx={0} cy={-12} r={1.8} fill="#3b82f6" />
                </motion.g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Centered detection banner — 2 seconds */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div
              className="px-3 py-1.5 rounded-md font-mono font-black tracking-[0.25em] text-[#3b82f6]"
              style={{
                background: "rgba(2,8,24, 0.85)",
                border: "1px solid #3b82f6",
                boxShadow: "0 0 18px rgba(59,130,246,0.5), inset 0 0 12px rgba(59,130,246,0.15)",
                fontSize: 11,
                textShadow: "0 0 8px rgba(59,130,246,0.9)",
              }}
            >
              ▸ GEXSATELIT
              <div className="text-[7px] tracking-[0.3em] opacity-75 mt-0.5 text-center">DETECTED · LOCKED</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status overlays */}
      <div className="absolute top-3 left-3 font-mono text-[10px] text-[#3b82f6]/80 leading-tight">
        <div className="flex items-center gap-1.5 mx-[200px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
          <span className="font-bold tracking-widest mx-[400px]">RADAR · ACTIVE</span>
        </div>
        <div className="opacity-60 mt-1">SCAN 360° · 4s</div>
      </div>
      <div className="absolute top-3 right-3 font-mono text-[10px] text-[#3b82f6]/80 leading-tight text-right mx-[100px]">
        <div className="font-bold tracking-widest mx-0 my-0">TGT: {sats.length}</div>
        <div className="opacity-60 mt-1">SIG: STRONG</div>
      </div>
    </div>
  );
}

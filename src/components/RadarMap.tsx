import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  size?: number;
}

interface Sat {
  id: string;
  angle: number;
  radiusFactor: number;
}

const G = "#00ff88";      // gamma green
const GA = "rgba(0,255,136,";  // green alpha prefix
const DIM = "rgba(0,255,136,0.15)";

export function RadarMap({ size = 560 }: Props) {
  const center = size / 2;
  const r = size / 2 - 10;

  const sats: Sat[] = [
    { id: "GEXSATELIT-01", angle: 175, radiusFactor: 0.7 },
    { id: "GEXSATELIT-02", angle: 5,   radiusFactor: 0.65 },
  ];

  const SWEEP = 4;
  const [hits, setHits] = useState<Record<string, boolean>>({});
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
          window.setTimeout(() => setHits((h) => ({ ...h, [sat.id]: false })), 1400);
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
      {/* Green ambient glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${GA}0.10) 0%, ${GA}0.03) 40%, transparent 70%)`,
          filter: "blur(20px)",
        }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative mx-[200px]">
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#041a0e" stopOpacity="0.97" />
            <stop offset="60%"  stopColor="#010d06" stopOpacity="0.93" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.88" />
          </radialGradient>
          <linearGradient id="sweepGrad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%"   stopColor={G} stopOpacity="0" />
            <stop offset="60%"  stopColor={G} stopOpacity="0.12" />
            <stop offset="100%" stopColor={G} stopOpacity="0.75" />
          </linearGradient>
          <filter id="blipGlow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring */}
        <circle cx={center} cy={center} r={r}
          fill="url(#radarBg)" stroke={G} strokeOpacity="0.45" strokeWidth={1.5} />

        {/* Concentric rings */}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <circle key={i} cx={center} cy={center} r={r * f}
            fill="none" stroke={G} strokeOpacity={0.15} strokeWidth={1} />
        ))}

        {/* Cross-hairs */}
        <line x1={center - r} y1={center} x2={center + r} y2={center} stroke={G} strokeOpacity={0.15} strokeWidth={1} />
        <line x1={center} y1={center - r} x2={center} y2={center + r} stroke={G} strokeOpacity={0.15} strokeWidth={1} />
        <line x1={center - r*0.707} y1={center - r*0.707} x2={center + r*0.707} y2={center + r*0.707} stroke={G} strokeOpacity={0.07} strokeWidth={1} />
        <line x1={center - r*0.707} y1={center + r*0.707} x2={center + r*0.707} y2={center - r*0.707} stroke={G} strokeOpacity={0.07} strokeWidth={1} />

        {/* Cardinal labels */}
        <g fill={G} fillOpacity="0.45" fontSize={11} fontFamily="monospace" fontWeight="bold">
          <text x={center}      y={14}         textAnchor="middle">N</text>
          <text x={size - 8}    y={center + 4} textAnchor="end">E</text>
          <text x={center}      y={size - 4}   textAnchor="middle">S</text>
          <text x={8}           y={center + 4} textAnchor="start">W</text>
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
          <line x1={center} y1={center} x2={center + r} y2={center}
            stroke={G} strokeWidth={2} strokeOpacity={0.85} />
        </motion.g>

        {/* Center dot */}
        <circle cx={center} cy={center} r={4} fill={G} />
        <circle cx={center} cy={center} r={8} fill="none" stroke={G} strokeOpacity={0.35} strokeWidth={1} />

        {/* Satellites */}
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
                    <motion.circle cx={sx} cy={sy} fill="none" stroke={G} strokeWidth={2}
                      initial={{ r: 12, opacity: 0.95 }} animate={{ r: 70, opacity: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 1.2, ease: "easeOut" }} />
                    <motion.circle cx={sx} cy={sy} fill="none" stroke={G} strokeWidth={1}
                      initial={{ r: 12, opacity: 0.7 }} animate={{ r: 100, opacity: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }} />
                  </>
                )}
              </AnimatePresence>

              {lit && (
                <motion.g
                  transform={`translate(${sx}, ${sy}) rotate(-15) scale(2.4)`}
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                >
                  {/* Solar panels */}
                  <rect x={-22} y={-4} width={12} height={8} fill={G} fillOpacity={0.9} stroke={G} strokeWidth={0.5} />
                  <line x1={-22} y1={0} x2={-10} y2={0} stroke="#041a0e" strokeWidth={0.5} />
                  <line x1={-16} y1={-4} x2={-16} y2={4} stroke="#041a0e" strokeWidth={0.5} />
                  <rect x={10} y={-4} width={12} height={8} fill={G} fillOpacity={0.9} stroke={G} strokeWidth={0.5} />
                  <line x1={10} y1={0} x2={22} y2={0} stroke="#041a0e" strokeWidth={0.5} />
                  <line x1={16} y1={-4} x2={16} y2={4} stroke="#041a0e" strokeWidth={0.5} />
                  {/* Arms */}
                  <line x1={-10} y1={0} x2={-5} y2={0} stroke={G} strokeWidth={1} />
                  <line x1={5}   y1={0} x2={10} y2={0} stroke={G} strokeWidth={1} />
                  {/* Body */}
                  <rect x={-5} y={-5} width={10} height={10} rx={1.5} fill={G} stroke="#041a0e" strokeWidth={0.8} />
                  {/* Antenna */}
                  <line x1={0} y1={-5} x2={0} y2={-11} stroke={G} strokeWidth={1} />
                  <circle cx={0} cy={-12} r={1.8} fill={G} />
                </motion.g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Detection banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div
              className="px-3 py-1.5 rounded-md font-mono font-black tracking-[0.25em]"
              style={{
                background: "rgba(1,10,6,0.90)",
                border: `1px solid ${G}`,
                boxShadow: `0 0 18px ${GA}0.5), inset 0 0 12px ${GA}0.12)`,
                fontSize: 11,
                color: G,
                textShadow: `0 0 8px ${GA}0.9)`,
              }}
            >
              ▸ GEXSATELIT
              <div className="text-[7px] tracking-[0.3em] opacity-75 mt-0.5 text-center">DETECTED · LOCKED</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status overlays */}
      <div className="absolute top-3 left-3 font-mono text-[10px] leading-tight" style={{ color: `${GA}0.75)` }}>
        <div className="flex items-center gap-1.5 mx-[200px]">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: G }} />
          <span className="font-bold tracking-widest mx-[400px]">RADAR · ACTIVE</span>
        </div>
        <div className="opacity-60 mt-1">SCAN 360° · 4s</div>
      </div>
      <div className="absolute top-3 right-3 font-mono text-[10px] leading-tight text-right mx-[100px]" style={{ color: `${GA}0.75)` }}>
        <div className="font-bold tracking-widest">TGT: {sats.length}</div>
        <div className="opacity-60 mt-1">SIG: STRONG</div>
      </div>
    </div>
  );
}

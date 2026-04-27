import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  size?: number;
}

/**
 * Big circular radar with sweeping arm.
 * Detects a "satellite" blip that pulses when the sweep passes over it.
 */
export function RadarMap({ size = 560 }: Props) {
  const center = size / 2;
  const r = size / 2 - 10;

  // Satellite position (fixed angle/radius). 0deg = +X axis, going clockwise.
  const satAngle = -55; // degrees
  const satRadius = r * 0.62;
  const satRad = (satAngle * Math.PI) / 180;
  const satX = center + Math.cos(satRad) * satRadius;
  const satY = center + Math.sin(satRad) * satRadius;

  // Sweep arm rotation (4 second period)
  const SWEEP = 4;
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    // Convert sat angle to "sweep clock" — sweep starts at -90° (top) and goes clockwise.
    // Time when sweep aligns with satellite within each cycle.
    let normalized = (satAngle + 90 + 360) % 360;
    const hitAt = (normalized / 360) * SWEEP * 1000; // ms
    let cancelled = false;

    const tick = () => {
      const now = performance.now();
      const phase = now % (SWEEP * 1000);
      const delay = (hitAt - phase + SWEEP * 1000) % (SWEEP * 1000);
      const id = setTimeout(() => {
        if (cancelled) return;
        setPulse(true);
        setTimeout(() => setPulse(false), 900);
        tick();
      }, delay);
      return () => clearTimeout(id);
    };
    tick();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(0,255,170,0.08) 0%, rgba(0,255,170,0.02) 40%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative">
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#001a14" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#000805" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
          </radialGradient>
          <linearGradient id="sweepGrad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#00ffaa" stopOpacity="0" />
            <stop offset="60%" stopColor="#00ffaa" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#00ffaa" stopOpacity="0.85" />
          </linearGradient>
          <filter id="blipGlow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Radar disc */}
        <circle cx={center} cy={center} r={r} fill="url(#radarBg)" stroke="#00ffaa" strokeOpacity="0.5" strokeWidth={1.5} />

        {/* Concentric rings */}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={r * f}
            fill="none"
            stroke="#00ffaa"
            strokeOpacity={0.18}
            strokeWidth={1}
          />
        ))}

        {/* Cross hairs */}
        <line x1={center - r} y1={center} x2={center + r} y2={center} stroke="#00ffaa" strokeOpacity={0.18} strokeWidth={1} />
        <line x1={center} y1={center - r} x2={center} y2={center + r} stroke="#00ffaa" strokeOpacity={0.18} strokeWidth={1} />

        {/* Diagonal grid */}
        <line x1={center - r * 0.707} y1={center - r * 0.707} x2={center + r * 0.707} y2={center + r * 0.707} stroke="#00ffaa" strokeOpacity={0.08} strokeWidth={1} />
        <line x1={center - r * 0.707} y1={center + r * 0.707} x2={center + r * 0.707} y2={center - r * 0.707} stroke="#00ffaa" strokeOpacity={0.08} strokeWidth={1} />

        {/* Compass labels */}
        <g fill="#00ffaa" fillOpacity="0.5" fontSize={11} fontFamily="monospace" fontWeight="bold">
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
          {/* Cone */}
          <path
            d={`M ${center} ${center} L ${center + r} ${center} A ${r} ${r} 0 0 0 ${center + r * Math.cos(-Math.PI / 3)} ${center + r * Math.sin(-Math.PI / 3)} Z`}
            fill="url(#sweepGrad)"
          />
          {/* Sweep line */}
          <line x1={center} y1={center} x2={center + r} y2={center} stroke="#00ffaa" strokeWidth={2} strokeOpacity={0.9} />
        </motion.g>

        {/* Center dot */}
        <circle cx={center} cy={center} r={4} fill="#00ffaa" />
        <circle cx={center} cy={center} r={8} fill="none" stroke="#00ffaa" strokeOpacity={0.4} strokeWidth={1} />

        {/* Detected satellite blip */}
        <g filter="url(#blipGlow)">
          {/* Pulsing rings on hit */}
          {pulse && (
            <>
              <motion.circle
                cx={satX}
                cy={satY}
                fill="none"
                stroke="#00ffaa"
                strokeWidth={2}
                initial={{ r: 8, opacity: 0.9 }}
                animate={{ r: 36, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
              <motion.circle
                cx={satX}
                cy={satY}
                fill="none"
                stroke="#00ffaa"
                strokeWidth={1}
                initial={{ r: 8, opacity: 0.7 }}
                animate={{ r: 60, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
              />
            </>
          )}

          {/* Satellite icon — visible faintly always, bright on detection */}
          <motion.g
            transform={`translate(${satX}, ${satY}) rotate(-20)`}
            animate={{ opacity: pulse ? 1 : 0.45 }}
            transition={{ duration: 0.3 }}
          >
            {/* Solar panel left */}
            <rect x={-22} y={-4} width={12} height={8} fill="#00ffaa" fillOpacity={0.85} stroke="#00ffaa" strokeWidth={0.5} />
            <line x1={-22} y1={0} x2={-10} y2={0} stroke="#001a14" strokeWidth={0.5} />
            <line x1={-16} y1={-4} x2={-16} y2={4} stroke="#001a14" strokeWidth={0.5} />
            {/* Solar panel right */}
            <rect x={10} y={-4} width={12} height={8} fill="#00ffaa" fillOpacity={0.85} stroke="#00ffaa" strokeWidth={0.5} />
            <line x1={10} y1={0} x2={22} y2={0} stroke="#001a14" strokeWidth={0.5} />
            <line x1={16} y1={-4} x2={16} y2={4} stroke="#001a14" strokeWidth={0.5} />
            {/* Connector arms */}
            <line x1={-10} y1={0} x2={-5} y2={0} stroke="#00ffaa" strokeWidth={1} />
            <line x1={5} y1={0} x2={10} y2={0} stroke="#00ffaa" strokeWidth={1} />
            {/* Body */}
            <rect x={-5} y={-5} width={10} height={10} rx={1.5} fill="#00ffaa" stroke="#003322" strokeWidth={0.8} />
            {/* Antenna / dish */}
            <line x1={0} y1={-5} x2={0} y2={-11} stroke="#00ffaa" strokeWidth={1} />
            <circle cx={0} cy={-12} r={1.8} fill="#00ffaa" />
          </motion.g>
        </g>

        {/* Label for satellite — appears with the pulse, INSIDE the radar */}
        {pulse && (() => {
          // Place label towards the center so it stays inside the radar disc
          const dx = center - satX;
          const dy = center - satY;
          const len = Math.hypot(dx, dy) || 1;
          const lx = satX + (dx / len) * 30 - 60;
          const ly = satY + (dy / len) * 30 + 14;
          return (
            <motion.g
              transform={`translate(${lx}, ${ly})`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <line x1={60} y1={-6} x2={satX - lx} y2={satY - ly} stroke="#00ffaa" strokeWidth={1} strokeOpacity={0.7} />
              <rect x={0} y={-8} width={120} height={36} rx={2} fill="#000" fillOpacity={0.88} stroke="#00ffaa" strokeWidth={1.2} />
              <path d="M 0 -4 L 0 -8 L 4 -8" fill="none" stroke="#00ffaa" strokeWidth={1.5} />
              <path d="M 116 -8 L 120 -8 L 120 -4" fill="none" stroke="#00ffaa" strokeWidth={1.5} />
              <path d="M 0 24 L 0 28 L 4 28" fill="none" stroke="#00ffaa" strokeWidth={1.5} />
              <path d="M 116 28 L 120 28 L 120 24" fill="none" stroke="#00ffaa" strokeWidth={1.5} />
              <text x={6} y={6} fontFamily="monospace" fontSize={11} fill="#00ffaa" fontWeight="bold" letterSpacing={1.2}>
                GEXSATELIT
              </text>
              <text x={6} y={20} fontFamily="monospace" fontSize={8} fill="#00ffaa" fillOpacity={0.75} letterSpacing={0.8}>
                ◉ LOCKED · 0.42 AU
              </text>
            </motion.g>
          );
        })()}

        {/* Range text */}
        <text x={center + 6} y={center - 4} fontFamily="monospace" fontSize={8} fill="#00ffaa" fillOpacity={0.5}>0</text>
      </svg>

      {/* Status overlay */}
      <div className="absolute top-3 left-3 font-mono text-[10px] text-[#00ffaa]/80 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ffaa] animate-pulse" />
          <span className="font-bold tracking-widest">RADAR · ACTIVE</span>
        </div>
        <div className="opacity-60 mt-1">SCAN 360° · 4s</div>
      </div>
      <div className="absolute top-3 right-3 font-mono text-[10px] text-[#00ffaa]/80 leading-tight text-right">
        <div className="font-bold tracking-widest">TGT: 1</div>
        <div className="opacity-60 mt-1">SIG: STRONG</div>
      </div>
    </div>
  );
}

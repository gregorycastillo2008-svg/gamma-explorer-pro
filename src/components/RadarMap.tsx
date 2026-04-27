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
          {/* Persistent faint dot */}
          <circle cx={satX} cy={satY} r={4} fill="#00ffaa" fillOpacity={0.4} />
          {/* Pulsing ring on hit */}
          {pulse && (
            <>
              <motion.circle
                cx={satX}
                cy={satY}
                r={4}
                fill="#00ffaa"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0.4 }}
                transition={{ duration: 0.9 }}
              />
              <motion.circle
                cx={satX}
                cy={satY}
                fill="none"
                stroke="#00ffaa"
                strokeWidth={2}
                initial={{ r: 5, opacity: 0.9 }}
                animate={{ r: 30, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
              <motion.circle
                cx={satX}
                cy={satY}
                fill="none"
                stroke="#00ffaa"
                strokeWidth={1}
                initial={{ r: 5, opacity: 0.7 }}
                animate={{ r: 50, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
              />
            </>
          )}
        </g>

        {/* Label for satellite */}
        <g transform={`translate(${satX + 14}, ${satY - 14})`}>
          <rect x={0} y={-12} width={88} height={28} rx={3} fill="#000" fillOpacity={0.7} stroke="#00ffaa" strokeOpacity={0.6} strokeWidth={1} />
          <text x={6} y={0} fontFamily="monospace" fontSize={9} fill="#00ffaa" fontWeight="bold">SAT-001</text>
          <text x={6} y={11} fontFamily="monospace" fontSize={8} fill="#00ffaa" fillOpacity={0.7}>GEX · LOCKED</text>
        </g>

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

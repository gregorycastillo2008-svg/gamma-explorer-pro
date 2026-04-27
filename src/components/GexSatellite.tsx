import satelliteImg from "@/assets/gex-satellite.png";

interface Props {
  size?: number;
  speed?: number; // seconds per full rotation
}

/**
 * GexSatellite — Spins 360° on its own axis (no orbit).
 * Pure CSS rotation, GPU-accelerated, with subtle floating bob and glow halo.
 */
export function GexSatellite({ size = 220, speed = 12 }: Props) {
  return (
    <div
      className="relative inline-flex items-center justify-center select-none pointer-events-none"
      style={{ width: size, height: size }}
    >
      {/* Halo glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,0,0,0.45) 0%, rgba(200,0,0,0.22) 35%, transparent 70%)",
          filter: "blur(10px)",
          animation: "gexsat-pulse 3s ease-in-out infinite",
        }}
      />

      {/* Subtle floating bob wrapper (no orbit) */}
      <div style={{ animation: "gexsat-bob 6s ease-in-out infinite" }}>
        {/* Spinning satellite */}
        <img
          src={satelliteImg}
          alt="GEXSATELIT satellite"
          width={size}
          height={size}
          loading="lazy"
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            animation: `gexsat-spin ${speed}s linear infinite`,
            filter: "drop-shadow(0 8px 24px rgba(255,0,0,0.55))",
          }}
        />
      </div>

      {/* Label */}
      <div
        className="absolute left-1/2 -translate-x-1/2 font-black tracking-[0.4em]"
        style={{
          bottom: -18,
          fontSize: Math.max(10, size * 0.055),
          background: "linear-gradient(90deg, #b8860b, #ffd700, #fff5cc, #ffd700, #b8860b)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          textShadow: "0 0 18px rgba(255,200,0,0.4)",
        }}
      >
        GEXSATELIT
      </div>

      <style>{`
        @keyframes gexsat-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes gexsat-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        @keyframes gexsat-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

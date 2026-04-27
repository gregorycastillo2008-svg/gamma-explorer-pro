import { motion } from "framer-motion";

interface AllGammaLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function AllGammaLogo({ size = "md", showText = true }: AllGammaLogoProps) {
  const dims = size === "lg" ? { box: 56, gamma: 32, text: "text-3xl" } : size === "sm" ? { box: 32, gamma: 18, text: "text-base" } : { box: 42, gamma: 24, text: "text-2xl" };

  return (
    <div className="flex items-center gap-3 select-none">
      {/* Animated gold box with gamma symbol */}
      <div
        className="relative rounded-xl flex items-center justify-center overflow-hidden"
        style={{
          width: dims.box,
          height: dims.box,
          background: "linear-gradient(135deg, #1a1205 0%, #3d2a08 50%, #1a1205 100%)",
          border: "2px solid #d4af37",
          boxShadow: "0 0 20px rgba(212,175,55,0.6), inset 0 0 12px rgba(212,175,55,0.25)",
        }}
      >
        {/* Sweeping shine */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(115deg, transparent 35%, rgba(255,215,0,0.55) 50%, transparent 65%)",
          }}
          animate={{ x: ["-120%", "120%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}
        />
        {/* Pulsing glow ring */}
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{ boxShadow: ["inset 0 0 8px rgba(255,215,0,0.3)", "inset 0 0 22px rgba(255,215,0,0.7)", "inset 0 0 8px rgba(255,215,0,0.3)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Satellite icon */}
        <motion.span
          className="relative leading-none"
          style={{
            fontSize: dims.gamma,
            filter: "drop-shadow(0 0 6px rgba(255,215,0,0.9))",
            transform: "translateY(-1px)",
          }}
          animate={{ rotate: [0, -10, 10, -5, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        >
          🛰️
        </motion.span>
      </div>

      {showText && (
        <div className="relative">
          <motion.span
            className={`${dims.text} font-black tracking-tight bg-clip-text text-transparent inline-block`}
            style={{
              backgroundImage: "linear-gradient(90deg, #b8860b 0%, #ffd700 25%, #fff5cc 50%, #ffd700 75%, #b8860b 100%)",
              backgroundSize: "200% 100%",
              filter: "drop-shadow(0 0 10px rgba(255,215,0,0.45))",
            }}
            animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
          >
            GEXSATELIT
          </motion.span>
          {/* Sparkle dots */}
          <motion.span
            className="absolute -top-1 -right-2 text-yellow-300"
            style={{ fontSize: 10, filter: "drop-shadow(0 0 4px #ffd700)" }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.3, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >✦</motion.span>
          <motion.span
            className="absolute -bottom-1 left-1 text-yellow-300"
            style={{ fontSize: 8, filter: "drop-shadow(0 0 3px #ffd700)" }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
          >✦</motion.span>
        </div>
      )}
    </div>
  );
}

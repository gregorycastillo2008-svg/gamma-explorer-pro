import { motion } from "framer-motion";

interface AllGammaLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function AllGammaLogo({ size = "md", showText = true }: AllGammaLogoProps) {
  const dims = size === "lg" ? { box: 56, gamma: 32, text: "text-3xl" } : size === "sm" ? { box: 32, gamma: 18, text: "text-base" } : { box: 42, gamma: 24, text: "text-2xl" };

  return (
    <div className="flex items-center gap-3 select-none">
      {showText && (
        <div className="relative">
          <motion.span
            className={`${dims.text} font-black tracking-tight bg-clip-text text-[#ff0000] inline-block font-serif text-5xl mx-0 my-0 px-0 py-0 mr-[100px]`}
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

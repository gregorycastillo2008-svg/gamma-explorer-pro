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
            className={`${dims.text} font-black tracking-tight bg-clip-text inline-block font-serif text-5xl mx-0 my-0 px-0 py-0 mr-[100px] text-white`}
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
        </div>
      )}
    </div>
  );
}

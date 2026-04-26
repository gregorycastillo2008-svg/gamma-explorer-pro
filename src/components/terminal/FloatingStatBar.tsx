import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export interface FloatingStat {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "call" | "put" | "warning" | "primary";
  icon?: ReactNode;
}

const toneMap = {
  default: { text: "text-foreground", glow: "hsl(var(--primary) / 0.25)", dot: "bg-foreground/60" },
  call:    { text: "text-call",       glow: "hsl(var(--call) / 0.45)",    dot: "bg-call" },
  put:     { text: "text-put",        glow: "hsl(var(--put) / 0.45)",     dot: "bg-put" },
  warning: { text: "text-warning",    glow: "hsl(var(--warning) / 0.45)", dot: "bg-warning" },
  primary: { text: "text-primary",    glow: "hsl(var(--primary) / 0.45)", dot: "bg-primary" },
} as const;

export function FloatingStatBar({ stats }: { stats: FloatingStat[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* ambient backdrop glow */}
      <div className="pointer-events-none absolute inset-x-6 -top-2 h-12 rounded-full bg-gradient-to-r from-primary/0 via-primary/15 to-primary/0 blur-2xl" />

      <div className="relative flex items-stretch gap-2 overflow-x-auto scrollbar-thin py-1 px-0.5">
        {stats.map((s, i) => {
          const tone = toneMap[s.tone ?? "default"];
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 14, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: 0.06 * i,
                type: "spring",
                stiffness: 260,
                damping: 22,
              }}
              whileHover={{ y: -3, scale: 1.04 }}
              className="group relative shrink-0"
            >
              {/* hover glow */}
              <div
                className="pointer-events-none absolute -inset-px rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md"
                style={{ background: tone.glow }}
              />

              {/* card */}
              <div className="relative min-w-[112px] rounded-lg border border-border/70 bg-card/70 backdrop-blur-md px-3 py-2 overflow-hidden">
                {/* sweeping shine */}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent skew-x-12"
                  initial={{ x: 0 }}
                  animate={{ x: ["-50%", "250%"] }}
                  transition={{ duration: 3.6, delay: 0.6 + i * 0.15, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
                />

                <div className="flex items-center gap-1.5">
                  <motion.span
                    className={cn("h-1.5 w-1.5 rounded-full", tone.dot)}
                    animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                  />
                  <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                    {s.label}
                  </span>
                </div>

                <div className={cn("font-mono font-bold text-[15px] leading-tight mt-0.5 tabular-nums", tone.text)}>
                  {s.value}
                </div>

                {s.sub && (
                  <div className="text-[9px] text-muted-foreground/80 mt-0.5 truncate">
                    {s.sub}
                  </div>
                )}

                {/* bottom accent line */}
                <motion.div
                  className={cn("absolute bottom-0 left-0 h-px", tone.dot)}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 0.2 + i * 0.06, duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

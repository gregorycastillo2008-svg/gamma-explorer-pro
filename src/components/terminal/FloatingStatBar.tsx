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
      <div className="pointer-events-none absolute inset-x-6 -top-3 h-20 rounded-full bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 blur-3xl" />

      <div className="relative flex items-stretch gap-3 md:gap-4 overflow-x-auto scrollbar-thin py-2 px-1">
        {stats.map((s, i) => {
          const tone = toneMap[s.tone ?? "default"];
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: 0.07 * i,
                type: "spring",
                stiffness: 240,
                damping: 22,
              }}
              whileHover={{ y: -4, scale: 1.05 }}
              className="group relative shrink-0 flex-1 min-w-[140px] max-w-[200px]"
            >
              {/* hover glow */}
              <div
                className="pointer-events-none absolute -inset-0.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg"
                style={{ background: tone.glow }}
              />

              {/* card */}
              <div className="relative h-full rounded-xl border border-border/80 bg-card/80 backdrop-blur-md px-4 py-3 overflow-hidden shadow-md">
                {/* sweeping shine */}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent skew-x-12"
                  initial={{ x: 0 }}
                  animate={{ x: ["-50%", "300%"] }}
                  transition={{ duration: 3.6, delay: 0.6 + i * 0.15, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
                />

                <div className="flex items-center gap-2">
                  <motion.span
                    className={cn("h-2 w-2 rounded-full shadow-sm", tone.dot)}
                    animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.2, 0.85] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                  />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
                    {s.label}
                  </span>
                </div>

                <div className={cn("font-mono font-bold text-xl md:text-2xl leading-none mt-2 tabular-nums", tone.text)}>
                  {s.value}
                </div>

                {s.sub && (
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mt-1.5 font-medium truncate">
                    {s.sub}
                  </div>
                )}

                {/* bottom accent line */}
                <motion.div
                  className={cn("absolute bottom-0 left-0 h-[2px]", tone.dot)}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 0.2 + i * 0.07, duration: 0.7, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

import { useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface TerminalTab {
  key: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: TerminalTab[];
  defaultKey?: string;
  /** unique layoutId so multiple switchers don't share the animated background */
  layoutId?: string;
  /** optional className for the outer wrapper */
  className?: string;
}

/**
 * Terminal-style tab switcher with neon active state and animated underline.
 * Same look & feel as the original GEX HEATMAP / STRIKE CHART / 3D SURFACE selector.
 */
export function TerminalTabs({ tabs, defaultKey, layoutId = "terminal-tab-bg", className = "" }: Props) {
  const [active, setActive] = useState<string>(defaultKey ?? tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className={className}>
      <div className="flex justify-end mb-2">
        <div className="flex gap-0.5 bg-black/60 border border-border rounded p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`relative px-3 py-1 text-[10px] font-jetbrains uppercase tracking-[0.18em] rounded transition-colors ${
                active === t.key ? "text-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active === t.key && (
                <motion.div
                  layoutId={layoutId}
                  className="absolute inset-0 rounded"
                  style={{ background: "#00ff88" }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current?.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {current?.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

import { useState, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface TerminalTab {
  key: string;
  label: ReactNode;
  content: ReactNode;
}

interface Props {
  tabs: TerminalTab[];
  defaultKey?: string;
  /** Controlled mode — pass activeKey + onTabChange together */
  activeKey?: string;
  onTabChange?: (key: string) => void;
  /** unique layoutId so multiple switchers don't share the animated background */
  layoutId?: string;
  /** optional className for the outer wrapper */
  className?: string;
}

/**
 * Terminal-style tab switcher with neon active state and animated underline.
 * Supports both uncontrolled (defaultKey) and controlled (activeKey + onTabChange) modes.
 */
export function TerminalTabs({ tabs, defaultKey, activeKey, onTabChange, layoutId = "terminal-tab-bg", className = "" }: Props) {
  const [_active, _setActive] = useState<string>(activeKey ?? defaultKey ?? tabs[0]?.key);
  const controlled = activeKey !== undefined;
  const active = controlled ? activeKey : _active;
  const setActive = (key: string) => { if (!controlled) _setActive(key); onTabChange?.(key); };

  useEffect(() => { if (controlled) _setActive(activeKey); }, [activeKey, controlled]);

  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      <div className="flex justify-end mb-2 shrink-0">
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
          className="flex-1 min-h-0"
        >
          {current?.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

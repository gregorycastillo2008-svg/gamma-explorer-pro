import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatGreekValue } from "@/lib/greeks/greekClassification";

export type GreekType = "delta" | "gamma" | "vega" | "theta" | "vanna" | "charm";

const EXPL: Record<GreekType, {
  title: string; formula: string;
  interp: (v: number) => string;
}> = {
  delta: {
    title: "DELTA", formula: "Δ = ∂V/∂S",
    interp: (v) => `+$1 spot → ${v >= 0 ? "+" : ""}$${v.toFixed(2)}`,
  },
  gamma: {
    title: "GAMMA", formula: "Γ = ∂²V/∂S²",
    interp: (v) => `+$1 spot → ΔΔ ${v > 0 ? "+" : ""}${v.toFixed(4)}`,
  },
  vega: {
    title: "VEGA", formula: "ν = ∂V/∂σ",
    interp: (v) => `+1% IV → ${v >= 0 ? "+" : ""}$${v.toFixed(2)}`,
  },
  theta: {
    title: "THETA", formula: "Θ = ∂V/∂t",
    interp: (v) => `1 day → ${v >= 0 ? "+" : ""}$${v.toFixed(2)}`,
  },
  vanna: {
    title: "VANNA", formula: "∂Δ/∂σ",
    interp: (v) => `+1% IV → ΔΔ ${v > 0 ? "+" : ""}${v.toFixed(3)}`,
  },
  charm: {
    title: "CHARM", formula: "∂Δ/∂t",
    interp: (v) => `1 day → ΔΔ ${v > 0 ? "+" : ""}${v.toFixed(3)}`,
  },
};

export function GreekTooltip({ type, value, intensity }: { type: GreekType; value: number; intensity: string }) {
  const info = EXPL[type];
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  if (!pos) return null;

  // Position: above-right of cursor; flip if near edges
  const W = 180, H = 78;
  let left = pos.x + 14;
  let top = pos.y - H - 10;
  if (left + W > window.innerWidth - 8) left = pos.x - W - 14;
  if (top < 8) top = pos.y + 18;

  const node = (
    <div
      className="pointer-events-none"
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 9999,
        width: W,
        background: "rgba(0,0,0,0.96)",
        border: "1px solid #06b6d4",
        borderRadius: 6,
        padding: "6px 8px",
        boxShadow: "0 4px 16px rgba(6,182,212,0.35)",
        fontFamily: "monospace",
        fontSize: 10,
        color: "#e5e7eb",
        lineHeight: 1.35,
      }}
    >
      <div className="flex items-baseline justify-between" style={{ marginBottom: 3 }}>
        <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>{info.title}</span>
        <span style={{ color: "#6b7280", fontSize: 9 }}>{info.formula}</span>
      </div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 3 }}>
        <span style={{ color: value >= 0 ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 11 }}>
          {formatGreekValue(value, type)}
        </span>
        <span style={{ color: "#9ca3af", fontSize: 8, letterSpacing: 0.5 }}>{intensity}</span>
      </div>
      <div style={{ color: "#9ca3af", fontSize: 9 }}>{info.interp(value)}</div>
    </div>
  );

  return createPortal(node, document.body);
}

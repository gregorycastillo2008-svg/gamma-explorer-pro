export type Intensity = "VERY_LOW" | "LOW" | "MED" | "HIGH" | "MAX";

export interface IntensityConfig {
  label: string;
  color: string;
  gradient: string;
  textColor: string;
  shadow: string;
  fontWeight: string;
  border: string;
}

export const INTENSITY_CONFIGS: Record<Intensity, IntensityConfig> = {
  MAX: {
    label: "MAX",
    color: "#ff3366",
    gradient: "linear-gradient(135deg, #ff3366, #cc0033)",
    textColor: "#ffffff",
    shadow: "0 0 12px rgba(255, 51, 102, 0.4)",
    fontWeight: "bold",
    border: "1px solid rgba(255, 51, 102, 0.4)",
  },
  HIGH: {
    label: "HIGH",
    color: "#ff9500",
    gradient: "linear-gradient(135deg, #ff9500, #ff6b00)",
    textColor: "#ffffff",
    shadow: "0 0 8px rgba(255, 149, 0, 0.3)",
    fontWeight: "600",
    border: "1px solid rgba(255, 149, 0, 0.4)",
  },
  MED: {
    label: "MED",
    color: "#fbbf24",
    gradient: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    textColor: "#000000",
    shadow: "none",
    fontWeight: "500",
    border: "1px solid rgba(251, 191, 36, 0.4)",
  },
  LOW: {
    label: "LOW",
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #3b82f6, #2563eb)",
    textColor: "#ffffff",
    shadow: "none",
    fontWeight: "normal",
    border: "1px solid rgba(59, 130, 246, 0.4)",
  },
  VERY_LOW: {
    label: "V.LOW",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #10b981, #059669)",
    textColor: "#ffffff",
    shadow: "none",
    fontWeight: "normal",
    border: "1px solid rgba(16, 185, 129, 0.4)",
  },
};

export function classifyGreekIntensity(value: number, allValues: number[]): Intensity {
  const abs = Math.abs(value);
  const sorted = allValues.map(Math.abs).sort((a, b) => b - a);
  if (sorted.length === 0) return "MED";
  // rank: position of `abs` in descending list (0 = largest)
  const rank = sorted.findIndex((v) => v <= abs);
  const idx = rank < 0 ? sorted.length - 1 : rank;
  const pct = idx / Math.max(1, sorted.length - 1);
  if (pct <= 0.10) return "MAX";
  if (pct <= 0.30) return "HIGH";
  if (pct <= 0.70) return "MED";
  if (pct <= 0.90) return "LOW";
  return "VERY_LOW";
}

export function formatGreekValue(value: number, type: string): string {
  const sign = value >= 0 ? "+" : "";
  switch (type) {
    case "delta": return `${sign}${value.toFixed(2)}`;
    case "gamma": return value.toFixed(4);
    case "vega": return value.toFixed(2);
    case "theta": return `${sign}${value.toFixed(2)}`;
    case "vanna": return `${sign}${value.toFixed(3)}`;
    case "charm": return `${sign}${value.toFixed(3)}`;
    default: return `${sign}${value.toFixed(2)}`;
  }
}

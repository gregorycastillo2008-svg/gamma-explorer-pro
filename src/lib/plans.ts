import type { Section } from "@/components/terminal/Sidebar";

export type Tier = "basic" | "pro" | "elite";

export const PLANS = {
  basic: {
    name: "Basic",
    monthly: { priceId: "price_1TQreBCZRgBPwOB9AOgrMFJ5", amount: 29 },
    yearly:  { priceId: "price_1TQrefCZRgBPwOB99sCuvVv4", amount: 290 },
    features: ["Overview", "OI Analytics", "GEX & DEX", "Greek Ladder", "Level Scan"],
  },
  pro: {
    name: "Pro",
    monthly: { priceId: "price_1TQrfQCZRgBPwOB9Sti7Teao", amount: 79 },
    yearly:  { priceId: "price_1TQrfrCZRgBPwOB9CddMvqzz", amount: 790 },
    features: ["Everything in Basic", "Volatility 3D Surface", "Heatmap / 3D", "Hedge Pressure", "Vega & Theta", "Depth View", "AI Bias Forecast"],
  },
  elite: {
    name: "Elite",
    monthly: { priceId: "price_1TQrgfCZRgBPwOB9Xa1n2i6P", amount: 149 },
    yearly:  { priceId: "price_1TQrhICZRgBPwOB9YKQTn74Y", amount: 1490 },
    features: ["Everything in Pro", "Vanna & Charm", "Anomaly Detection", "Regime Analysis", "Risk Analytics", "Unlimited symbols"],
  },
} as const;

// Sections allowed per tier (cumulative)
const BASIC_SECTIONS: Section[] = ["overview", "oi-analytics", "gex-dex", "greeks", "levels"];
const PRO_SECTIONS: Section[] = [...BASIC_SECTIONS, "volatility", "heatmap", "hedge", "vega-theta", "depth", "ai-bias"];
const ELITE_SECTIONS: Section[] = [...PRO_SECTIONS, "vanna-charm", "anomaly", "regime", "risk"];

export function allowedSections(tier: Tier | null): Section[] {
  if (tier === "elite") return ELITE_SECTIONS;
  if (tier === "pro") return PRO_SECTIONS;
  if (tier === "basic") return BASIC_SECTIONS;
  return []; // no subscription = no access
}

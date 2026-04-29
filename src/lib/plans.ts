import type { Section } from "@/components/terminal/Sidebar";

export type Tier = "starter" | "pro" | "elite";

export const PLANS = {
  starter: {
    name: "Starter",
    price: 29.99,
    priceYearly: 251.92, // 29.99 * 12 * 0.7
    priceId: "price_1TRKWKCZRgBPwOB9awvuYUwA",
    priceIdYearly: "price_1TRKUmCZRgBPwOB9EKTEEmLz",
    icon: "rocket" as const,
    features: [
      "Gamma Exposure SPX · SPY · QQQ",
      "1 ticker en watchlist activa",
      "Snapshots intradía cada 15 min",
      "Acceso a Dealer Positioning Map",
      "Comunidad oficial en Discord",
      "Soporte por email · 24h",
    ],
    popular: false,
  },
  pro: {
    name: "Pro",
    price: 79.99,
    priceYearly: 671.92, // 79.99 * 12 * 0.7
    priceId: "price_1TRKXwCZRgBPwOB97g6uSUfB",
    priceIdYearly: "price_1TRKVBCZRgBPwOB995UiKA0S",
    icon: "crown" as const,
    features: [
      "GEX/DEX/VEX en tiempo real",
      "Watchlist ilimitada",
      "Call/Put walls + Gamma Flip",
      "AI Bias diario",
      "Alertas push",
      "Soporte prioritario",
    ],
    popular: true,
  },
  elite: {
    name: "Elite",
    price: 159.99,
    priceYearly: 1343.92, // 159.99 * 12 * 0.7
    priceId: "price_1TRKYNCZRgBPwOB9RKZeO5Zb",
    priceIdYearly: "price_1TRKVnCZRgBPwOB93yFgA2kX",
    icon: "gem" as const,
    features: [
      "Todo lo de Pro",
      "IV Surface 3D completo",
      "API access (10k req/día)",
      "Vanna & Charm exposure",
      "Reportes institucionales",
      "Onboarding 1-a-1",
      "Discord VIP traders",
    ],
    popular: false,
  },
} as const;

// Sections allowed per tier (cumulative)
const STARTER_SECTIONS: Section[] = ["overview", "chart", "oi-analytics", "gex-dex", "greeks", "levels", "economy"];
const PRO_SECTIONS: Section[] = [...STARTER_SECTIONS, "volatility", "heatmap", "hedge", "vega-theta", "depth", "ai-bias"];
const ELITE_SECTIONS: Section[] = [...PRO_SECTIONS, "vanna-charm", "anomaly", "regime", "risk"];

export function allowedSections(tier: Tier | null): Section[] {
  if (tier === "elite") return ELITE_SECTIONS;
  if (tier === "pro") return PRO_SECTIONS;
  if (tier === "starter") return STARTER_SECTIONS;
  return [];
}

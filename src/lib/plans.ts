import type { Section } from "@/components/terminal/Sidebar";

export type Tier = "starter" | "pro" | "elite";

export const PLANS = {
  starter: {
    name: "Starter",
    price: 29.99,
    priceId: "price_1TQrwlCZRgBPwOB9FoDolYiq",
    icon: "rocket" as const,
    features: [
      "GEX básico SPX/SPY",
      "1 ticker en watchlist",
      "Datos con 15min delay",
      "Soporte por email",
    ],
    popular: false,
  },
  pro: {
    name: "Pro",
    price: 79.99,
    priceId: "price_1TQrxOCZRgBPwOB9UbadcwFU",
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
    priceId: "price_1TQry2CZRgBPwOB9bKH38XuV",
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
const STARTER_SECTIONS: Section[] = ["overview", "chart", "oi-analytics", "gex-dex", "greeks", "levels"];
const PRO_SECTIONS: Section[] = [...STARTER_SECTIONS, "volatility", "heatmap", "hedge", "vega-theta", "depth", "ai-bias"];
const ELITE_SECTIONS: Section[] = [...PRO_SECTIONS, "vanna-charm", "anomaly", "regime", "risk"];

export function allowedSections(tier: Tier | null): Section[] {
  if (tier === "elite") return ELITE_SECTIONS;
  if (tier === "pro") return PRO_SECTIONS;
  if (tier === "starter") return STARTER_SECTIONS;
  return [];
}

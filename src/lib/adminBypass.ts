// Admin bypass — local-only access flag for the dashboard.
// Triggered by entering the master password from the Plans / Paywall screen.
// NOTE: this is a soft client-side gate (intentional, requested by the owner).
// Real authorization for sensitive data still relies on RLS + roles.

const KEY = "gexsatelit_admin_bypass";
const NAME_KEY = "gexsatelit_admin_name";
export const ADMIN_PASSWORD = "gexsatelit2008";

export function tryAdminLogin(name: string, password: string): boolean {
  if (password.trim() !== ADMIN_PASSWORD) return false;
  try {
    localStorage.setItem(KEY, "1");
    localStorage.setItem(NAME_KEY, name.trim() || "admin");
  } catch {
    /* ignore storage errors */
  }
  return true;
}

export function isAdminBypass(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function adminBypassName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function clearAdminBypass() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}

// Discount table — applied visually in the pricing cards.
// Maps plan tier to a percentage discount taken from the floating discount bar.
export const PLAN_DISCOUNTS: Record<string, number> = {
  starter: 15, // FLIP15
  pro: 30,     // GAMMA30
  elite: 50,   // ELITE50
};

export function applyDiscount(price: number, tier: string): number {
  const pct = PLAN_DISCOUNTS[tier] ?? 0;
  if (!pct) return price;
  return +(price * (1 - pct / 100)).toFixed(2);
}

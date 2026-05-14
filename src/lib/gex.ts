// Black-Scholes greeks + Gamma Exposure utilities
// All formulas are standard BS for European options on non-dividend paying underlying.

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function pdf(x: number) {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}
function cdf(x: number) {
  // Abramowitz & Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export interface OptionContract {
  strike: number;
  expiry: number; // days to expiry
  type: "call" | "put";
  iv: number; // implied vol (decimal)
  oi: number; // open interest
  volume?: number; // intraday traded contracts
  // Real greeks from CBOE/Polygon (used when available, overrides BS recalc)
  gamma?: number;
  delta?: number;
  vega?: number;
  theta?: number;
  bid?: number;
  ask?: number;
  last?: number;
}

export interface Greeks {
  delta: number;   // ∂V/∂S            (per $1 in S)
  gamma: number;   // ∂²V/∂S²          (per $1 in S, per $1 again)
  vega: number;    // ∂V/∂σ            (per 1 vol point = 1%)
  theta: number;   // ∂V/∂t            (per calendar day)
  vanna: number;   // ∂²V/∂S∂σ = ∂Δ/∂σ (per 1 vol point = 1%)
  charm: number;   // -∂Δ/∂t           (per calendar day)
}

/**
 * Standard Black-Scholes greeks for European options on a non-dividend-paying underlying.
 *
 * Convention used across this app (matches CBOE / Polygon greeks feed):
 *   • vega   → P&L change per **1 vol point** (1% absolute IV move)        → divide raw by 100
 *   • theta  → P&L change per **calendar day**                              → divide raw by 365
 *   • vanna  → ΔΔ per **1 vol point** (= 1%)                                → divide raw by 100
 *   • charm  → ΔΔ per **calendar day**                                      → divide raw by 365
 *
 * Vanna     = -e^(-rT) · φ(d1) · d2 / σ
 * Charm[c]  = -e^(-rT) · ( φ(d1)·(2(r)T - d2·σ√T) / (2T·σ√T)  -  r·N(d1) )
 * Charm[p]  = -e^(-rT) · ( φ(d1)·(2(r)T - d2·σ√T) / (2T·σ√T)  +  r·N(-d1) )
 */
export function bsGreeks(S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"): Greeks {
  if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, vega: 0, theta: 0, vanna: 0, charm: 0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = pdf(d1);            // φ(d1)
  const Nd1 = cdf(d1);
  const Nd2 = cdf(d2);

  const delta = type === "call" ? Nd1 : Nd1 - 1;
  const gamma = nd1 / (S * sigma * sqrtT);
  const vega  = (S * nd1 * sqrtT) / 100;                    // per 1% IV

  // Theta (per year) → per day
  const thetaYearCall = -(S * nd1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * Nd2;
  const thetaYearPut  = -(S * nd1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * cdf(-d2);
  const theta = (type === "call" ? thetaYearCall : thetaYearPut) / 365;

  // Vanna: per 1% IV (∂Δ/∂σ → divide by 100)
  const vannaRaw = -nd1 * d2 / sigma;                        // q = 0 ⇒ no e^(-qT)
  const vanna = vannaRaw / 100;

  // Charm (per year) — Haug formulas with q = 0
  const charmCommon = nd1 * (2 * r * T - d2 * sigma * sqrtT) / (2 * T * sigma * sqrtT);
  const charmYear = type === "call"
    ? -charmCommon
    : -charmCommon + r * Math.exp(-r * T) * cdf(-d1);
  const charm = charmYear / 365;                              // per calendar day

  return { delta, gamma, vega, theta, vanna, charm };
}

export interface ExposurePoint {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  dex: number;
  vex: number;
  vanna: number;
  charm: number;
  callOI: number;
  putOI: number;
}

const CONTRACT_SIZE = 100;

export function computeExposures(spot: number, contracts: OptionContract[], r = 0.05): ExposurePoint[] {
  const map = new Map<number, ExposurePoint>();
  for (const c of contracts) {
    const T = Math.max(c.expiry, 1) / 365;
    // Always compute BS for vanna/charm — CBOE/Polygon do not provide them.
    const bs = bsGreeks(spot, c.strike, T, r, c.iv, c.type);
    // Prefer real greeks from CBOE/Polygon for delta, gamma, vega, theta when non-zero.
    const hasRealGreeks = (c.gamma != null && c.gamma !== 0) || (c.delta != null && c.delta !== 0);
    const gamma = hasRealGreeks ? (c.gamma ?? 0) : bs.gamma;
    const delta = hasRealGreeks ? (c.delta ?? 0) : bs.delta;
    const vega  = (hasRealGreeks && c.vega)  ? c.vega  : bs.vega;
    const vanna = bs.vanna; // always BS — not provided by market data feeds
    const charm = bs.charm; // always BS — not provided by market data feeds

    const notional = c.oi * CONTRACT_SIZE;
    const point = map.get(c.strike) ?? {
      strike: c.strike, callGex: 0, putGex: 0, netGex: 0,
      dex: 0, vex: 0, vanna: 0, charm: 0, callOI: 0, putOI: 0,
    };
    // Dealer is short calls / long puts (standard convention)
    const sign = c.type === "call" ? 1 : -1;
    const gexContrib = gamma * notional * spot * spot * 0.01 * sign;
    if (c.type === "call") {
      point.callGex += gexContrib;
      point.callOI += c.oi;
    } else {
      point.putGex += gexContrib;
      point.putOI += c.oi;
    }
    point.netGex += gexContrib;
    // DEX (Delta Exposure) — standard industry convention:
    // Σ delta × OI × contract_size × spot. Put deltas are already negative,
    // so DO NOT flip their sign here (that would double-count direction).
    point.dex += delta * notional * spot;
    point.vex += vega * notional * sign;
    point.vanna += vanna * notional * sign;
    point.charm += charm * notional * sign;
    map.set(c.strike, point);
  }
  return Array.from(map.values()).sort((a, b) => a.strike - b.strike);
}

export interface KeyLevels {
  callWall: number;
  putWall: number;
  majorWall: number;
  maxPain: number;
  volTrigger: number;
  totalVt: number;
  gammaFlip: number | null;
  totalGex: number;
}

export function computeKeyLevels(points: ExposurePoint[]): KeyLevels {
  const totalGex = points.reduce((s, p) => s + p.netGex, 0);
  const safe = points.length ? points : [{ strike: 0, callGex: 0, putGex: 0, netGex: 0, dex: 0, vex: 0, vanna: 0, charm: 0, callOI: 0, putOI: 0 } as ExposurePoint];
  const callWall = safe.reduce((best, p) => (p.callGex > best.callGex ? p : best), safe[0]).strike;
  const putWall = safe.reduce((best, p) => (p.putGex < best.putGex ? p : best), safe[0]).strike;
  // Major Wall = strike with absolute peak |netGex| (dominant pin level)
  const majorWall = safe.reduce((best, p) => (Math.abs(p.netGex) > Math.abs(best.netGex) ? p : best), safe[0]).strike;
  // Max Pain = strike that minimizes total option holder payout
  const maxPain = safe.reduce((best, p) => {
    const payout = safe.reduce((s, q) => s + Math.max(0, p.strike - q.strike) * q.callOI + Math.max(0, q.strike - p.strike) * q.putOI, 0);
    return payout < best.payout ? { strike: p.strike, payout } : best;
  }, { strike: safe[0].strike, payout: Infinity }).strike;
  // Gamma flip = strike where cumulative net GEX crosses zero
  let cumulative = 0;
  let flip: number | null = null;
  const sorted = [...safe].sort((a, b) => a.strike - b.strike);
  for (let i = 0; i < sorted.length; i++) {
    const prev = cumulative;
    cumulative += sorted[i].netGex;
    if (i > 0 && Math.sign(prev) !== Math.sign(cumulative) && prev !== 0) {
      flip = sorted[i].strike;
      break;
    }
  }
  // Vol Trigger = gamma flip if exists, else strike with min |netGex| (zero-gamma proxy)
  const volTrigger = flip ?? safe.reduce((best, p) => (Math.abs(p.netGex) < Math.abs(best.netGex) ? p : best), safe[0]).strike;
  // Total Volatility Trigger = vega-weighted equilibrium strike
  const totalVex = safe.reduce((s, p) => s + Math.abs(p.vex), 0);
  const totalVt = totalVex > 0
    ? Math.round(safe.reduce((s, p) => s + p.strike * Math.abs(p.vex), 0) / totalVex)
    : volTrigger;
  return { callWall, putWall, majorWall, maxPain, volTrigger, totalVt, gammaFlip: flip, totalGex };
}

// ---------- Demo data generator ----------
export interface DemoTicker {
  symbol: string;
  name: string;
  spot: number;
  baseIV: number;
  strikeStep: number;
  expiries: number[]; // days
}

const STD_EXPIRIES = [1, 2, 3, 7, 14, 21, 26, 30, 60];

export const DEMO_TICKERS: DemoTicker[] = [
  { symbol: "SPX", name: "S&P 500 Index", spot: 5230, baseIV: 0.14, strikeStep: 25, expiries: STD_EXPIRIES },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", spot: 522, baseIV: 0.13, strikeStep: 2, expiries: STD_EXPIRIES },
  { symbol: "QQQ", name: "Invesco QQQ Trust", spot: 445, baseIV: 0.18, strikeStep: 2, expiries: STD_EXPIRIES },
  { symbol: "NQ", name: "Nasdaq 100 Futures", spot: 18250, baseIV: 0.18, strikeStep: 50, expiries: STD_EXPIRIES },
  { symbol: "NDX", name: "Nasdaq 100 Index", spot: 18250, baseIV: 0.18, strikeStep: 50, expiries: STD_EXPIRIES },
  { symbol: "AAPL", name: "Apple Inc.", spot: 195, baseIV: 0.25, strikeStep: 2.5, expiries: [7, 14, 21, 30, 60] },
  { symbol: "TSLA", name: "Tesla Inc.", spot: 248, baseIV: 0.55, strikeStep: 5, expiries: [7, 14, 21, 30, 60] },
  { symbol: "NVDA", name: "NVIDIA Corp.", spot: 880, baseIV: 0.45, strikeStep: 10, expiries: [7, 14, 21, 30, 60] },
];

// Max Pain = strike where total option value held by buyers is minimised (= dealers pay least)
export function computeMaxPain(exposures: ExposurePoint[]): number {
  let bestStrike = exposures[0]?.strike ?? 0;
  let bestPain = Infinity;
  for (const target of exposures) {
    let pain = 0;
    for (const p of exposures) {
      if (p.strike < target.strike) pain += p.callOI * (target.strike - p.strike);
      if (p.strike > target.strike) pain += p.putOI * (p.strike - target.strike);
    }
    if (pain < bestPain) { bestPain = pain; bestStrike = target.strike; }
  }
  return bestStrike;
}

// IV grid for heatmap / 3D surface
export interface IvCell { strike: number; expiry: number; iv: number; }
export function buildIvGrid(contracts: OptionContract[]): IvCell[] {
  const map = new Map<string, { sum: number; n: number; strike: number; expiry: number }>();
  for (const c of contracts) {
    const key = `${c.strike}|${c.expiry}`;
    const cell = map.get(key) ?? { sum: 0, n: 0, strike: c.strike, expiry: c.expiry };
    cell.sum += c.iv; cell.n++;
    map.set(key, cell);
  }
  return Array.from(map.values()).map((c) => ({ strike: c.strike, expiry: c.expiry, iv: c.sum / c.n }));
}

// Deterministic pseudo-random based on symbol for stable demo
function seedRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoChain(t: DemoTicker): OptionContract[] {
  const rand = seedRand(t.symbol);
  const contracts: OptionContract[] = [];
  const range = 0.12; // ±12% strikes
  const minK = Math.floor((t.spot * (1 - range)) / t.strikeStep) * t.strikeStep;
  const maxK = Math.ceil((t.spot * (1 + range)) / t.strikeStep) * t.strikeStep;

  for (const expiry of t.expiries) {
    for (let k = minK; k <= maxK; k += t.strikeStep) {
      const moneyness = (k - t.spot) / t.spot;
      // Real vol skew: negative slope (puts expensive) + parabolic wing premium
      // m < 0 → OTM put → higher IV; m > 0 → OTM call → lower IV
      const m = moneyness;
      const baseSmile = t.baseIV * (1 + (-1.4 * m) + (1.8 * m * m));
      const noise = 0.92 + rand() * 0.16;
      // Small put/call divergence at same strike (realistic market microstructure)
      const putPremium  = m < 0 ? 1 + (-0.04 * m) : 1;  // OTM puts: +0–5% extra
      const callDiscount = m > 0 ? 1 - ( 0.03 * m) : 1;  // OTM calls: 0–4% cheaper
      const ivBase = Math.max(0.04, baseSmile * noise);
      // OI distribution: peaks at round numbers and ATM
      const distFromATM = Math.abs(m);
      const baseOI = Math.exp(-distFromATM * 12) * 8000 + rand() * 1500;
      const roundBoost = k % (t.strikeStep * 4) === 0 ? 1.8 : 1;
      const expiryWeight = expiry <= 7 ? 1.4 : expiry <= 30 ? 1 : 0.6;

      // Calls heavier above spot, puts heavier below (typical hedging)
      const callBias = moneyness > 0 ? 1.3 : 0.7;
      const putBias = moneyness < 0 ? 1.4 : 0.6;

      contracts.push({
        strike: k,
        expiry,
        type: "call",
        iv: Math.max(0.04, ivBase * callDiscount),
        oi: Math.round(baseOI * roundBoost * expiryWeight * callBias),
      });
      contracts.push({
        strike: k,
        expiry,
        type: "put",
        iv: Math.max(0.04, ivBase * putPremium),
        oi: Math.round(baseOI * roundBoost * expiryWeight * putBias),
      });
    }
  }
  return contracts;
}

export function getDemoTicker(symbol: string): DemoTicker | undefined {
  return DEMO_TICKERS.find((t) => t.symbol === symbol.toUpperCase());
}

export function formatNumber(n: number, digits = 2): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(digits) + "K";
  return n.toFixed(digits);
}

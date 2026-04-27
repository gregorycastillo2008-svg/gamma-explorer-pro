// ─────────────────────────────────────────────────────────────────────────────
// Volatility math: IV surface model, skew, historical volatility, skew metrics.
// All functions are pure & deterministic (seeded) so charts stay stable.
// ─────────────────────────────────────────────────────────────────────────────

export interface IvPoint {
  expiry: number;     // DTE
  strike: number;
  moneyness: number;  // strike / spot
  iv: number;         // 0..1
}

export interface SkewPoint {
  strike: number;
  iv: number;          // 0..1
  delta: number;       // -1..+1 (call delta convention)
}

export interface HVRow {
  date: Date;
  price: number;
  hv10: number;
  hv20: number;
  hv30: number;
  iv: number;
}

// Deterministic PRNG (mulberry32)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smile + put skew + term effect
export function generateIVSurface(spot: number, expiries: number[], atmIV = 0.16): IvPoint[] {
  const out: IvPoint[] = [];
  const strikes: number[] = [];
  for (let m = 0.85; m <= 1.15 + 1e-6; m += 0.025) strikes.push(+(spot * m).toFixed(2));

  for (const dte of expiries) {
    const termEffect = 1 + 0.18 * Math.log(1 + dte / 30); // longer DTE → slightly higher IV
    for (const k of strikes) {
      const m = k / spot;
      const x = m - 1;
      // Parabolic smile + put-skew tilt (negative x → puts → higher IV)
      const smile = 0.55 * x * x;
      const skew = -0.45 * x;
      const iv = Math.max(0.05, atmIV * termEffect + smile + skew);
      out.push({ expiry: dte, strike: k, moneyness: +m.toFixed(4), iv: +iv.toFixed(4) });
    }
  }
  return out;
}

export function generateIVSkew(spot: number, dte = 30, atmIV = 0.16): SkewPoint[] {
  const out: SkewPoint[] = [];
  for (let m = 0.92; m <= 1.08 + 1e-6; m += 0.01) {
    const strike = +(spot * m).toFixed(2);
    const x = m - 1;
    const iv = Math.max(0.05, atmIV * (1 + 0.05 * Math.log(1 + dte / 30)) + 0.55 * x * x - 0.45 * x);
    // crude delta proxy (call delta) using normal CDF approx of d1
    const t = Math.max(1, dte) / 365;
    const sigmaT = iv * Math.sqrt(t);
    const d1 = (Math.log(spot / strike) + 0.5 * iv * iv * t) / Math.max(1e-6, sigmaT);
    const delta = 0.5 * (1 + erf(d1 / Math.SQRT2));
    out.push({ strike, iv: +iv.toFixed(4), delta: +delta.toFixed(3) });
  }
  return out;
}

// Standard error function (Abramowitz & Stegun 7.1.26)
function erf(x: number) {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function calculateHistoricalVolatility(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0;
  const slice = prices.slice(-period - 1);
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

export interface SkewMetrics {
  atmIV: number;        // %
  riskReversal: number; // 25Δ Put IV − 25Δ Call IV (pp)
  skewAngle: number;    // degrees
  pcRatio: number;      // synthetic put/call IV ratio (5% OTM)
}

export function calculateSkewMetrics(skew: SkewPoint[], spot: number): SkewMetrics {
  const atmPt = skew.reduce((best, p) => Math.abs(p.strike - spot) < Math.abs(best.strike - spot) ? p : best, skew[0]);
  const atmIV = atmPt.iv * 100;
  const put25 = skew.find((p) => p.delta <= 0.25 && p.delta >= 0.20) ?? skew[0];
  const call25 = skew.find((p) => p.delta >= 0.75 && p.delta <= 0.80) ?? skew[skew.length - 1];
  const riskReversal = +(put25.iv * 100 - call25.iv * 100).toFixed(2);
  const skewAngle = +(Math.atan(riskReversal / 10) * 180 / Math.PI).toFixed(1);
  const put5 = skew.reduce((best, p) => Math.abs(p.strike - spot * 0.95) < Math.abs(best.strike - spot * 0.95) ? p : best, skew[0]);
  const call5 = skew.reduce((best, p) => Math.abs(p.strike - spot * 1.05) < Math.abs(best.strike - spot * 1.05) ? p : best, skew[0]);
  const pcRatio = +(put5.iv / Math.max(1e-6, call5.iv)).toFixed(3);
  return { atmIV: +atmIV.toFixed(2), riskReversal, skewAngle, pcRatio };
}

export function generateHistoricalHVData(days = 180, basePrice = 660, baseIV = 0.16, seed = 42): HVRow[] {
  const rand = rng(seed);
  const prices: number[] = [];
  let p = basePrice;
  for (let i = 0; i < days + 30; i++) {
    const drift = 0.0002;
    const vol = 0.012;
    const z = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    p = p * Math.exp(drift + vol * z);
    prices.push(p);
  }
  const out: HVRow[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const offset = days + 30 - days + i;
    const slice = prices.slice(0, offset + 1);
    const date = new Date(today);
    date.setDate(today.getDate() - (days - i));
    const hv10 = calculateHistoricalVolatility(slice, 10) * 100;
    const hv20 = calculateHistoricalVolatility(slice, 20) * 100;
    const hv30 = calculateHistoricalVolatility(slice, 30) * 100;
    const iv = (baseIV * 100) * (1 + (rand() - 0.4) * 0.18);
    out.push({
      date,
      price: +slice[slice.length - 1].toFixed(2),
      hv10: +hv10.toFixed(2),
      hv20: +hv20.toFixed(2),
      hv30: +hv30.toFixed(2),
      iv: +iv.toFixed(2),
    });
  }
  return out;
}

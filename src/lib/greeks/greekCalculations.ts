// Black-Scholes Greeks (analytical). No external math deps.

export interface GreekInputs {
  spot: number;
  strike: number;
  dte: number;   // days to expiry
  iv: number;    // 0..1
  rate: number;  // 0..1
  isCall: boolean;
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number;   // per 1% IV
  theta: number;  // per day
  vanna: number;  // dDelta / dSigma (per 1% IV change)
  charm: number;  // dDelta / dt (per day)
  rho: number;    // per 1% rate
  vomma: number;
}

// Abramowitz & Stegun 7.1.26 approximation of erf
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
const n = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

function d1d2(S: number, K: number, T: number, r: number, sigma: number) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

export function calculateAllGreeks(inp: GreekInputs): Greeks {
  const { spot: S, strike: K, dte, iv: sigma, rate: r, isCall } = inp;
  const T = Math.max(dte, 0.5) / 365;
  const sig = Math.max(sigma, 0.01);
  const { d1, d2 } = d1d2(S, K, T, r, sig);

  const delta = isCall ? N(d1) : N(d1) - 1;
  const gamma = n(d1) / (S * sig * Math.sqrt(T));
  const vega = (S * n(d1) * Math.sqrt(T)) / 100;

  const term1 = -(S * n(d1) * sig) / (2 * Math.sqrt(T));
  const theta = isCall
    ? (term1 - r * K * Math.exp(-r * T) * N(d2)) / 365
    : (term1 + r * K * Math.exp(-r * T) * N(-d2)) / 365;

  const vanna = (-n(d1) * d2 / sig) / 100;

  const charmRaw = -n(d1) * (2 * r * T - d2 * sig * Math.sqrt(T)) / (2 * T * sig * Math.sqrt(T));
  const charm = (isCall ? charmRaw : charmRaw - r * Math.exp(-r * T) / (sig * Math.sqrt(T))) / 365;

  const rho = isCall
    ? (K * T * Math.exp(-r * T) * N(d2)) / 100
    : -(K * T * Math.exp(-r * T) * N(-d2)) / 100;

  const vomma = (S * n(d1) * Math.sqrt(T) * d1 * d2 / sig) / 100;

  return { delta, gamma, vega, theta, vanna, charm, rho, vomma };
}

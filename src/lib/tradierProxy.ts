/**
 * Tradier API Proxy Handler
 * Calls Tradier API with proper headers
 * Configure API_KEY in your .env file: VITE_TRADIER_API_KEY
 */

const API_KEY = import.meta.env.VITE_TRADIER_API_KEY || "sandbox_api_key";
const BASE_URL = "https://api.tradier.com/v1";
const SANDBOX_URL = "https://sandbox.tradier.com/v1";

// Use sandbox by default, switch to prod with real key
const API_URL = API_KEY === "sandbox_api_key" ? SANDBOX_URL : BASE_URL;

export interface QuoteResponse {
  quotes: {
    quote: Array<{
      symbol: string;
      last: number;
      change: number;
      change_percentage: number;
      bid: number;
      ask: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  };
}

export interface OptionChain {
  options: {
    option: Array<{
      symbol: string;
      strike: number;
      type: "call" | "put";
      expiration_date: string;
      bid: number;
      ask: number;
      last: number;
      volume: number;
      open_interest: number;
      implied_volatility: number;
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
      rho: number;
    }>;
  };
}

export interface Expiration {
  expirations: {
    expiration: string[];
  };
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
};

/**
 * Fetch quotes for multiple symbols
 */
export async function getQuotes(symbols: string[]): Promise<QuoteResponse> {
  const url = new URL(`${API_URL}/markets/quotes`);
  url.searchParams.append("symbols", symbols.join(","));

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) throw new Error(`Quote fetch failed: ${response.status}`);
  return response.json();
}

/**
 * Fetch options chain for symbol with Greeks
 */
export async function getOptionsChain(
  symbol: string,
  expiration: string
): Promise<OptionChain> {
  const url = new URL(`${API_URL}/markets/options/chains`);
  url.searchParams.append("symbol", symbol);
  url.searchParams.append("expiration", expiration);
  url.searchParams.append("greeks", "true");

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) throw new Error(`Options chain fetch failed: ${response.status}`);
  return response.json();
}

/**
 * Fetch available expirations for symbol
 */
export async function getExpirations(symbol: string): Promise<Expiration> {
  const url = new URL(`${API_URL}/markets/options/expirations`);
  url.searchParams.append("symbol", symbol);

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) throw new Error(`Expirations fetch failed: ${response.status}`);
  return response.json();
}

/**
 * Calculate Net GEX from options chain
 * GEX = OI × Gamma × Price² / 100
 */
export function calculateNetGEX(chain: OptionChain, spotPrice: number): number {
  const options = chain.options?.option || [];

  let callGEX = 0;
  let putGEX = 0;

  for (const opt of options) {
    const gex = (opt.open_interest || 0) * (opt.gamma || 0) * Math.pow(spotPrice, 2) / 100;

    if (opt.type === "call") {
      callGEX += gex;
    } else {
      putGEX += gex;
    }
  }

  return callGEX - putGEX; // Net GEX in millions (approx)
}

/**
 * Calculate ATM IV from options chain
 */
export function calculateATMIV(chain: OptionChain, spotPrice: number): number {
  const options = chain.options?.option || [];
  const atmOptions = options.filter(
    (opt) =>
      Math.abs(opt.strike - spotPrice) <= spotPrice * 0.02 &&
      opt.implied_volatility > 0
  );

  if (atmOptions.length === 0) return 20; // Fallback

  const averageIV =
    atmOptions.reduce((sum, opt) => sum + opt.implied_volatility, 0) /
    atmOptions.length;

  return averageIV;
}

/**
 * Expected Move Calculator
 * EM = Price × IV × sqrt(DTE/365)
 */
export function calculateExpectedMove(
  price: number,
  iv: number,
  daysToExpiry: number
): number {
  const ivDecimal = iv / 100;
  const em = price * ivDecimal * Math.sqrt(daysToExpiry / 365);
  return em;
}

/**
 * Generate mock IV surface for visualization
 * (Use for development before real data)
 */
export function generateMockIVSurface(baseSPX: number, baseIV: number) {
  const strikes = [];
  const dtes = [1, 7, 14, 30, 45, 60, 90];

  // Generate strikes: 85% to 115% of spot
  for (let i = 0.85; i <= 1.15; i += 0.025) {
    strikes.push(Math.round(baseSPX * i));
  }

  const ivSurface: number[][] = [];

  for (const dte of dtes) {
    const row: number[] = [];
    for (const strike of strikes) {
      const moneyness = Math.log(strike / baseSPX);
      const skew = -0.3 * moneyness; // Negative skew
      const termStructure = Math.max(0, 0.02 * Math.sqrt(30 / dte)); // Short-term premium
      const smile = 0.5 * Math.pow(moneyness, 2) * (1 + 2 * Math.abs(moneyness));

      const iv_value = Math.max(5, baseIV + skew + termStructure + smile);
      row.push(iv_value);
    }
    ivSurface.push(row);
  }

  return { strikes, dtes, ivSurface };
}

export { API_KEY, API_URL };

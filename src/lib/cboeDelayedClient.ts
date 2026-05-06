/**
 * CBOE Delayed Data Client
 * Fetches real options data from CBOE (15-min delayed, FREE)
 * No API key required
 */

export interface CboeOption {
  ticker: string;
  strike: number;
  expiration: string;
  side: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  iv: number;
  oi: number;
  volume: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho?: number;
}

export interface CboeData {
  symbol: string;
  spot: number;
  timestamp: string;
  source: "cboe";
  expirations: string[];
  selectedExpiration: string;
  hv30: number;
  ivRank: number;
  skew: number;
  contracts: CboeOption[];
}

const CBOE_API = "https://cdn.cboe.com/api/global/delayed_quotes/options";
const INDEX_SYMBOLS = new Set(["SPX", "NDX", "RUT", "VIX", "XSP", "DJX"]);
const cache = new Map<string, { ts: number; data: CboeData }>();
const TTL_MS = 60_000; // 60s cache

interface ParsedOCC {
  ymd: string;
  cp: "C" | "P";
  strike: number;
}

/**
 * Parse OCC code: SPYXY240119C00425000
 * Format: {Symbol}YY{MM}{DD}{CP}{8-digit strike}
 */
function parseOcc(occ: string): ParsedOCC | null {
  const m = occ.match(/(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    ymd: m[1],
    cp: m[2] as "C" | "P",
    strike: parseInt(m[3], 10) / 1000,
  };
}

function ymdToIso(ymd: string): string {
  const yy = parseInt(ymd.slice(0, 2), 10);
  const mm = ymd.slice(2, 4);
  const dd = ymd.slice(4, 6);
  return `${2000 + yy}-${mm}-${dd}`;
}

function ymdToDays(ymd: string, now: Date): number {
  const yy = parseInt(ymd.slice(0, 2), 10);
  const mm = parseInt(ymd.slice(2, 4), 10) - 1;
  const dd = parseInt(ymd.slice(4, 6), 10);
  const exp = new Date(Date.UTC(2000 + yy, mm, dd, 21, 0, 0));
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86_400_000));
}

/**
 * Fetch CBOE delayed options data (FREE, 15-min delayed)
 */
export async function fetchCboeDelayed(symbol: string): Promise<CboeData> {
  // Check cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return cached.data;
  }

  try {
    const cboeSymbol = INDEX_SYMBOLS.has(symbol) ? `_${symbol}` : symbol;
    const url = `${CBOE_API}/${cboeSymbol}.json`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`CBOE API error: ${response.status}`);
    }

    const json = await response.json();
    const d = json?.data;

    if (!d?.options) {
      throw new Error("No options data in response");
    }

    const spot = Number(d.current_price) || 0;
    const now = new Date();
    const expirations = new Set<string>();
    const contracts: CboeOption[] = [];

    // Parse options
    for (const opt of d.options) {
      const parsed = parseOcc(opt.option);
      if (!parsed) continue;

      const strike = parsed.strike;
      const expiration = ymdToIso(parsed.ymd);
      expirations.add(expiration);

      contracts.push({
        ticker: opt.option,
        strike,
        expiration,
        side: parsed.cp === "C" ? "call" : "put",
        bid: Number(opt.bid) || 0,
        ask: Number(opt.ask) || 0,
        last: Number(opt.last) || 0,
        iv: Number(opt.iv) / 100 || 0, // Convert to decimal
        oi: Number(opt.open_interest) || 0,
        volume: Number(opt.volume) || 0,
        delta: Number(opt.delta) || 0,
        gamma: Number(opt.gamma) || 0,
        theta: Number(opt.theta) || 0,
        vega: Number(opt.vega) || 0,
        rho: Number(opt.rho) || 0,
      });
    }

    const expirationList = Array.from(expirations).sort();
    const selectedExpiration = expirationList[0] || "";

    // Calculate IV Rank (simple version)
    const ivs = contracts.map((c) => c.iv).filter((iv) => iv > 0);
    const avgIV = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : 0;
    const ivRank = Math.min(100, Math.max(0, avgIV * 100)); // Simple approximation

    // Calculate skew
    const atm = spot;
    const putIVs = contracts
      .filter((c) => c.side === "put" && Math.abs(c.strike - atm) < atm * 0.1)
      .map((c) => c.iv);
    const callIVs = contracts
      .filter((c) => c.side === "call" && Math.abs(c.strike - atm) < atm * 0.1)
      .map((c) => c.iv);

    const putIVAvg = putIVs.length ? putIVs.reduce((a, b) => a + b, 0) / putIVs.length : 0;
    const callIVAvg = callIVs.length ? callIVs.reduce((a, b) => a + b, 0) / callIVs.length : 0;
    const skew = putIVAvg - callIVAvg;

    const result: CboeData = {
      symbol,
      spot,
      timestamp: now.toISOString(),
      source: "cboe",
      expirations: expirationList,
      selectedExpiration,
      hv30: 0, // Would need historical data
      ivRank,
      skew,
      contracts,
    };

    // Cache result
    cache.set(symbol, { ts: Date.now(), data: result });

    return result;
  } catch (error) {
    console.error("Error fetching CBOE data:", error);
    throw error;
  }
}

/**
 * Get contracts for a specific expiration and symbol
 */
export function getContractsForExpiration(data: CboeData, expiration: string): CboeOption[] {
  return data.contracts.filter((c) => c.expiration === expiration);
}

/**
 * Get IV surface data for 3D plotting
 */
export function getIVSurface(data: CboeData) {
  const surface: Array<{ strike: number; expiry: number; iv: number; moneyness: number }> = [];

  for (const contract of data.contracts) {
    const exp = new Date(contract.expiration);
    const now = new Date();
    const dte = Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86_400_000));

    surface.push({
      strike: contract.strike,
      expiry: dte,
      iv: contract.iv,
      moneyness: contract.strike / data.spot,
    });
  }

  return surface;
}

/**
 * Build skew metrics
 */
export function getSkewMetrics(data: CboeData, expiration?: string) {
  const contracts = expiration
    ? data.contracts.filter((c) => c.expiration === expiration)
    : data.contracts.filter((c) => c.expiration === data.selectedExpiration);

  const atm = data.spot;
  const puts = contracts.filter((c) => c.side === "put");
  const calls = contracts.filter((c) => c.side === "call");

  // 25-delta skew
  const put25 = puts.find((c) => Math.abs(Number(c.delta) + 0.25) < 0.05);
  const call25 = calls.find((c) => Math.abs(c.delta - 0.25) < 0.05);

  const riskReversal = (put25?.iv || 0) - (call25?.iv || 0);
  const butterfly = ((put25?.iv || 0) + (call25?.iv || 0)) / 2 - (atm || 0);

  return {
    riskReversal,
    butterfly,
    atmIv: calls.find((c) => Math.abs(c.strike - atm) < 1)?.iv || 0,
  };
}

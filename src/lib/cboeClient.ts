// CBOE Delayed Quotes — 15-minute delayed, free, no API key required.
// Endpoint: https://cdn.cboe.com/api/global/delayed_quotes/options/{SYMBOL}.json
// Index options use underscore prefix: _SPX, _NDX, _RUT, _VIX
// Equity/ETF options use plain ticker: SPY, QQQ, AAPL, TSLA

export interface CboeContract {
  strike: number;
  expiry: number;   // days to expiry
  type: "call" | "put";
  iv: number;       // decimal (0.14 = 14%)
  oi: number;
  volume: number;
  bid: number;
  ask: number;
  last: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface CboeChain {
  symbol: string;
  spot: number;
  iv30: number;
  priceChangePct: number;
  contracts: CboeContract[];
  fetchedAt: string;
  source: string;
  expiries: number[];
  strikes: number[];
}

// Indices served with underscore prefix by CBOE
const INDEX_SYMBOLS = new Set(["SPX", "NDX", "RUT", "VIX", "XSP", "MRUT", "DJX"]);

// Manual overrides: NQ futures → use NDX as proxy, SPXW → same file as SPX
const SYMBOL_ALIASES: Record<string, string> = {
  NQ: "NDX",
  SPXW: "SPX",
};

function toUrlSymbol(symbol: string): string {
  const up = SYMBOL_ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
  return INDEX_SYMBOLS.has(up) ? `_${up}` : up;
}

// Parse CBOE option symbol: {ROOT}{YYMMDD}{C|P}{8-digit-strike*1000}
// Examples: SPXW240115C04780000, AAPL240101C00150000
function parseOptionSymbol(sym: string): { expiry: number; type: "call" | "put"; strike: number } | null {
  const m = sym.match(/^[A-Z]+(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  const [, yy, mm, dd, cp, strikeStr] = m;
  const expDate = new Date(2000 + +yy, +mm - 1, +dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dte = Math.max(0, Math.round((expDate.getTime() - today.getTime()) / 86400000));
  return {
    expiry: dte,
    type: cp === "C" ? "call" : "put",
    strike: +strikeStr / 1000,
  };
}

function parseRawJson(json: any, requestedSymbol: string): CboeChain {
  const d = json?.data ?? json;
  const spot: number = d.current_price ?? d.spot ?? 0;
  const prevClose: number = d.prev_day_close ?? spot;
  const priceChangePct = prevClose ? ((spot - prevClose) / prevClose) * 100 : 0;
  const iv30: number = d.iv30 ?? 0;

  const contracts: CboeContract[] = [];
  for (const opt of d.options ?? []) {
    const parsed = parseOptionSymbol(opt.option ?? "");
    if (!parsed) continue;
    const { expiry, type, strike } = parsed;
    if (strike <= 0) continue;

    // CBOE iv can be decimal (0.1423) or percentage (14.23) — normalize to decimal
    const rawIv = +(opt.iv ?? 0);
    const iv = rawIv > 2 ? rawIv / 100 : rawIv;

    // Greeks: CBOE provides delta, gamma, vega, theta in standard form.
    // Vega from CBOE is per-share per 1% IV move (already divided by 100).
    // Theta from CBOE is per calendar day (already divided by 365).
    contracts.push({
      strike,
      expiry,
      type,
      iv,
      oi: opt.open_interest ?? 0,
      volume: opt.volume ?? 0,
      bid: opt.bid ?? 0,
      ask: opt.ask ?? 0,
      last: opt.last_sale_price ?? 0,
      delta: opt.delta ?? 0,
      gamma: opt.gamma ?? 0,
      vega: opt.vega ?? 0,
      theta: opt.theta ?? 0,
    });
  }

  const expiries = Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b);
  const strikes = Array.from(new Set(contracts.map((c) => c.strike))).sort((a, b) => a - b);

  const sym = requestedSymbol.toUpperCase().replace(/^SPXW$/, "SPX");
  return { symbol: sym, spot, iv30, priceChangePct, contracts, fetchedAt: new Date().toISOString(), source: "CBOE Delayed (15m)", expiries, strikes };
}

export async function fetchCboeChain(symbol: string): Promise<CboeChain> {
  const urlSym = toUrlSymbol(symbol);
  const directUrl = `https://cdn.cboe.com/api/global/delayed_quotes/options/${urlSym}.json`;

  // 1. Try direct (CBOE CDN sends CORS headers for public access)
  try {
    const r = await fetch(directUrl, { mode: "cors" });
    if (!r.ok) throw new Error(`CBOE HTTP ${r.status}`);
    const json = await r.json();
    if (!json?.data?.options?.length && !json?.options?.length) throw new Error("empty response");
    return parseRawJson(json, symbol);
  } catch (directErr) {
    // 2. CORS proxy fallback (allorigins.win)
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(directUrl)}`;
    try {
      const pr = await fetch(proxyUrl);
      if (!pr.ok) throw new Error(`proxy HTTP ${pr.status}`);
      const wrapper = await pr.json();
      const json = JSON.parse(wrapper.contents);
      if (!json?.data?.options?.length && !json?.options?.length) throw new Error("empty proxy response");
      const chain = parseRawJson(json, symbol);
      chain.source = "CBOE Delayed (15m, proxy)";
      return chain;
    } catch (proxyErr) {
      throw new Error(`CBOE direct: ${(directErr as Error).message} | proxy: ${(proxyErr as Error).message}`);
    }
  }
}

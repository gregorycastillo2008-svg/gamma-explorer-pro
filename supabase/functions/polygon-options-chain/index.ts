// Real options chain data from Polygon for Greek Ladder.
// Returns per-contract: strike, bid, ask, last, IV, OI, volume, side, expiration.
// Plus session metrics: spot, HV30, IV rank approximation, put/call skew, list of expirations.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const POLYGON_KEY = Deno.env.get("POLYGON_API_KEY") ?? "";
const INDEX_SYMBOLS = new Set(["SPX", "NDX", "RUT", "VIX", "XSP", "DJX"]);

interface Contract {
  ticker: string;
  strike: number;
  expiration: string; // YYYY-MM-DD
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
}

interface ChainResult {
  symbol: string;
  spot: number;
  timestamp: string;
  expirations: string[];
  selectedExpiration: string;
  hv30: number;
  ivRank: number; // 0..100 (approx)
  skew: number; // putIV - callIV at ATM
  contracts: Contract[];
}

// In-memory cache keyed by symbol|expiration
const cache = new Map<string, { ts: number; data: ChainResult }>();
const TTL_MS = 30_000;

async function fetchSpot(symbol: string): Promise<number> {
  const isIdx = INDEX_SYMBOLS.has(symbol);
  const ticker = isIdx ? `I:${symbol}` : symbol;
  const url = isIdx
    ? `https://api.polygon.io/v3/snapshot/indices?ticker.any_of=${ticker}&apiKey=${POLYGON_KEY}`
    : `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`spot ${r.status}`);
  const j = await r.json();
  if (isIdx) {
    return j?.results?.[0]?.value ?? j?.results?.[0]?.session?.close ?? 0;
  }
  const t = j?.ticker;
  return t?.day?.c || t?.lastTrade?.p || t?.prevDay?.c || 0;
}

async function fetchChainSnapshot(symbol: string, expiration?: string): Promise<any[]> {
  // Fetch snapshot v3 (includes greeks, IV, OI, last quote)
  const params = new URLSearchParams({
    "apiKey": POLYGON_KEY,
    "limit": "250",
  });
  if (expiration) params.set("expiration_date", expiration);
  const u = `https://api.polygon.io/v3/snapshot/options/${symbol}?${params.toString()}`;
  const out: any[] = [];
  let url: string | null = u;
  let pages = 0;
  while (url && pages < 4) {
    const r = await fetch(url);
    if (!r.ok) break;
    const j = await r.json();
    if (Array.isArray(j?.results)) out.push(...j.results);
    url = j?.next_url ? `${j.next_url}&apiKey=${POLYGON_KEY}` : null;
    pages++;
  }
  return out;
}

async function fetchExpirations(symbol: string): Promise<string[]> {
  // Reference contracts to list expirations
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expired=false&expiration_date.gte=${today}&limit=1000&apiKey=${POLYGON_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  const set = new Set<string>();
  (j?.results ?? []).forEach((c: any) => c?.expiration_date && set.add(c.expiration_date));
  return [...set].sort();
}

async function fetchHV30(symbol: string): Promise<number> {
  // Daily aggregates last ~45 trading days
  const end = new Date();
  const start = new Date(Date.now() - 70 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmt(start)}/${fmt(end)}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return 0;
  const j = await r.json();
  const closes: number[] = (j?.results ?? []).map((b: any) => b.c).filter((x: number) => x > 0);
  if (closes.length < 21) return 0;
  const recent = closes.slice(-31);
  const rets: number[] = [];
  for (let i = 1; i < recent.length; i++) rets.push(Math.log(recent[i] / recent[i - 1]));
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!POLYGON_KEY) throw new Error("POLYGON_API_KEY not configured");

    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "SPY").toUpperCase();
    const expirationParam = url.searchParams.get("expiration") || undefined;
    const cacheKey = `${symbol}|${expirationParam ?? "auto"}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parallel: spot + expirations + HV
    const [spot, allExpirations, hv30] = await Promise.all([
      fetchSpot(symbol).catch((e) => { console.error("spot err", e); return 0; }),
      fetchExpirations(symbol).catch((e) => { console.error("exp err", e); return [] as string[]; }),
      fetchHV30(symbol).catch((e) => { console.error("hv err", e); return 0; }),
    ]);
    console.log("symbol", symbol, "spot", spot, "expirations", allExpirations.length, "hv30", hv30);

    // Determine target expiration (nearest if not provided)
    const expirations = allExpirations.slice(0, 30);
    const selectedExpiration =
      expirationParam && expirations.includes(expirationParam)
        ? expirationParam
        : expirations[0] ?? "";

    const raw = selectedExpiration
      ? await fetchChainSnapshot(symbol, selectedExpiration)
      : [];

    // Window strikes around spot ±15%
    const lo = spot * 0.85;
    const hi = spot * 1.15;

    const contracts: Contract[] = raw
      .map((c: any) => {
        const det = c?.details ?? {};
        const greeks = c?.greeks ?? {};
        const lq = c?.last_quote ?? {};
        const lt = c?.last_trade ?? {};
        const strike = det?.strike_price ?? 0;
        return {
          ticker: det?.ticker ?? "",
          strike,
          expiration: det?.expiration_date ?? selectedExpiration,
          side: (det?.contract_type ?? "call") as "call" | "put",
          bid: lq?.bid ?? 0,
          ask: lq?.ask ?? 0,
          last: lt?.price ?? 0,
          iv: c?.implied_volatility ?? 0,
          oi: c?.open_interest ?? 0,
          volume: c?.day?.volume ?? 0,
          delta: greeks?.delta ?? 0,
          gamma: greeks?.gamma ?? 0,
          theta: greeks?.theta ?? 0,
          vega: greeks?.vega ?? 0,
        };
      })
      .filter((c) => c.strike >= lo && c.strike <= hi && c.strike > 0);

    // Skew at ATM (closest strike)
    const calls = contracts.filter((c) => c.side === "call");
    const puts = contracts.filter((c) => c.side === "put");
    const closest = (arr: Contract[]) =>
      arr.reduce((b, c) => (Math.abs(c.strike - spot) < Math.abs(b.strike - spot) ? c : b), arr[0]);
    const atmCall = calls.length ? closest(calls) : null;
    const atmPut = puts.length ? closest(puts) : null;
    const skew = atmPut && atmCall ? (atmPut.iv - atmCall.iv) : 0;

    // IV Rank approximation: where ATM IV stands vs hv30 (capped 0..100)
    const atmIV = atmCall ? atmCall.iv : 0;
    const ivRank = hv30 > 0 ? Math.max(0, Math.min(100, ((atmIV - hv30) / hv30) * 50 + 50)) : 50;

    const data: ChainResult = {
      symbol,
      spot,
      timestamp: new Date().toISOString(),
      expirations,
      selectedExpiration,
      hv30,
      ivRank,
      skew,
      contracts,
    };

    cache.set(cacheKey, { ts: Date.now(), data });
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

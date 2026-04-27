// Real options chain data for Greek Ladder.
// Source: CBOE delayed quotes (free, ~15min delayed) — provides bid/ask/IV/OI/Volume/Greeks per contract.
// Optional: Polygon for spot/HV if POLYGON_API_KEY tier allows.

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
  source: string;
  expirations: string[];
  selectedExpiration: string;
  hv30: number;
  ivRank: number;
  skew: number;
  contracts: Contract[];
}

const cache = new Map<string, { ts: number; data: ChainResult }>();
const TTL_MS = 30_000;

function parseOcc(occ: string): { ymd: string; cp: "C" | "P"; strike: number } | null {
  const m = occ.match(/(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  return { ymd: m[1], cp: m[2] as "C" | "P", strike: parseInt(m[3], 10) / 1000 };
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

async function fetchCboe(symbol: string) {
  const cboeSymbol = INDEX_SYMBOLS.has(symbol) ? `_${symbol}` : symbol;
  const r = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${cboeSymbol}.json`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`cboe ${r.status}`);
  const json = await r.json();
  const d = json?.data;
  if (!d?.options) throw new Error("no options");
  return d;
}

async function fetchHV30Polygon(symbol: string): Promise<number> {
  if (!POLYGON_KEY) return 0;
  const end = new Date();
  const start = new Date(Date.now() - 70 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmt(start)}/${fmt(end)}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;
  try {
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
  } catch { return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "SPY").toUpperCase().trim();
    if (!/^[A-Z]{1,6}$/.test(symbol)) {
      return new Response(JSON.stringify({ error: "invalid symbol" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const expirationParam = url.searchParams.get("expiration") || "";
    const cacheKey = `${symbol}|${expirationParam}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return new Response(JSON.stringify(hit.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [cboe, hv30] = await Promise.all([
      fetchCboe(symbol),
      fetchHV30Polygon(symbol),
    ]);

    const spot = Number(cboe.current_price) || 0;
    const now = new Date();

    // Group contracts by expiration
    const byExp = new Map<string, Contract[]>();
    const expDaysMap = new Map<string, number>();

    for (const o of cboe.options) {
      const p = parseOcc(o.option);
      if (!p) continue;
      const days = ymdToDays(p.ymd, now);
      if (days < 0 || days > 400) continue;
      const expIso = ymdToIso(p.ymd);
      expDaysMap.set(expIso, days);
      const c: Contract = {
        ticker: o.option,
        strike: p.strike,
        expiration: expIso,
        side: p.cp === "C" ? "call" : "put",
        bid: Number(o.bid) || 0,
        ask: Number(o.ask) || 0,
        last: Number(o.last_trade_price) || 0,
        iv: Number(o.iv) || 0,
        oi: Number(o.open_interest) || 0,
        volume: Number(o.volume) || 0,
        delta: Number(o.delta) || 0,
        gamma: Number(o.gamma) || 0,
        theta: Number(o.theta) || 0,
        vega: Number(o.vega) || 0,
      };
      if (!byExp.has(expIso)) byExp.set(expIso, []);
      byExp.get(expIso)!.push(c);
    }

    // Sorted list of expirations (ASC)
    const expirations = [...byExp.keys()].sort();
    const selectedExpiration =
      expirationParam && byExp.has(expirationParam)
        ? expirationParam
        : expirations[0] ?? "";

    // Window strikes around spot ±15%
    const lo = spot * 0.85;
    const hi = spot * 1.15;
    const contracts = (byExp.get(selectedExpiration) ?? [])
      .filter((c) => c.strike >= lo && c.strike <= hi)
      .sort((a, b) => a.strike - b.strike);

    // Skew at ATM
    const calls = contracts.filter((c) => c.side === "call" && c.iv > 0);
    const puts = contracts.filter((c) => c.side === "put" && c.iv > 0);
    const closest = (arr: Contract[]) =>
      arr.reduce((b, c) => (Math.abs(c.strike - spot) < Math.abs(b.strike - spot) ? c : b), arr[0]);
    const atmCall = calls.length ? closest(calls) : null;
    const atmPut = puts.length ? closest(puts) : null;
    const skew = atmPut && atmCall ? (atmPut.iv - atmCall.iv) : 0;

    const atmIV = atmCall ? atmCall.iv : 0;
    const ivRank = hv30 > 0 ? Math.max(0, Math.min(100, ((atmIV - hv30) / hv30) * 50 + 50)) : 50;

    const data: ChainResult = {
      symbol,
      spot,
      timestamp: new Date().toISOString(),
      source: "cboe",
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
    console.error("chain error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

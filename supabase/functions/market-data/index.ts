// Real options market data with GEX/DEX aggregation.
// Tries Polygon.io first (paid greeks), falls back to CBOE (free, ~15min delayed).
// In-memory cache (2 min TTL) per symbol.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INDEX_SYMBOLS = new Set(["SPX", "NDX", "RUT", "VIX", "XSP", "DJX"]);

interface SlimContract {
  strike: number;
  expiry: number; // days
  type: "call" | "put";
  iv: number;
  oi: number;
  volume: number;
  delta: number;
  gamma: number;
}

interface StrikeAgg {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
  callIV: number;
  putIV: number;
}

interface MarketDataResult {
  symbol: string;
  source: "polygon" | "cboe";
  spotPrice: number;
  timestamp: string;
  // gamma
  gammaFlip: number;
  netGEX: number;
  callGEX: number;
  putGEX: number;
  // oi
  totalCallOI: number;
  totalPutOI: number;
  callPutRatio: number;
  // iv
  atmIV: number;
  putSkew: number;
  // concentration
  concentration: number;
  // top strikes
  topStrikes: StrikeAgg[];
}

// ============ CACHE ============
const cache = new Map<string, { ts: number; data: MarketDataResult }>();
const TTL_MS = 2 * 60 * 1000;

// ============ POLYGON FETCH ============
async function fetchPolygon(symbol: string, apiKey: string): Promise<SlimContract[] & { spot?: number } | null> {
  // 1. Get spot price
  const quoteResp = await fetch(
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`,
  );
  if (!quoteResp.ok) {
    console.warn("polygon quote failed", quoteResp.status);
    return null;
  }
  const quoteJson = await quoteResp.json();
  const spot = quoteJson?.results?.[0]?.c;
  if (!spot) return null;

  // 2. Get options snapshot chain (returns greeks, OI, IV in one call)
  const snapResp = await fetch(
    `https://api.polygon.io/v3/snapshot/options/${symbol}?limit=250&apiKey=${apiKey}`,
  );
  if (!snapResp.ok) {
    console.warn("polygon snapshot failed", snapResp.status);
    return null;
  }
  const snapJson = await snapResp.json();
  const results = snapJson?.results ?? [];

  const now = Date.now();
  const contracts: SlimContract[] = [];
  for (const r of results) {
    const det = r.details;
    const greeks = r.greeks;
    if (!det || !greeks) continue;
    const expDate = new Date(det.expiration_date + "T21:00:00Z");
    const days = Math.max(0, Math.round((expDate.getTime() - now) / 86_400_000));
    if (days <= 0 || days > 400) continue;
    const oi = Number(r.open_interest) || 0;
    if (oi <= 0) continue;
    contracts.push({
      strike: Number(det.strike_price),
      expiry: days,
      type: det.contract_type === "call" ? "call" : "put",
      iv: Number(r.implied_volatility) || 0,
      oi,
      volume: Number(r.day?.volume) || 0,
      delta: Number(greeks.delta) || 0,
      gamma: Number(greeks.gamma) || 0,
    });
  }
  if (contracts.length === 0) return null;
  (contracts as any).spot = spot;
  return contracts as any;
}

// ============ CBOE FALLBACK ============
function parseOccTail(occ: string) {
  const m = occ.match(/(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  return { ymd: m[1], cp: m[2] as "C" | "P", strike: parseInt(m[3], 10) / 1000 };
}
function ymdToDays(ymd: string, now: Date) {
  const yy = parseInt(ymd.slice(0, 2), 10);
  const mm = parseInt(ymd.slice(2, 4), 10) - 1;
  const dd = parseInt(ymd.slice(4, 6), 10);
  const exp = new Date(Date.UTC(2000 + yy, mm, dd, 21, 0, 0));
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86_400_000));
}

async function fetchCboe(symbol: string): Promise<{ contracts: SlimContract[]; spot: number } | null> {
  const cboeSymbol = INDEX_SYMBOLS.has(symbol) ? `_${symbol}` : symbol;
  const r = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${cboeSymbol}.json`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!r.ok) return null;
  const json = await r.json();
  const data = json?.data;
  if (!data?.options) return null;

  const spot = Number(data.current_price) || 0;
  const now = new Date();
  const contracts: SlimContract[] = [];
  for (const o of data.options) {
    const p = parseOccTail(o.option);
    if (!p) continue;
    const days = ymdToDays(p.ymd, now);
    if (days <= 0 || days > 400) continue;
    const oi = Number(o.open_interest) || 0;
    if (oi <= 0) continue;
    const iv = Number(o.iv) || 0;
    if (iv <= 0) continue;
    contracts.push({
      strike: p.strike,
      expiry: days,
      type: p.cp === "C" ? "call" : "put",
      iv,
      oi,
      volume: 0,
      delta: Number(o.delta) || 0,
      gamma: Number(o.gamma) || 0,
    });
  }
  return { contracts, spot };
}

// ============ GEX AGGREGATION ============
function aggregate(contracts: SlimContract[], spot: number): MarketDataResult {
  const MULT = 100;
  let netGEX = 0, callGEX = 0, putGEX = 0;
  let totalCallOI = 0, totalPutOI = 0;
  const byStrike = new Map<number, StrikeAgg>();
  const ivVolNum: number[] = [];
  let ivVolSumNum = 0, ivVolSumDen = 0;

  for (const c of contracts) {
    const gex = c.gamma * c.oi * spot * spot * MULT;
    const signed = c.type === "call" ? -gex : gex;
    netGEX += signed;
    if (c.type === "call") { callGEX += signed; totalCallOI += c.oi; }
    else { putGEX += signed; totalPutOI += c.oi; }

    if (c.volume > 0 && c.iv > 0) {
      ivVolSumNum += c.iv * c.volume;
      ivVolSumDen += c.volume;
    }

    let s = byStrike.get(c.strike);
    if (!s) {
      s = { strike: c.strike, callGEX: 0, putGEX: 0, netGEX: 0, callOI: 0, putOI: 0, callIV: 0, putIV: 0 };
      byStrike.set(c.strike, s);
    }
    if (c.type === "call") { s.callGEX += signed; s.callOI += c.oi; if (c.iv > 0) s.callIV = c.iv; }
    else { s.putGEX += signed; s.putOI += c.oi; if (c.iv > 0) s.putIV = c.iv; }
    s.netGEX = s.callGEX + s.putGEX;
  }

  const sorted = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  let gammaFlip = spot;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].netGEX * sorted[i + 1].netGEX < 0) {
      gammaFlip = (sorted[i].strike + sorted[i + 1].strike) / 2;
      break;
    }
  }

  const atm = sorted.reduce((p, c) => Math.abs(c.strike - spot) < Math.abs(p.strike - spot) ? c : p, sorted[0] ?? { strike: spot, callIV: 0, putIV: 0 } as any);
  const atmIV = ((atm.callIV || 0) + (atm.putIV || 0)) / 2;

  const otmPut = sorted.find((s) => s.strike < spot * 0.95 && s.putIV > 0);
  const putSkew = otmPut && atmIV > 0 ? ((otmPut.putIV - atmIV) / atmIV) * 100 : 0;

  const nearGamma = sorted.filter((s) => Math.abs(s.strike - spot) / spot < 0.02)
    .reduce((sum, s) => sum + Math.abs(s.netGEX), 0);
  const totalGamma = sorted.reduce((sum, s) => sum + Math.abs(s.netGEX), 0);
  const concentration = totalGamma > 0 ? (nearGamma / totalGamma) * 100 : 0;

  const topStrikes = [...sorted].sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX)).slice(0, 8);

  return {
    symbol: "",
    source: "cboe",
    spotPrice: spot,
    timestamp: new Date().toISOString(),
    gammaFlip,
    netGEX: netGEX / 1e9,
    callGEX: callGEX / 1e9,
    putGEX: putGEX / 1e9,
    totalCallOI,
    totalPutOI,
    callPutRatio: totalPutOI > 0 ? totalCallOI / totalPutOI : 0,
    atmIV: atmIV * 100,
    putSkew,
    concentration,
    topStrikes,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") ?? "SPY").toUpperCase().trim();
    if (!/^[A-Z]{1,6}$/.test(symbol)) {
      return new Response(JSON.stringify({ error: "invalid symbol" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // cache check
    const hit = cache.get(symbol);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return new Response(JSON.stringify({ ...hit.data, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let contracts: SlimContract[] | null = null;
    let spot = 0;
    let source: "polygon" | "cboe" = "cboe";

    const POLYGON_KEY = Deno.env.get("POLYGON_API_KEY");
    if (POLYGON_KEY) {
      try {
        const p = await fetchPolygon(symbol, POLYGON_KEY) as any;
        if (p && p.length > 0) {
          contracts = p;
          spot = p.spot;
          source = "polygon";
        }
      } catch (e) {
        console.warn("polygon error, falling back to CBOE:", e);
      }
    }

    if (!contracts) {
      const cboe = await fetchCboe(symbol);
      if (cboe && cboe.contracts.length > 0) {
        contracts = cboe.contracts;
        spot = cboe.spot;
        source = "cboe";
      }
    }

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ error: "No options data available" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = aggregate(contracts, spot);
    result.symbol = symbol;
    result.source = source;

    cache.set(symbol, { ts: Date.now(), data: result });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("market-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

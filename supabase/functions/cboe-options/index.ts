// Fetches the public CBOE delayed-quotes options chain and returns a slim
// payload with spot price + contracts compatible with the front-end gex lib.
// Source: https://cdn.cboe.com/api/global/delayed_quotes/options/{SYMBOL}.json
// Free, no auth, ~15-min delayed.

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// Symbols that CBOE serves under the underscore-prefixed index path
const INDEX_SYMBOLS = new Set(["SPX", "NDX", "RUT", "VIX", "XSP", "DJX"]);

interface CboeOption {
  option: string;
  iv: number;
  open_interest: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

interface SlimContract {
  strike: number;
  expiry: number; // days to expiry
  type: "call" | "put";
  iv: number;
  oi: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

// Parse OCC-style symbol tail: "SPX260515C04225000" -> {expiry, type, strike}
// Format: ROOT + YYMMDD + C/P + 8-digit strike (× 1000)
function parseOccTail(occ: string): { ymd: string; cp: "C" | "P"; strike: number } | null {
  const m = occ.match(/(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    ymd: m[1],
    cp: m[2] as "C" | "P",
    strike: parseInt(m[3], 10) / 1000,
  };
}

function ymdToDays(ymd: string, now: Date): number {
  const yy = parseInt(ymd.slice(0, 2), 10);
  const mm = parseInt(ymd.slice(2, 4), 10) - 1;
  const dd = parseInt(ymd.slice(4, 6), 10);
  const exp = new Date(Date.UTC(2000 + yy, mm, dd, 21, 0, 0)); // 4pm ET ≈ 21:00 UTC
  const diffMs = exp.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("symbol") ?? "SPX").toUpperCase().trim();
    if (!/^[A-Z]{1,6}$/.test(raw)) {
      return new Response(JSON.stringify({ error: "invalid symbol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cboeSymbol = INDEX_SYMBOLS.has(raw) ? `_${raw}` : raw;
    const target = `https://cdn.cboe.com/api/global/delayed_quotes/options/${cboeSymbol}.json`;

    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AltarisTerminal/1.0)",
        "Accept": "application/json",
      },
    });
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `CBOE ${upstream.status}`, symbol: raw }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await upstream.json();
    const data = json?.data;
    if (!data?.options) {
      return new Response(JSON.stringify({ error: "malformed payload" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spot: number = Number(data.current_price) || 0;
    const now = new Date();
    const contracts: SlimContract[] = [];
    let totalOI = 0;

    for (const o of data.options as CboeOption[]) {
      const parsed = parseOccTail(o.option);
      if (!parsed) continue;
      const days = ymdToDays(parsed.ymd, now);
      if (days <= 0 || days > 400) continue;
      const oi = Number(o.open_interest) || 0;
      if (oi <= 0) continue; // drop dead contracts
      const iv = Number(o.iv) || 0;
      if (iv <= 0) continue;
      contracts.push({
        strike: parsed.strike,
        expiry: days,
        type: parsed.cp === "C" ? "call" : "put",
        iv,
        oi,
        delta: Number(o.delta) || 0,
        gamma: Number(o.gamma) || 0,
        vega: Number(o.vega) || 0,
        theta: Number(o.theta) || 0,
      });
      totalOI += oi;
    }

    const expiries = Array.from(new Set(contracts.map((c) => c.expiry))).sort((a, b) => a - b);
    const strikes = Array.from(new Set(contracts.map((c) => c.strike))).sort((a, b) => a - b);

    return new Response(
      JSON.stringify({
        symbol: raw,
        spot,
        priceChange: Number(data.price_change) || 0,
        priceChangePct: Number(data.price_change_percent) || 0,
        iv30: Number(data.iv30) || 0,
        lastTradeTime: data.last_trade_time ?? null,
        totalOI,
        expiries,
        strikes,
        contracts,
        source: "CBOE delayed (~15min)",
        fetchedAt: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120", // 2 min CDN cache
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

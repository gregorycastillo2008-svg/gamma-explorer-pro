// Real-time price history for the integrated chart.
// Uses Yahoo Finance (free, no API key) with Polygon fallback.
// GET ?symbol=QQQ&timeframe=1D|5D|1M|3M|6M|1Y
// Returns: { symbol, timeframe, points: [{ time, value }], spot, change, changePct }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function yahooParams(tf: string): { range: string; interval: string } {
  switch (tf) {
    case "1D": return { range: "1d",  interval: "5m" };
    case "5D": return { range: "5d",  interval: "30m" };
    case "1M": return { range: "1mo", interval: "1h" };
    case "3M": return { range: "3mo", interval: "1d" };
    case "6M": return { range: "6mo", interval: "1d" };
    case "1Y": return { range: "1y",  interval: "1d" };
    default:   return { range: "3mo", interval: "1d" };
  }
}

async function fetchYahoo(symbol: string, tf: string) {
  const { range, interval } = yahooParams(tf);
  const yahooSymbol = symbol === "NQ" ? "NQ=F" : symbol;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json",
    },
  });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo: no result");
  const ts: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const closes: (number | null)[] = q.close || [];
  const opens: (number | null)[] = q.open || [];
  const highs: (number | null)[] = q.high || [];
  const lows: (number | null)[] = q.low || [];
  const meta = result.meta || {};
  const points = ts
    .map((t, i) => ({ time: t, value: closes[i] }))
    .filter((p) => p.value != null && Number.isFinite(p.value)) as { time: number; value: number }[];
  const ohlc = ts
    .map((t, i) => ({
      time: t,
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
    }))
    .filter(
      (p) =>
        p.open != null && p.high != null && p.low != null && p.close != null &&
        Number.isFinite(p.open) && Number.isFinite(p.high) && Number.isFinite(p.low) && Number.isFinite(p.close)
    ) as { time: number; open: number; high: number; low: number; close: number }[];
  const spot = Number(meta.regularMarketPrice ?? (points.length ? points[points.length - 1].value : 0));
  const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? (points.length ? points[0].value : spot));
  const change = spot - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  return { points, ohlc, spot, change, changePct };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "QQQ").toUpperCase();
  const timeframe = url.searchParams.get("timeframe") || "3M";

  try {
    const { points, ohlc, spot, change, changePct } = await fetchYahoo(symbol, timeframe);
    return new Response(
      JSON.stringify({ symbol, timeframe, points, ohlc, spot, change, changePct, source: "yahoo" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "fetch error", points: [], spot: 0, change: 0, changePct: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

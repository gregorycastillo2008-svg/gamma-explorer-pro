// Polygon price history (aggregates) for the integrated chart.
// GET ?symbol=QQQ&timeframe=1D|5D|1M|3M|6M|1Y
// Returns: { symbol, timeframe, points: [{ time, value }], spot, change, changePct }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INDEX_SYMBOLS: Record<string, string> = {
  SPX: "I:SPX", NDX: "I:NDX", RUT: "I:RUT", VIX: "I:VIX", DJX: "I:DJI", XSP: "I:SPX",
};

function rangeFor(tf: string): { mult: number; span: string; from: number; to: number } {
  const now = Date.now();
  const day = 86_400_000;
  switch (tf) {
    case "1D": return { mult: 5, span: "minute", from: now - 1 * day, to: now };
    case "5D": return { mult: 30, span: "minute", from: now - 7 * day, to: now };
    case "1M": return { mult: 1, span: "hour", from: now - 31 * day, to: now };
    case "3M": return { mult: 1, span: "day", from: now - 95 * day, to: now };
    case "6M": return { mult: 1, span: "day", from: now - 190 * day, to: now };
    case "1Y": return { mult: 1, span: "day", from: now - 370 * day, to: now };
    default:   return { mult: 1, span: "day", from: now - 95 * day, to: now };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "QQQ").toUpperCase();
    const timeframe = url.searchParams.get("timeframe") || "3M";
    const apiKey = Deno.env.get("POLYGON_API_KEY");
    if (!apiKey) throw new Error("POLYGON_API_KEY missing");

    const polySym = INDEX_SYMBOLS[symbol] ?? symbol;
    const { mult, span, from, to } = rangeFor(timeframe);

    const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(polySym)}/range/${mult}/${span}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
    const r = await fetch(aggUrl);
    if (!r.ok) throw new Error(`Polygon ${r.status}`);
    const j = await r.json();
    const results: any[] = j.results || [];
    const points = results.map((b) => ({ time: Math.floor(b.t / 1000), value: b.c }));
    const spot = points.length ? points[points.length - 1].value : 0;
    const open = points.length ? points[0].value : spot;
    const change = spot - open;
    const changePct = open > 0 ? (change / open) * 100 : 0;

    return new Response(
      JSON.stringify({ symbol, timeframe, points, spot, change, changePct }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "fetch error", points: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

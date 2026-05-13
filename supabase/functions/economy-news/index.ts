// Economy news aggregator — pulls high-impact macro/political/geopolitical events
// Source: GDELT 2.0 DOC API (100% free, no key required)
// Filters: Trump/Powell/Fed/CPI/NFP/FOMC/war/sanctions/earnings of mega-caps

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  imageUrl?: string;
  category: "macro" | "fed" | "geopolitics" | "earnings" | "trump";
  impact: "high" | "medium" | "low";
  tone: number; // -10..+10 (negative bearish)
  language: string;
}

interface Category {
  key: NewsItem["category"];
  label: string;
  query: string; // GDELT query
}

const CATEGORIES: Category[] = [
  {
    key: "trump",
    label: "Trump / White House",
    query: '(Trump OR "White House" OR "Oval Office") (speech OR tariff OR executive order OR sanctions)',
  },
  {
    key: "fed",
    label: "Fed / Powell",
    query: '(Powell OR "Federal Reserve" OR FOMC OR "rate decision" OR "interest rates")',
  },
  {
    key: "macro",
    label: "Macro Data",
    query: '(CPI OR "inflation report" OR "non-farm payrolls" OR NFP OR "jobless claims" OR PCE OR PPI OR "GDP report")',
  },
  {
    key: "geopolitics",
    label: "Geopolitics",
    query: '(war OR sanctions OR ceasefire OR "missile strike" OR OPEC OR "oil supply" OR Ukraine OR Israel OR Iran OR Taiwan)',
  },
  {
    key: "earnings",
    label: "Mega-Cap Earnings",
    query: '(earnings) (NVIDIA OR Apple OR Microsoft OR Tesla OR Amazon OR Meta OR Google OR Alphabet)',
  },
];

const cache = new Map<string, { ts: number; data: NewsItem[] }>();
const TTL_MS = 5 * 60_000;

function gdeltDateToIso(d: string): string {
  // Format YYYYMMDDHHMMSS
  if (d.length < 14) return new Date().toISOString();
  const y = d.slice(0, 4), m = d.slice(4, 6), day = d.slice(6, 8);
  const hh = d.slice(8, 10), mm = d.slice(10, 12), ss = d.slice(12, 14);
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}Z`;
}

function impactFromTone(tone: number): NewsItem["impact"] {
  const a = Math.abs(tone);
  if (a >= 5) return "high";
  if (a >= 2.5) return "medium";
  return "low";
}

async function fetchGdelt(cat: Category, maxRecords = 15): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    query: `${cat.query} sourcelang:eng`,
    mode: "ArtList",
    format: "json",
    maxrecords: String(maxRecords),
    sort: "DateDesc",
    timespan: "24H",
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (GEXSATELIT EconomyNews)" },
  });
  if (!res.ok) {
    console.warn(`gdelt ${cat.key} status ${res.status}`);
    return [];
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { return []; }
  const articles: any[] = json?.articles ?? [];

  return articles.slice(0, maxRecords).map((a, i) => {
    const tone = Number(a.tone ?? 0) || 0;
    return {
      id: `${cat.key}-${a.url ? btoa(a.url).slice(0, 16) : i}`,
      title: String(a.title ?? "").trim(),
      url: String(a.url ?? "#"),
      source: String(a.domain ?? a.sourcecountry ?? "unknown"),
      publishedAt: gdeltDateToIso(String(a.seendate ?? "")),
      imageUrl: a.socialimage || undefined,
      category: cat.key,
      impact: impactFromTone(tone),
      tone,
      language: String(a.language ?? "English"),
    } as NewsItem;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const reqCat = url.searchParams.get("category"); // optional filter

    const cacheKey = reqCat ?? "all";
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return new Response(JSON.stringify({ items: hit.data, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cats = reqCat ? CATEGORIES.filter((c) => c.key === reqCat) : CATEGORIES;
    const results = await Promise.allSettled(cats.map((c) => fetchGdelt(c)));
    const items: NewsItem[] = [];
    results.forEach((r) => {
      if (r.status === "fulfilled") items.push(...r.value);
    });

    // Sort: high impact first, then most recent
    items.sort((a, b) => {
      const w = (i: NewsItem) => (i.impact === "high" ? 2 : i.impact === "medium" ? 1 : 0);
      const dw = w(b) - w(a);
      if (dw !== 0) return dw;
      return b.publishedAt.localeCompare(a.publishedAt);
    });

    cache.set(cacheKey, { ts: Date.now(), data: items });

    return new Response(JSON.stringify({ items, cached: false, count: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("economy-news error", e);
    return new Response(JSON.stringify({ error: (e as Error).message, items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

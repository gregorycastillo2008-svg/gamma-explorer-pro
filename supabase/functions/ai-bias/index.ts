// Bias forecaster usando Lovable AI Gateway con el modelo más potente disponible.
// Recibe datos reales de mercado y devuelve predicción JSON estructurada.
// Cache en memoria por símbolo+día (30 min TTL).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MarketData {
  symbol: string;
  spotPrice: number;
  timestamp: string;
  gammaFlip: number;
  netGEX: number;
  callGEX: number;
  putGEX: number;
  totalCallOI: number;
  totalPutOI: number;
  callPutRatio: number;
  atmIV: number;
  putSkew: number;
  concentration: number;
  topStrikes: Array<{ strike: number; netGEX: number; callOI: number; putOI: number }>;
  source?: string;
}

interface Prediction {
  prediction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  factors: Array<{ name: string; description: string; impact: number; direction: "bullish" | "bearish" | "neutral" }>;
  summary: string;
  keyLevels: { support: number; resistance: number };
  generatedAt: string;
  modelUsed: string;
  marketDataTimestamp: string;
  cached?: boolean;
}

const cache = new Map<string, { ts: number; data: Prediction }>();
const TTL_MS = 30 * 60 * 1000;

// Modelo más potente disponible en Lovable AI Gateway
const MODEL = "openai/gpt-5.2";

function buildSystemPrompt(): string {
  return `Eres el analista cuantitativo más avanzado del mundo, experto en Gamma Exposure (GEX), market microstructure, dealer hedging flows y volatility surface dynamics. Analizas datos reales de opciones y produces predicciones direccionales calibradas con razonamiento profundo. Siempre respondes con JSON válido sin markdown ni texto extra.`;
}

function buildPrompt(md: MarketData, targetDay: string): string {
  const distFlipPct = ((md.spotPrice - md.gammaFlip) / md.gammaFlip * 100).toFixed(2);
  const topStrikesStr = md.topStrikes.slice(0, 5).map((s) =>
    `- $${s.strike}: ${(s.netGEX / 1e9).toFixed(2)}B (Call OI: ${s.callOI.toLocaleString()}, Put OI: ${s.putOI.toLocaleString()})`
  ).join("\n");

  return `Analiza estos DATOS REALES DE MERCADO y predice el sesgo direccional para ${targetDay}.

═══════════════════════════════════════════════════════════════════════════
DATOS ACTUALES (${new Date(md.timestamp).toLocaleString()}) — ${md.symbol}
═══════════════════════════════════════════════════════════════════════════

PRECIO Y GAMMA:
- Precio spot: $${md.spotPrice.toFixed(2)}
- Gamma Flip: $${md.gammaFlip.toFixed(2)}
- Distancia del flip: ${distFlipPct}%
- Posición: ${md.spotPrice > md.gammaFlip ? "ARRIBA del flip (positivo)" : "DEBAJO del flip (negativo)"}

GAMMA EXPOSURE:
- Net GEX: $${md.netGEX.toFixed(2)}B
- Call GEX: $${md.callGEX.toFixed(2)}B
- Put GEX: $${md.putGEX.toFixed(2)}B
- Sesgo GEX: ${md.netGEX > 0 ? "POSITIVO (estabilizador)" : "NEGATIVO (amplificador)"}

OPEN INTEREST:
- Total Call OI: ${md.totalCallOI.toLocaleString()}
- Total Put OI: ${md.totalPutOI.toLocaleString()}
- Call/Put Ratio: ${md.callPutRatio.toFixed(2)}

VOLATILIDAD:
- ATM IV: ${md.atmIV.toFixed(2)}%
- Put Skew: ${md.putSkew.toFixed(2)}%

CONCENTRACIÓN:
- Cerca del precio: ${md.concentration.toFixed(2)}%

TOP 5 STRIKES POR NET GEX:
${topStrikesStr}

═══════════════════════════════════════════════════════════════════════════

Framework (pesos): Posición vs Flip 35%, Net GEX 25%, C/P Ratio 20%, Put Skew 10%, Concentración 10%.

Responde ÚNICAMENTE con JSON válido (sin markdown, sin texto extra):

{
  "prediction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": <0-100>,
  "factors": [
    { "name": "Posición vs Gamma Flip", "description": "...", "impact": <0-100>, "direction": "bullish|bearish|neutral" },
    { "name": "Net GEX", "description": "...", "impact": <0-100>, "direction": "..." },
    { "name": "Call/Put Ratio", "description": "...", "impact": <0-100>, "direction": "..." },
    { "name": "Put Skew", "description": "...", "impact": <0-100>, "direction": "..." },
    { "name": "Gamma Concentration", "description": "...", "impact": <0-100>, "direction": "..." }
  ],
  "summary": "2-3 líneas explicando la predicción",
  "keyLevels": { "support": <number>, "resistance": <number> }
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { marketData, targetDay } = await req.json() as { marketData: MarketData; targetDay: string };
    if (!marketData?.symbol || !targetDay) {
      return new Response(JSON.stringify({ error: "marketData and targetDay required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKey = `${marketData.symbol}:${targetDay}:${marketData.timestamp}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return new Response(JSON.stringify({ ...hit.data, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildPrompt(marketData, targetDay) },
        ],
        response_format: { type: "json_object" },
        reasoning: { effort: "high" },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Lovable AI error:", resp.status, txt);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Intenta de nuevo en unos segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de Lovable AI agotados. Añade créditos en Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI gateway ${resp.status}: ${txt.slice(0, 200)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiJson = await resp.json();
    const text: string = apiJson?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return new Response(JSON.stringify({ error: "AI returned non-JSON", raw: text.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try { parsed = JSON.parse(m[0]); }
    catch {
      return new Response(JSON.stringify({ error: "JSON parse failed", raw: m[0].slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["BULLISH", "BEARISH", "NEUTRAL"].includes(parsed.prediction)) {
      return new Response(JSON.stringify({ error: "Invalid prediction shape", parsed }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result: Prediction = {
      prediction: parsed.prediction,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      factors: Array.isArray(parsed.factors) ? parsed.factors.slice(0, 8) : [],
      summary: String(parsed.summary ?? ""),
      keyLevels: {
        support: Number(parsed.keyLevels?.support) || marketData.spotPrice * 0.98,
        resistance: Number(parsed.keyLevels?.resistance) || marketData.spotPrice * 1.02,
      },
      generatedAt: new Date().toISOString(),
      modelUsed: MODEL,
      marketDataTimestamp: marketData.timestamp,
    };

    cache.set(cacheKey, { ts: Date.now(), data: result });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-bias error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

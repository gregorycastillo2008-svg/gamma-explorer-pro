// Lovable AI Gateway — Senior Quant GEX bias forecaster
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a Senior Quant Trader specialized in derivatives flow and dealer market making.
Your job: forecast Market Bias (bullish / bearish / neutral) for the next 24-48h using GEX structure.

Logic rules:
- Spot ABOVE Gamma Flip → "Positive Gamma Environment": low vol, mean reversion bias.
- Spot BELOW Gamma Flip → "Negative Gamma Environment": vol expansion, momentum/trend continuation.
- Evaluate dealer hedge pressure as price approaches Call Wall (resistance) or Put Wall (support).
- Use Vanna (vol-delta) and Charm (time-delta decay) for overnight projection.
- Magnetic strikes = strikes with highest GEX/OI concentration that pin price.

OUTPUT FORMAT — return strict markdown with these exact sections (no preamble):

## 🎯 Intraday Bias (Today)
- **Direction**: <Bullish | Bearish | Neutral>
- **Confidence**: <0-100>%
- **Regime**: <Positive Gamma | Negative Gamma>
- **Reasoning**: 2-3 lines max.

## 🌙 Overnight Bias (Next Day)
- **Direction**: <Bullish | Bearish | Neutral>
- **Confidence**: <0-100>%
- **Charm/Vanna impact**: 2 lines on time decay & vol-delta drift.

## 🧲 Magnetic Levels
- **Primary magnet**: $<strike> — why
- **Secondary magnet**: $<strike> — why
- **Pin risk strike**: $<strike>

## ⚠️ Risk Scenario (Thesis Invalidation)
- **Stop Loss level**: $<price>
- **Trigger event**: 1 line.
- **If breached**: expected reaction (gamma squeeze / vol explosion / etc).

## 📊 Tactical Summary
1 short paragraph (max 4 lines) with the actionable take.

Be precise, use the exact numbers provided. No disclaimers. No "as an AI". Trader-to-trader tone.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { ticker, spot, netGex, gammaFlip, callWall, putWall, netDex, vanna, charm, atmIv, zScore } = await req.json();

    const userPayload = `Ticker: ${ticker}
Spot Price: $${spot}
Net GEX: ${netGex}
Gamma Flip: ${gammaFlip ?? "N/A"}
Call Wall: $${callWall}
Put Wall: $${putWall}
Net DEX: ${netDex}
Vanna (aggregate): ${vanna}
Charm (aggregate): ${charm}
ATM IV: ${atmIv}%
Anomaly Z-Score: ${zScore ?? "N/A"}σ

Generate the structured forecast now.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPayload },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-bias error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

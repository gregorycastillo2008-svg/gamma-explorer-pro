import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId || !sessionId.startsWith("cs_")) throw new Error("Invalid session id");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Accept any session that completed checkout (paid or trialing).
    // For trial subs, payment_status is "no_payment_required" but status is "complete".
    const ok = session.status === "complete" || session.payment_status === "paid";
    if (!ok) {
      return new Response(
        JSON.stringify({ valid: false, status: session.status, payment_status: session.payment_status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const email = session.customer_details?.email || session.customer_email || null;
    return new Response(
      JSON.stringify({
        valid: true,
        email,
        customer: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        mode: session.mode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ valid: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

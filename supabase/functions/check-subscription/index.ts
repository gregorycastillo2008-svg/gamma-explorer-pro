import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_TO_TIER: Record<string, { tier: string; interval: string }> = {
  price_1TRKWKCZRgBPwOB9awvuYUwA: { tier: "starter", interval: "month" },
  price_1TRKUmCZRgBPwOB9EKTEEmLz: { tier: "starter", interval: "year" },
  price_1TRKXwCZRgBPwOB97g6uSUfB: { tier: "pro", interval: "month" },
  price_1TRKVBCZRgBPwOB995UiKA0S: { tier: "pro", interval: "year" },
  price_1TRKYNCZRgBPwOB9RKZeO5Zb: { tier: "elite", interval: "month" },
  price_1TRKVnCZRgBPwOB93yFgA2kX: { tier: "elite", interval: "year" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user?.email) throw new Error("No user email");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false, tier: null, interval: null, subscription_end: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aceptamos suscripciones activas; ya no se crean trials desde checkout.
    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "all",
      limit: 10,
    });
    const sub = subs.data.find((s) => s.status === "active" || s.status === "trialing");
    if (!sub) {
      return new Response(JSON.stringify({ subscribed: false, tier: null, interval: null, subscription_end: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId = sub.items.data[0].price.id;
    const meta = PRICE_TO_TIER[priceId] ?? { tier: "starter", interval: "month" };

    return new Response(JSON.stringify({
      subscribed: true,
      tier: meta.tier,
      interval: meta.interval,
      subscription_end: new Date(sub.current_period_end * 1000).toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg, subscribed: false, tier: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_TO_TIER: Record<string, { tier: string; interval: string }> = {
  price_1TQreBCZRgBPwOB9AOgrMFJ5: { tier: "basic", interval: "month" },
  price_1TQrefCZRgBPwOB99sCuvVv4: { tier: "basic", interval: "year" },
  price_1TQrfQCZRgBPwOB9Sti7Teao: { tier: "pro", interval: "month" },
  price_1TQrfrCZRgBPwOB9CddMvqzz: { tier: "pro", interval: "year" },
  price_1TQrgfCZRgBPwOB9Xa1n2i6P: { tier: "elite", interval: "month" },
  price_1TQrhICZRgBPwOB9YKQTn74Y: { tier: "elite", interval: "year" },
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

    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1,
    });

    if (subs.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false, tier: null, interval: null, subscription_end: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sub = subs.data[0];
    const priceId = sub.items.data[0].price.id;
    const meta = PRICE_TO_TIER[priceId] ?? { tier: "basic", interval: "month" };

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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_PRICES = new Set([
  "price_1TQrwlCZRgBPwOB9FoDolYiq", // Starter
  "price_1TQrxOCZRgBPwOB9UbadcwFU", // Pro
  "price_1TQry2CZRgBPwOB9bKH38XuV", // Elite
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { priceId, email } = await req.json();
    if (!priceId || !VALID_PRICES.has(priceId)) throw new Error("Invalid price");
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      payment_method_types: ["card"],
      subscription_data: { trial_period_days: 7 },
      allow_promotion_codes: true,
      // After paying, user lands on /auth to create their account
      success_url: `${origin}/auth?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancel`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

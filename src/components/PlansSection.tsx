import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Crown, Gem, Rocket, X, Mail, Shield, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PLANS, type Tier } from "@/lib/plans";
import { useAuth } from "@/hooks/useAuth";
import { applyDiscount, PLAN_DISCOUNTS, tryAdminLogin } from "@/lib/adminBypass";

const plans = [
  {
    name: "Starter", tier: "starter" as Tier, price: 29.99, icon: Rocket, tone: "muted",
    features: PLANS.starter.features,
  },
  {
    name: "Pro", tier: "pro" as Tier, price: 79.99, icon: Crown, tone: "primary", popular: true,
    features: PLANS.pro.features,
  },
  {
    name: "Elite", tier: "elite" as Tier, price: 159.99, icon: Gem, tone: "call",
    features: PLANS.elite.features,
  },
];

export function PlansSection({ showHeader = true, headingLevel = "h1" }: { showHeader?: boolean; headingLevel?: "h1" | "h2" }) {
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<Tier | null>(null);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPwd, setAdminPwd] = useState("");
  const navigate = useNavigate();
  const Heading = headingLevel;

  const openStripeCheckout = (url: string) => {
    const checkoutWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!checkoutWindow) window.location.href = url;
  };

  const handlePlanClick = async (tier: Tier) => {
    const plan = PLANS[tier];
    if (!plan) return;

    if (user?.email) {
      setCheckoutLoading(tier);
      try {
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: { priceId: plan.priceId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.url) openStripeCheckout(data.url);
      } catch (e: any) {
        toast.error(e.message || "Error iniciando el pago");
      } finally {
        setCheckoutLoading(null);
      }
    } else {
      setCheckoutPlan(tier);
      setCheckoutEmail("");
    }
  };

  const submitCheckoutEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail)) {
      toast.error("Introduce un email válido");
      return;
    }
    const plan = PLANS[checkoutPlan];
    setCheckoutLoading(checkoutPlan);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-public", {
        body: { priceId: plan.priceId, email: checkoutEmail.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) openStripeCheckout(data.url);
    } catch (e: any) {
      toast.error(e.message || "Error iniciando el pago");
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <>
      <section id="planes" className="relative z-10 container py-16 scroll-mt-20">
        {showHeader && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Heading className="text-4xl md:text-5xl font-black tracking-tight">
              Elige tu <span className="text-primary">edge</span>
            </Heading>
            <p className="text-muted-foreground mt-3">
              Sin permanencia. Cancela cuando quieras. Aplica un código de descuento al pagar.
            </p>
          </motion.div>
        )}

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -8 }}
              className="relative"
            >
              {p.popular && (
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-lg"
                >
                  ⭐ MÁS POPULAR
                </motion.div>
              )}
              <Card
                className={`p-7 h-full bg-card/85 backdrop-blur-sm relative overflow-hidden ${p.popular ? "border-primary border-2" : ""}`}
                style={{ boxShadow: p.popular ? "0 20px 60px -15px hsl(var(--primary) / 0.5)" : "var(--shadow-card)" }}
              >
                {p.popular && <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />}
                <div className="relative">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-4 ${p.tone === "primary" ? "bg-primary/15" : p.tone === "call" ? "bg-call/15" : "bg-muted"}`}>
                    <p.icon className={`h-6 w-6 ${p.tone === "primary" ? "text-primary" : p.tone === "call" ? "text-call" : "text-muted-foreground"}`} />
                  </div>
                  <div className="font-bold text-2xl">{p.name}</div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-5xl font-black">${p.price}</span>
                    <span className="text-sm text-muted-foreground">/mes</span>
                  </div>
                  <ul className="mt-6 space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`h-4 w-4 mt-0.5 shrink-0 ${p.tone === "call" ? "text-call" : "text-primary"}`} />
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full mt-7"
                    variant={p.popular ? "default" : "outline"}
                    size="lg"
                    disabled={checkoutLoading === p.tier}
                    onClick={() => handlePlanClick(p.tier)}
                  >
                    {checkoutLoading === p.tier ? "Redirigiendo…" : "Suscribirse →"}
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {checkoutPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => { setCheckoutPlan(null); setCheckoutEmail(""); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <Card className="p-6 relative" style={{ boxShadow: "var(--shadow-elegant)" }}>
                <button
                  onClick={() => { setCheckoutPlan(null); setCheckoutEmail(""); }}
                  className="absolute top-3 right-3 p-1 rounded-md hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
                <h3 className="text-xl font-bold">Continuar con el pago</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Plan {PLANS[checkoutPlan].name} · ${PLANS[checkoutPlan].price}/mes
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Tras el pago crearás tu cuenta con este email.
                </p>
                <form onSubmit={submitCheckoutEmail} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="plan-email">Email</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="plan-email"
                        type="email"
                        placeholder="tu@email.com"
                        value={checkoutEmail}
                        onChange={(e) => setCheckoutEmail(e.target.value)}
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 font-bold" disabled={!!checkoutLoading}>
                    {checkoutLoading ? "Redirigiendo a Stripe…" : "Ir al pago →"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Pago seguro vía Stripe · Cancela cuando quieras
                  </p>
                </form>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

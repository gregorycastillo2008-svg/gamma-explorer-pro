import { useState } from "react";
import { Check, Mail, X, Info } from "lucide-react";
import { PLANS, type Tier } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface PaywallProps {
  email?: string;
}

type Billing = "monthly" | "yearly";

export function Paywall(_props: PaywallProps) {
  const [loading, setLoading] = useState<Tier | null>(null);
  const [chosen, setChosen] = useState<Tier | null>(null);
  const [email, setEmail] = useState("");
  const [billing, setBilling] = useState<Billing>("monthly");

  const startCheckout = async (tier: Tier, emailToUse: string) => {
    const plan = PLANS[tier];
    const priceId = billing === "yearly" ? plan.priceIdYearly : plan.priceId;
    if (!priceId) {
      toast.error("El plan anual aún no está disponible. Elige mensual.");
      return;
    }
    setLoading(tier);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-public", {
        body: { priceId, email: emailToUse },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || "Error iniciando el pago");
      setLoading(null);
    }
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Introduce un email válido");
      return;
    }
    void startCheckout(chosen, email.trim());
  };

  // Palette tokens (green/cyan dark theme)
  const TEAL = "#2DD4BF";
  const TEAL_GLOW = "rgba(45,212,191,0.25)";
  const CARD_BG = "linear-gradient(180deg, rgba(8,30,28,0.85), rgba(4,18,18,0.95))";
  const CARD_BORDER = "1px solid rgba(45,212,191,0.25)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(20,80,70,0.35), rgba(0,0,0,0.95) 60%), #020a09",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="relative w-full max-w-6xl my-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 text-white">
            Empieza tu pago <span style={{ color: TEAL }}>hoy</span>
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
            Cobro inmediato. Sin permanencia. Cancela cuando quieras.
          </p>
          <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>
            ¿Ya tienes cuenta?{" "}
            <Link to="/auth" className="underline" style={{ color: TEAL }}>
              Inicia sesión aquí
            </Link>
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="inline-flex p-1 rounded-full"
            style={{
              background: "rgba(0,0,0,0.5)",
              border: `1px solid ${TEAL}40`,
            }}
          >
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className="px-6 py-2 rounded-full text-sm font-semibold transition-all"
              style={{
                background: billing === "monthly" ? TEAL : "transparent",
                color: billing === "monthly" ? "#021a18" : "rgba(255,255,255,0.7)",
                boxShadow: billing === "monthly" ? `0 0 18px ${TEAL_GLOW}` : "none",
              }}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className="px-6 py-2 rounded-full text-sm font-semibold transition-all"
              style={{
                background: billing === "yearly" ? TEAL : "transparent",
                color: billing === "yearly" ? "#021a18" : "rgba(255,255,255,0.7)",
                boxShadow: billing === "yearly" ? `0 0 18px ${TEAL_GLOW}` : "none",
              }}
            >
              Anual
            </button>
          </div>
          {billing === "yearly" && (
            <p className="text-xs mt-3" style={{ color: TEAL }}>
              <span className="font-bold">Ahorra 30%</span>{" "}
              <span style={{ color: "rgba(255,255,255,0.6)" }}>con planes anuales</span>
            </p>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-5">
          {(Object.entries(PLANS) as [Tier, typeof PLANS[Tier]][]).map(([key, plan]) => {
            const isPop = plan.popular;
            const monthlyPrice = plan.price;
            const yearlyTotal = plan.priceYearly;
            const yearlyPerMonth = +(yearlyTotal / 12).toFixed(2);
            const displayPrice = billing === "yearly" ? yearlyPerMonth : monthlyPrice;
            const originalPrice = billing === "yearly" ? monthlyPrice : null;
            const yearlyAvailable = !!plan.priceIdYearly;

            return (
              <div
                key={key}
                className="relative rounded-2xl p-6 flex flex-col"
                style={{
                  background: CARD_BG,
                  border: isPop ? `1.5px solid ${TEAL}` : CARD_BORDER,
                  boxShadow: isPop
                    ? `0 0 50px -10px ${TEAL_GLOW}, inset 0 1px 0 rgba(255,255,255,0.05)`
                    : "inset 0 1px 0 rgba(255,255,255,0.03)",
                }}
              >
                {/* Plan name + discount badge */}
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-xl font-bold" style={{ color: TEAL }}>
                    {plan.name}
                  </h3>
                  {billing === "yearly" && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(244,63,94,0.2)",
                        color: "#fb7185",
                        border: "1px solid rgba(244,63,94,0.3)",
                      }}
                    >
                      -30%
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-2 mb-1">
                  {originalPrice && (
                    <span
                      className="text-xl line-through"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                    >
                      ${monthlyPrice}
                    </span>
                  )}
                  <span className="text-5xl font-bold" style={{ color: TEAL }}>
                    ${displayPrice}
                  </span>
                  <span className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
                    /mes
                  </span>
                </div>
                <p className="text-xs mb-5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {billing === "yearly"
                    ? `Facturado anualmente a $${yearlyTotal}`
                    : "Facturación mensual"}
                </p>

                {/* CTA */}
                <button
                  type="button"
                  disabled={loading === key || (billing === "yearly" && !yearlyAvailable)}
                  onClick={() => setChosen(key)}
                  className="w-full py-3 rounded-full font-bold text-sm transition-all mb-5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background:
                      isPop || billing === "yearly"
                        ? `linear-gradient(180deg, ${TEAL}, #14b8a6)`
                        : "rgba(45,212,191,0.15)",
                    color: isPop || billing === "yearly" ? "#021a18" : TEAL,
                    border: `1px solid ${TEAL}`,
                    boxShadow:
                      isPop || billing === "yearly" ? `0 8px 28px -8px ${TEAL_GLOW}` : "none",
                  }}
                >
                  {loading === key
                    ? "Cargando..."
                    : billing === "yearly" && !yearlyAvailable
                    ? "Anual no disponible"
                    : "Suscribirse →"}
                </button>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                    >
                      <span
                        className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: TEAL }}
                      >
                        <Check className="w-3 h-3" style={{ color: "#021a18" }} strokeWidth={3} />
                      </span>
                      <span>{f}</span>
                      <Info
                        className="w-3 h-3 mt-1 shrink-0 opacity-40"
                        style={{ color: TEAL }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          Pago seguro vía Stripe · Sin permanencia · Crea tu cuenta tras pagar
        </p>
      </div>

      {/* Email modal */}
      {chosen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ background: CARD_BG, border: `1.5px solid ${TEAL}` }}
          >
            <button
              type="button"
              onClick={() => {
                setChosen(null);
                setEmail("");
              }}
              className="absolute top-3 right-3 text-white/60 hover:text-white"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-1 text-white">
              Plan {PLANS[chosen].name}{" "}
              <span style={{ color: TEAL }}>
                · $
                {billing === "yearly"
                  ? +(PLANS[chosen].priceYearly / 12).toFixed(2)
                  : PLANS[chosen].price}
                /mes
              </span>
            </h2>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.6)" }}>
              {billing === "yearly"
                ? `Cobro único anual de $${PLANS[chosen].priceYearly}.`
                : "Cobro mensual."}{" "}
              Indica tu email para el pago. Tras pagar podrás crear tu cuenta.
            </p>
            <form onSubmit={submitEmail} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="checkout-email" className="text-white">
                  Email
                </Label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: TEAL }}
                  />
                  <Input
                    id="checkout-email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="pl-10 h-11 bg-black/40 text-white"
                    style={{ borderColor: `${TEAL}55` }}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading === chosen}
                className="w-full h-11 font-bold rounded-full"
                style={{
                  background: `linear-gradient(180deg, ${TEAL}, #14b8a6)`,
                  color: "#021a18",
                  boxShadow: `0 8px 28px -8px ${TEAL_GLOW}`,
                }}
              >
                {loading === chosen ? "Redirigiendo a Stripe…" : "Continuar al pago →"}
              </Button>
              <p
                className="text-[11px] text-center"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Pago seguro vía Stripe · Cancela cuando quieras
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Rocket, Crown, Gem, Check, Mail, X } from "lucide-react";
import { PLANS, type Tier } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const ICONS = { rocket: Rocket, crown: Crown, gem: Gem };

interface PaywallProps {
  /** Optional: kept for backwards compatibility with existing imports */
  email?: string;
}

export function Paywall(_props: PaywallProps) {
  const [loading, setLoading] = useState<Tier | null>(null);
  const [chosen, setChosen] = useState<Tier | null>(null);
  const [email, setEmail] = useState("");

  const startCheckout = async (tier: Tier, emailToUse: string) => {
    setLoading(tier);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-public", {
        body: { priceId: PLANS[tier].priceId, email: emailToUse },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-background/80 backdrop-blur-md">
      <div className="relative w-full max-w-6xl my-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            Elige tu <span className="text-primary">edge</span>
          </h1>
          <p className="text-muted-foreground">
            Sin permanencia. Cancela cuando quieras. <strong>Pagas primero, después creas tu cuenta.</strong>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            ¿Ya tienes cuenta? <Link to="/auth" className="text-primary underline">Inicia sesión aquí</Link>
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {(Object.entries(PLANS) as [Tier, typeof PLANS[Tier]][]).map(([key, plan]) => {
            const Icon = ICONS[plan.icon];
            const isPop = plan.popular;
            return (
              <div
                key={key}
                className={`relative rounded-2xl p-6 flex flex-col bg-card/95 backdrop-blur ${
                  isPop
                    ? "border-2 border-primary shadow-[0_0_40px_-10px_hsl(var(--primary)/0.5)]"
                    : "border border-border"
                }`}
              >
                {isPop && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1">
                    ⭐ MÁS POPULAR
                  </div>
                )}

                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mb-5">
                  <Icon className={`w-5 h-5 ${isPop ? "text-primary" : "text-foreground"}`} />
                </div>

                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground text-sm">/mes</span>
                </div>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${isPop ? "text-primary" : "text-green-500"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${isPop ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                  variant={isPop ? "default" : "outline"}
                  disabled={loading === key}
                  onClick={() => setChosen(key)}
                >
                  {loading === key ? "Cargando..." : "Empezar prueba"}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Pago seguro vía Stripe · Cancela durante la prueba sin cargo · Crea tu cuenta tras pagar
        </p>
      </div>

      {chosen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => { setChosen(null); setEmail(""); }}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-1">Plan {PLANS[chosen].name} · ${PLANS[chosen].price}/mes</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Indica tu email. Lo usaremos para el pago y, al volver, podrás crear tu cuenta con ese mismo email.
            </p>
            <form onSubmit={submitEmail} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="checkout-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="checkout-email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 font-bold" disabled={loading === chosen}>
                {loading === chosen ? "Redirigiendo a Stripe…" : "Continuar al pago →"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Pago seguro · 7 días de prueba · Cancela cuando quieras
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

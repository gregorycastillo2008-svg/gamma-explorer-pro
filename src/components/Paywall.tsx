import { useState } from "react";
import { Rocket, Crown, Gem, Check, Sparkles, LogOut } from "lucide-react";
import { PLANS, type Tier } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const ICONS = { rocket: Rocket, crown: Crown, gem: Gem };

interface PaywallProps {
  email?: string;
}

export function Paywall({ email }: PaywallProps) {
  const [loading, setLoading] = useState<Tier | null>(null);
  const nav = useNavigate();

  const subscribe = async (tier: Tier) => {
    setLoading(tier);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: PLANS[tier].priceId },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Error creating checkout");
    } finally {
      setLoading(null);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); nav("/"); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-background/80 backdrop-blur-md">
      <div className="relative w-full max-w-6xl my-8">
        {/* Top bar with sign out */}
        <div className="absolute -top-2 right-0 flex items-center gap-3">
          {email && (
            <span className="text-xs text-muted-foreground hidden md:inline">{email}</span>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Todos los planes con 7 días de prueba
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            Elige tu <span className="text-primary">edge</span>
          </h1>
          <p className="text-muted-foreground">
            Sin permanencia. Cancela cuando quieras. Aplica un código de descuento al pagar.
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
                  onClick={() => subscribe(key)}
                >
                  {loading === key ? "Cargando..." : "Empezar prueba"}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Pago seguro vía Stripe · Cancela en cualquier momento durante la prueba sin cargo
        </p>
      </div>
    </div>
  );
}

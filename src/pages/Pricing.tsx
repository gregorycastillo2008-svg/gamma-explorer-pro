import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";
import { PLANS, type Tier } from "@/lib/plans";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Pricing() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const { subscribed } = useSubscription(user?.id);
  const nav = useNavigate();
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState<Tier | null>(null);

  const canAccessDashboard = isAdmin || subscribed;
  const signOut = async () => { await supabase.auth.signOut(); nav("/"); };

  const handleSubscribe = async (tier: Tier) => {
    if (!user) { nav("/auth"); return; }
    setLoading(tier);
    try {
      const priceId = PLANS[tier][interval].priceId;
      const { data, error } = await supabase.functions.invoke("create-checkout", { body: { priceId } });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Error creating checkout");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Choose your plan</h1>
          <p className="text-muted-foreground mb-6">Real-time options analytics. Cancel anytime.</p>
          <div className="inline-flex p-1 bg-muted rounded-lg">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-4 py-2 rounded text-sm font-medium ${interval === "monthly" ? "bg-background shadow" : "text-muted-foreground"}`}
            >Monthly</button>
            <button
              onClick={() => setInterval("yearly")}
              className={`px-4 py-2 rounded text-sm font-medium ${interval === "yearly" ? "bg-background shadow" : "text-muted-foreground"}`}
            >Yearly <span className="text-primary text-xs">(2 months free)</span></button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {(Object.keys(PLANS) as Tier[]).map((tier) => {
            const plan = PLANS[tier];
            const price = plan[interval].amount;
            const isPro = tier === "pro";
            return (
              <Card key={tier} className={`p-6 flex flex-col ${isPro ? "border-primary border-2 relative" : ""}`}>
                {isPro && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-bold">MOST POPULAR</div>}
                <h2 className="text-2xl font-bold">{plan.name}</h2>
                <div className="mt-4 mb-6">
                  <span className="text-4xl font-bold">${price}</span>
                  <span className="text-muted-foreground">/{interval === "monthly" ? "mo" : "yr"}</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isPro ? "default" : "outline"}
                  disabled={loading === tier}
                  onClick={() => handleSubscribe(tier)}
                >
                  {loading === tier ? "Loading..." : `Subscribe to ${plan.name}`}
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-8">
          <Button variant="ghost" onClick={() => nav("/dashboard")}>Back to dashboard</Button>
        </div>
      </div>
    </div>
  );
}

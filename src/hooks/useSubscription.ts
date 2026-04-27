import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tier } from "@/lib/plans";

export interface SubState {
  loading: boolean;
  subscribed: boolean;
  tier: Tier | null;
  interval: "month" | "year" | null;
  subscriptionEnd: string | null;
  refresh: () => Promise<void>;
}

export function useSubscription(userId?: string): SubState {
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [interval, setInterval] = useState<"month" | "year" | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setSubscribed(!!data?.subscribed);
      setTier((data?.tier as Tier) ?? null);
      setInterval((data?.interval as "month" | "year") ?? null);
      setSubscriptionEnd(data?.subscription_end ?? null);
    } catch (e) {
      console.error("[useSubscription]", e);
      setSubscribed(false);
      setTier(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { loading, subscribed, tier, interval, subscriptionEnd, refresh };
}

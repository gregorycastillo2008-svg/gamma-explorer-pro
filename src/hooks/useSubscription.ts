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

const CACHE_KEY = "gex_sub_v1";
const CACHE_TTL = 8 * 60 * 1000; // 8 minutes

interface CachedSub { subscribed: boolean; tier: Tier | null; interval: "month" | "year" | null; subscriptionEnd: string | null; ts: number; }

function readCache(userId?: string): CachedSub | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}_${userId}`);
    if (!raw) return null;
    const c: CachedSub = JSON.parse(raw);
    if (Date.now() - c.ts > CACHE_TTL) return null;
    return c;
  } catch { return null; }
}

function writeCache(userId: string, data: Omit<CachedSub, "ts">) {
  try {
    localStorage.setItem(`${CACHE_KEY}_${userId}`, JSON.stringify({ ...data, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function useSubscription(userId?: string): SubState {
  // Instant initial state from cache — no spinner for returning users.
  const cached = readCache(userId);
  const [loading,         setLoading]         = useState(!cached);
  const [subscribed,      setSubscribed]       = useState(cached?.subscribed ?? false);
  const [tier,            setTier]             = useState<Tier | null>(cached?.tier ?? null);
  const [interval,        setInterval]         = useState<"month" | "year" | null>(cached?.interval ?? null);
  const [subscriptionEnd, setSubscriptionEnd]  = useState<string | null>(cached?.subscriptionEnd ?? null);

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      // 5-second timeout on the Edge Function — never hang the UI
      const ctrl = new AbortController();
      const t    = window.setTimeout(() => ctrl.abort(), 5000);
      const { data, error } = await supabase.functions.invoke("check-subscription", { signal: ctrl.signal as any });
      window.clearTimeout(t);
      if (error) throw error;
      const next = {
        subscribed:      !!data?.subscribed,
        tier:            (data?.tier as Tier) ?? null,
        interval:        (data?.interval as "month" | "year") ?? null,
        subscriptionEnd: data?.subscription_end ?? null,
      };
      setSubscribed(next.subscribed);
      setTier(next.tier);
      setInterval(next.interval);
      setSubscriptionEnd(next.subscriptionEnd);
      writeCache(userId, next);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("[useSubscription]", e);
      // On error keep cached values — don't flash paywall on network hiccup
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (cached) {
      // Already have data — background refresh without blocking UI
      refresh();
    } else {
      refresh();
    }
  }, [refresh]);

  return { loading, subscribed, tier, interval, subscriptionEnd, refresh };
}

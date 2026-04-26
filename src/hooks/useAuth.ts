import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let initialSessionReady = false;

    const applySession = (nextSession: Session | null, ready = false) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (ready || initialSessionReady) setLoading(false);
    };

    const failSafe = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) console.error("useAuth:", error);
        initialSessionReady = true;
        applySession(data.session, true);
      })
      .catch((error) => {
        console.error("useAuth:", error);
        initialSessionReady = true;
        applySession(null, true);
      })
      .finally(() => window.clearTimeout(failSafe));

    return () => {
      mounted = false;
      window.clearTimeout(failSafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, loading };
}

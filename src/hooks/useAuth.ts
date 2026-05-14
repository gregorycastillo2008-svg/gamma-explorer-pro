import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

// Read Supabase session synchronously from localStorage — no network, instant.
function readLocalSession(): Session | null {
  try {
    for (const [k, v] of Object.entries(localStorage)) {
      if (!k.includes("-auth-token") && !k.includes("supabase.auth.token")) continue;
      const parsed = JSON.parse(v);
      const s: Session = parsed?.currentSession ?? parsed;
      if (s?.access_token && s?.expires_at && s.expires_at * 1000 > Date.now()) return s;
    }
  } catch { /* ignore */ }
  return null;
}

export function useAuth() {
  // Use locally-cached session as instant initial state — avoids any loading flash.
  const initial = readLocalSession();
  const [session, setSession]   = useState<Session | null>(initial);
  const [user,    setUser]      = useState<User | null>(initial?.user ?? null);
  const [loading, setLoading]   = useState(!initial); // already loaded if we have local session

  useEffect(() => {
    let mounted = true;

    const applySession = (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    };

    // Failsafe: never spin longer than 1.5 s
    const failSafe = window.setTimeout(() => { if (mounted) setLoading(false); }, 1500);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null))
      .finally(() => window.clearTimeout(failSafe));

    return () => {
      mounted = false;
      window.clearTimeout(failSafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, loading };
}

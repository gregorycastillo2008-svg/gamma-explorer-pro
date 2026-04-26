import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          if (mounted) { setIsAdmin(false); setLoading(false); }
          return;
        }
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (mounted) {
          if (error) console.error("useIsAdmin:", error);
          setIsAdmin(!!data);
          setLoading(false);
        }
      } catch (e) {
        console.error("useIsAdmin:", e);
        if (mounted) { setIsAdmin(false); setLoading(false); }
      }
    };

    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return { isAdmin, loading };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (mounted) { setIsAdmin(false); setLoading(false); } return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (mounted) { setIsAdmin(!!data); setLoading(false); }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return { isAdmin, loading };
}

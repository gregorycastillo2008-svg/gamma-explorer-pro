import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin(userId?: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return () => { mounted = false; };
    }

    setLoading(true);
    supabase
      .rpc("has_role", { _user_id: userId, _role: "admin" })
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) console.error("useIsAdmin:", error);
        setIsAdmin(Boolean(data));
        setLoading(false);
      })
      .catch((error) => {
        if (!mounted) return;
        console.error("useIsAdmin:", error);
        setIsAdmin(false);
        setLoading(false);
      });

    return () => { mounted = false; };
  }, [userId]);

  return { isAdmin, loading };
}

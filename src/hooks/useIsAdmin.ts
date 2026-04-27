import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin(userId?: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const failSafe = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    const checkRole = async () => {
      if (!userId) {
        if (mounted) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      if (mounted) setLoading(true);
      try {
        const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
        if (!mounted) return;
        if (error) console.error("useIsAdmin:", error);
        setIsAdmin(Boolean(data));
      } catch (error) {
        if (!mounted) return;
        console.error("useIsAdmin:", error);
        setIsAdmin(false);
      } finally {
        if (mounted) setLoading(false);
        window.clearTimeout(failSafe);
      }
    };

    checkRole();
    return () => {
      mounted = false;
      window.clearTimeout(failSafe);
    };
  }, [userId]);

  return { isAdmin, loading };
}

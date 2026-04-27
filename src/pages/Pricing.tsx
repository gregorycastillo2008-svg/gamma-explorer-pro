import { Paywall } from "@/components/Paywall";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Pricing() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => { if (!loading && !user) nav("/auth"); }, [user, loading, nav]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Paywall email={user?.email ?? undefined} />
    </div>
  );
}

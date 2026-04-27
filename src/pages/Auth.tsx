import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AllGammaLogo } from "@/components/AllGammaLogo";
import { GammaBackgroundDark } from "@/components/GammaBackgroundDark";
import { useTypewriter } from "@/hooks/useTypewriter";
import { Sparkles, Mail, Lock, ArrowRight, ArrowLeft, ShieldCheck, AlertTriangle } from "lucide-react";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Verified Stripe checkout state
  const [verifying, setVerifying] = useState(false);
  const [paidEmail, setPaidEmail] = useState<string | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setVerifying(true);
    setPaidError(null);
    fetch(
      `https://ikvwejdepfvjuofcnbww.supabase.co/functions/v1/verify-checkout-session?session_id=${encodeURIComponent(sessionId)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data?.valid && data?.email) {
          setPaidEmail(data.email);
          setEmail(data.email);
        } else {
          setPaidError("No pudimos verificar tu pago. Si acabas de pagar, espera unos segundos y recarga.");
        }
      })
      .catch(() => setPaidError("Error verificando el pago."))
      .finally(() => setVerifying(false));
  }, [sessionId]);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast({ title: "Error de acceso", description: error.message, variant: "destructive" });
    else nav("/dashboard");
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paidEmail) {
      toast({
        title: "Pago requerido",
        description: "Para crear una cuenta primero debes completar el pago.",
        variant: "destructive",
      });
      return;
    }
    if (email.trim().toLowerCase() !== paidEmail.toLowerCase()) {
      toast({
        title: "Email no coincide",
        description: `Debes usar el mismo email del pago: ${paidEmail}`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: paidEmail,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setBusy(false);
    if (error) toast({ title: "Error al registrarse", description: error.message, variant: "destructive" });
    else {
      toast({ title: "¡Cuenta creada!", description: "Iniciando sesión…" });
      // Try to sign in immediately (works if email confirmation is disabled)
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: paidEmail, password });
      if (!signInErr) nav("/dashboard");
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden" style={{ background: "#000" }}>
      <div className="absolute inset-0 opacity-50">
        <GammaBackgroundDark />
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 80%)" }} />

      <Link to="/" className="absolute top-5 right-5 z-30 group">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.08, x: -3 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur-md cursor-pointer"
          style={{
            background: "rgba(20,15,5,0.7)",
            border: "1px solid rgba(255,215,0,0.4)",
            boxShadow: "0 8px 24px rgba(255,215,0,0.2)",
            color: "#ffd700",
          }}
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold tracking-wide">Volver a planes e info</span>
        </motion.div>
      </Link>

      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 500, height: 500, background: "radial-gradient(circle, rgba(255,215,0,0.18) 0%, transparent 70%)", top: "-10%", left: "-10%" }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 600, height: 600, background: "radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)", bottom: "-15%", right: "-10%" }}
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.6, 0.3, 0.6] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8">
          <AllGammaLogo size="lg" />
        </div>

        <div className="relative">
          <motion.div
            className="absolute -inset-1 rounded-[3rem] pointer-events-none"
            style={{
              background: "conic-gradient(from 0deg, #ffd700, #b8860b, #fff5cc, #d4af37, #ffd700)",
              filter: "blur(8px)",
              opacity: 0.7,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />

          <div
            className="relative rounded-[3rem] p-8 backdrop-blur-xl"
            style={{
              background: "linear-gradient(135deg, rgba(20,20,20,0.95) 0%, rgba(10,8,3,0.95) 100%)",
              border: "1px solid rgba(255,215,0,0.3)",
              boxShadow: "0 30px 80px -10px rgba(255,215,0,0.25), inset 0 1px 0 rgba(255,215,0,0.2)",
            }}
          >
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3 text-white"
                style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.4)" }}
              >
                <Sparkles className="h-3 w-3" /> Acceso Premium
              </div>
              <h2 className="text-2xl font-black bg-clip-text text-secondary-foreground"
                style={{ backgroundImage: "linear-gradient(90deg, #fff5cc, #ffd700, #b8860b)" }}
              >
                {paidEmail ? "¡Pago confirmado!" : "Bienvenido de nuevo"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {paidEmail ? "Crea tu contraseña para activar tu cuenta" : "Análisis Gamma Exposure profesional"}
              </p>
            </div>

            <Tabs defaultValue={paidEmail ? "signup" : "signin"}>
              <TabsList
                className="h-10 items-center justify-center grid grid-cols-2 w-full mb-6 rounded-full p-1"
                style={{ background: "rgba(30,64,175,0.15)", border: "1px solid rgba(30,64,175,0.5)" }}
              >
                <TabsTrigger value="signin" className="rounded-full text-white data-[state=active]:bg-[#1e40af] data-[state=active]:text-white data-[state=active]:font-bold">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-full text-white data-[state=active]:bg-[#1e40af] data-[state=active]:text-white data-[state=active]:font-bold">Crear cuenta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4">
                  <FieldGold id="e1" label="Email" type="email" value={email} onChange={setEmail} icon={Mail}
                    placeholderWords={["trader@allgamma.com", "pro@allgamma.com", "elite@allgamma.com"]} />
                  <FieldGold id="p1" label="Contraseña" type="password" value={password} onChange={setPassword} icon={Lock}
                    placeholderWords={["••••••••••"]} />
                  <GoldButton busy={busy}>Entrar al panel</GoldButton>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                {verifying && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Verificando tu pago…
                  </div>
                )}

                {!verifying && paidEmail && (
                  <>
                    <div className="mb-4 flex items-start gap-2 rounded-2xl p-3 text-xs"
                      style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.35)", color: "#86efac" }}
                    >
                      <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        Pago verificado para <strong className="font-mono">{paidEmail}</strong>. Crea tu contraseña para terminar.
                      </div>
                    </div>
                    <form onSubmit={signUp} className="space-y-4">
                      <FieldGold id="e2" label="Email (de tu pago)" type="email" value={email} onChange={() => {}} icon={Mail} disabled
                        placeholderWords={[paidEmail]} />
                      <FieldGold id="p2" label="Crea tu contraseña" type="password" value={password} onChange={setPassword} icon={Lock} minLength={6}
                        placeholderWords={["mínimo 6 caracteres", "GammaFlip2025!", "DealerEdge*99"]} />
                      <GoldButton busy={busy}>Crear cuenta y entrar</GoldButton>
                    </form>
                  </>
                )}

                {!verifying && !paidEmail && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2 rounded-2xl p-4 text-xs"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)", color: "#fca5a5" }}
                    >
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        {paidError ?? "Para crear una cuenta primero debes elegir un plan y completar el pago."}
                      </div>
                    </div>
                    <Link to="/pricing" className="block">
                      <Button type="button" className="w-full rounded-full h-12 font-bold text-black"
                        style={{
                          background: "linear-gradient(90deg, #b8860b, #ffd700, #fff5cc, #ffd700, #b8860b)",
                          boxShadow: "0 8px 24px rgba(255,215,0,0.4)",
                        }}>
                        Ver planes y pagar
                      </Button>
                    </Link>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-6 pt-4 text-center text-[11px] text-muted-foreground"
              style={{ borderTop: "1px solid rgba(255,215,0,0.15)" }}
            >
              🔒 Conexión segura cifrada
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function FieldGold({ id, label, type, value, onChange, icon: Icon, minLength, placeholderWords, disabled }: any) {
  const demo = useTypewriter(placeholderWords ?? [""], { typeMs: 85, deleteMs: 40, pauseMs: 1300 });
  return (
    <div className="space-y-1.5 text-secondary-foreground">
      <Label htmlFor={id} className="text-xs font-semibold tracking-wide text-secondary-foreground">{label}</Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 z-10 text-destructive-foreground" />
        <Input
          id={id}
          type={type}
          required
          minLength={minLength}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex w-full border border-input px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 md:text-sm pl-10 rounded-full h-11 bg-black/40 focus:bg-black/60 transition-colors relative text-secondary-foreground"
          style={{ border: "1px solid rgba(255,215,0,0.3)" }}
        />
        {!value && (
          <div className="absolute left-10 top-1/2 -translate-y-1/2 pointer-events-none flex items-center text-sm font-mono"
            style={{ color: "rgba(255,215,0,0.55)" }}
          >
            <span>{demo}</span>
            <span className="ml-0.5 inline-block w-[2px] h-4 bg-[#ffd700] animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

function GoldButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button
      type="submit"
      disabled={busy}
      className="w-full rounded-full h-12 font-bold text-white hover:scale-[1.02] transition-transform group"
      style={{
        background: "linear-gradient(90deg, #1e40af, #3b82f6, #ffffff, #3b82f6, #1e40af)",
        backgroundSize: "200% 100%",
        boxShadow: "0 8px 24px rgba(30,64,175,0.45)",
        color: "#fff",
      }}
    >
      <span className="flex items-center justify-center gap-2">
        {busy ? "..." : children}
        {!busy && <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform text-white" />}
      </span>
    </Button>
  );
}

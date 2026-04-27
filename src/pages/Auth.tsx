import { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
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
import { Sparkles, Mail, Lock, ArrowRight, ArrowLeft } from "lucide-react";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setBusy(false);
    if (error) toast({ title: "Error al registrarse", description: error.message, variant: "destructive" });
    else toast({ title: "¡Cuenta creada!", description: "Ya puedes iniciar sesión." });
  };

  // Login admin: si la cuenta no existe, la crea (el trigger asignará rol admin); luego entra.
  const ADMIN_EMAIL = "gregory0322@allgamma.com";
  const ADMIN_PASS  = "Gregory0322!Admin";
  const adminLogin = async () => {
    setBusy(true);
    let { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (error && /invalid|credentials|not.?found/i.test(error.message)) {
      // primer login: crear la cuenta admin
      const { error: signErr } = await supabase.auth.signUp({
        email: ADMIN_EMAIL, password: ADMIN_PASS,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (signErr) { setBusy(false); toast({ title: "Error", description: signErr.message, variant: "destructive" }); return; }
      // intentar login otra vez
      const retry = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
      error = retry.error;
    }
    setBusy(false);
    if (error) toast({ title: "Error admin", description: error.message, variant: "destructive" });
    else { toast({ title: "Admin", description: "Bienvenido Gregory" }); nav("/dashboard"); }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden" style={{ background: "#000" }}>
      {/* Animated gamma chart background (green/red bars) */}
      <div className="absolute inset-0 opacity-50">
        <GammaBackgroundDark />
      </div>
      {/* Vignette to keep card readable */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 80%)" }} />

      {/* Back to landing arrow */}
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

      {/* Animated gold orbs */}
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
      {/* Floating particles */}
      {Array.from({ length: 15 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 3, height: 3,
            background: "#ffd700",
            boxShadow: "0 0 8px #ffd700",
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
          animate={{ y: [0, -40, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 4 + Math.random() * 4, repeat: Infinity, delay: Math.random() * 4, ease: "easeInOut" }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8">
          <AllGammaLogo size="lg" />
        </div>

        {/* Outer rotating gold ring */}
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
          <motion.div
            className="absolute -inset-px rounded-[3rem] pointer-events-none"
            style={{
              background: "conic-gradient(from 180deg, #ffd700, transparent, #d4af37, transparent, #ffd700)",
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          />

          {/* Card */}
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
                style={{
                  background: "rgba(255,215,0,0.1)",
                  border: "1px solid rgba(255,215,0,0.4)",
                }}
              >
                <Sparkles className="h-3 w-3" /> Acceso Premium
              </div>
              <h2 className="text-2xl font-black bg-clip-text text-secondary-foreground"
                style={{ backgroundImage: "linear-gradient(90deg, #fff5cc, #ffd700, #b8860b)" }}
              >
                Bienvenido de nuevo
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Análisis Gamma Exposure profesional</p>
            </div>

            <Tabs defaultValue="signin">
              <TabsList
                className="h-10 items-center justify-center grid grid-cols-2 w-full mb-6 rounded-full p-1 text-secondary-foreground bg-secondary-foreground"
                style={{ border: "1px solid rgba(255,215,0,0.2)" }}
              >
                <TabsTrigger value="signin" className="rounded-full data-[state=active]:text-black data-[state=active]:font-bold bg-primary">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-full data-[state=active]:text-black data-[state=active]:font-bold bg-primary">Crear cuenta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4">
                  <FieldGold id="e1" label="Email" type="email" value={email} onChange={setEmail} icon={Mail}
                    placeholderWords={["trader@allgamma.com", "pro@allgamma.com", "elite@allgamma.com", "demo@allgamma.com"]} />
                  <FieldGold id="p1" label="Contraseña" type="password" value={password} onChange={setPassword} icon={Lock}
                    placeholderWords={["••••••••••", "GammaFlip2025!", "CallWall$420", "PutWall#108"]} />
                  <div className="flex gap-2">
                    <div className="flex-1"><GoldButton busy={busy}>Entrar al panel</GoldButton></div>
                    <Button
                      type="button"
                      onClick={adminLogin}
                      disabled={busy}
                      className="rounded-full h-12 px-5 font-bold border hover:scale-[1.02] transition-transform"
                      style={{
                        background: "linear-gradient(135deg, #1a1a1a, #2a2a2a)",
                        color: "#ffd700",
                        border: "1px solid rgba(255,215,0,0.5)",
                        boxShadow: "0 8px 24px rgba(255,215,0,0.2)",
                      }}
                      title="Acceso administrador"
                    >
                      Admin
                    </Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-4">
                  <FieldGold id="e2" label="Email" type="email" value={email} onChange={setEmail} icon={Mail}
                    placeholderWords={["nuevo@allgamma.com", "trader@allgamma.com", "vip@allgamma.com"]} />
                  <FieldGold id="p2" label="Contraseña" type="password" value={password} onChange={setPassword} icon={Lock} minLength={6}
                    placeholderWords={["GammaFlip2025!", "CallWall$420", "PutWall#108", "DealerEdge*99"]} />
                  <GoldButton busy={busy}>Crear mi cuenta</GoldButton>
                </form>
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

function FieldGold({ id, label, type, value, onChange, icon: Icon, minLength, placeholderWords }: any) {
  const demo = useTypewriter(placeholderWords ?? [""], { typeMs: 85, deleteMs: 40, pauseMs: 1300 });
  return (
    <div className="space-y-1.5 text-secondary-foreground">
      <Label htmlFor={id} className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs font-semibold tracking-wide text-secondary-foreground">{label}</Label>
      <div className="relative">
        <Icon className="lucide lucide-lock absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 z-10 text-destructive-foreground" />
        <Input
          id={id}
          type={type}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex w-full border border-input px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pl-10 rounded-full h-11 bg-black/40 focus:bg-black/60 transition-colors relative text-secondary-foreground"
          style={{ border: "1px solid rgba(255,215,0,0.3)" }}
        />
        {/* Animated demo placeholder — only when empty */}
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
      className="w-full rounded-full h-12 font-bold text-black hover:scale-[1.02] transition-transform group"
      style={{
        background: "linear-gradient(90deg, #b8860b, #ffd700, #fff5cc, #ffd700, #b8860b)",
        backgroundSize: "200% 100%",
        boxShadow: "0 8px 24px rgba(255,215,0,0.4)",
      }}
    >
      <span className="flex items-center justify-center gap-2">
        {busy ? "..." : children}
        {!busy && <ArrowRight className="lucide lucide-arrow-right h-4 w-4 group-hover:translate-x-1 transition-transform text-destructive" />}
      </span>
    </Button>
  );
}

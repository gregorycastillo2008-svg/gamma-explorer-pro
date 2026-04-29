import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Shield, Zap, TrendingUp, LineChart, Layers, BadgeCheck, Target, Eye, Sparkles, Copy, Info, X, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Scroll3DGallery } from "@/components/Scroll3DGallery";
import { RadarMap } from "@/components/RadarMap";
import { TestimonialsMarquee } from "@/components/TestimonialsMarquee";
import { PlansSection } from "@/components/PlansSection";
import { tryAdminLogin } from "@/lib/adminBypass";
import { toast } from "sonner";

const features = [
  { icon: BarChart3, title: "GEX por strike", desc: "Visualiza Gamma Exposure agregada por strike con detección automática de Call/Put walls." },
  { icon: LineChart, title: "Griegas avanzadas", desc: "Delta, Vega, Vanna y Charm exposure agregados para entender el posicionamiento dealer." },
  { icon: Zap, title: "Gamma Flip", desc: "Localiza el punto donde el régimen pasa de gamma positivo a negativo." },
  { icon: Layers, title: "Watchlist multi-ticker", desc: "Sigue SPX, SPY, QQQ, NDX y tus tickers favoritos en un solo panel." },
  { icon: TrendingUp, title: "Niveles clave", desc: "Soportes y resistencias derivados del posicionamiento de opciones." },
  { icon: Shield, title: "Acceso seguro", desc: "Tu cuenta y tu watchlist protegidas con autenticación moderna." },
];



const testimonials = [
  { name: "Carlos M.", role: "Day Trader · SPX", rating: 5, text: "Llevo 8 meses con GEXSATELIT. El gamma flip me salvó de varios drawdowns brutales. Imprescindible.", extra: "Cliente desde 2024 · +320% portfolio" },
  { name: "Ana L.", role: "Options Trader · QQQ", rating: 5, text: "Las call/put walls funcionan como imanes. Es la herramienta más precisa que he probado.", extra: "Win rate subió del 54% al 71%" },
  { name: "David R.", role: "Quant · Hedge Fund", rating: 5, text: "La latencia y la calidad de datos son institucionales. El precio es ridículamente bajo para lo que entrega.", extra: "Reemplazó software de $2k/mes" },
  { name: "Sofía P.", role: "Swing Trader", rating: 5, text: "El AI Bias me dice exactamente cuándo el régimen cambia. Operar contra dealers ya no me pasa.", extra: "Suscriptora Pro Elite" },
];
const heroWords = ["gamma", "options flow", "volatility", "analysis"];

export default function Landing() {
  const { user } = useAuth();
  const [showInfo, setShowInfo] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPwd, setAdminPwd] = useState("");
  const navigate = useNavigate();
  const [wordIdx, setWordIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWordIdx((i) => (i + 1) % heroWords.length), 2600);
    return () => clearInterval(t);
  }, []);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Código ${code} copiado · ¡aplícalo al pagar!`);
  };

  return (
    <div className="gold-theme relative min-h-screen overflow-hidden my-0 opacity-100" style={{ background: "#000000" }}>
      {/* Pure black background with subtle blue vignette */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at top, rgba(59,130,246,0.08), transparent 65%)" }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full" style={{ background: "radial-gradient(circle, rgba(37,99,235,0.10), transparent 70%)", filter: "blur(60px)" }} />
      </div>

      {/* Floating "Ver Planes" CTA bubble — eliminado */}
      <header className="relative z-10 flex items-center justify-between py-5 px-8 bg-black/40 backdrop-blur-sm">
        <Link to="/" className="hover:scale-105 transition-transform flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-lg flex items-center justify-center shadow-[0_0_18px_rgba(37,99,235,0.55)] bg-[#135acd]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </span>
          <span className="font-bold text-white text-xl tracking-tight">GEX SATELIT</span>
        </Link>
        <nav className="hidden md:flex items-center gap-4 text-sm text-white/70">
          <a href="#features" className="nav-glow hover:text-white transition-colors font-mono text-base">Features</a>
          <a href="#capabilities" className="nav-glow hover:text-white transition-colors text-base font-mono">Capabilities</a>
          <a href="#planes" className="nav-glow hover:text-white transition-colors text-base font-mono">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="#planes">
            <Button variant="outline" className="rounded-lg px-4 font-semibold border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent">
              Planes
            </Button>
          </a>
          <button
            onClick={() => setShowInfo(true)}
            className="h-9 w-9 rounded-lg border border-white/20 flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Información"
            title="Información"
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAdminOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-lg border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF] hover:bg-[#2DD4BF]/20 transition-colors text-xs font-mono uppercase tracking-wider font-bold"
            title="Acceso admin"
          >
            <Shield className="h-3.5 w-3.5" />
            Admin
          </button>
          {user ? (
            <Link to="/dashboard">
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg px-5 font-semibold">Obtener acceso</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg px-5 font-semibold">Obtener acceso</Button>
            </Link>
          )}
        </div>
      </header>

      {/* Admin access modal — same teal interface used in Paywall */}
      <AnimatePresence>
        {adminOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            style={{
              background: "radial-gradient(ellipse at top, rgba(20,80,70,0.35), rgba(0,0,0,0.95) 60%), rgba(2,10,9,0.85)",
              backdropFilter: "blur(8px)",
            }}
            onClick={() => { setAdminOpen(false); setAdminName(""); setAdminPwd(""); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
              style={{
                background: "linear-gradient(180deg, rgba(8,30,28,0.95), rgba(4,18,18,0.98))",
                border: "1.5px solid #2DD4BF",
                boxShadow: "0 0 50px -10px rgba(45,212,191,0.35)",
              }}
            >
              <button
                type="button"
                onClick={() => { setAdminOpen(false); setAdminName(""); setAdminPwd(""); }}
                className="absolute top-3 right-3 text-white/60 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5" style={{ color: "#2DD4BF" }} />
                <h2 className="text-xl font-bold text-white">Acceso admin</h2>
              </div>
              <p className="text-xs mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
                Acceso directo al terminal sin pago.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tryAdminLogin(adminName, adminPwd)) {
                    toast.success("Acceso admin concedido");
                    setAdminOpen(false);
                    navigate("/dashboard");
                  } else {
                    toast.error("Credenciales incorrectas");
                  }
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="landing-admin-name" className="text-white">Nombre</Label>
                  <Input
                    id="landing-admin-name"
                    required
                    autoFocus
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="admin"
                    className="h-11 bg-black/40 text-white"
                    style={{ borderColor: "rgba(45,212,191,0.35)" }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="landing-admin-pwd" className="text-white">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#2DD4BF" }} />
                    <Input
                      id="landing-admin-pwd"
                      type="password"
                      required
                      value={adminPwd}
                      onChange={(e) => setAdminPwd(e.target.value)}
                      className="pl-10 h-11 bg-black/40 text-white"
                      style={{ borderColor: "rgba(45,212,191,0.35)" }}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 font-bold rounded-full"
                  style={{
                    background: "linear-gradient(180deg, #2DD4BF, #14b8a6)",
                    color: "#021a18",
                    boxShadow: "0 8px 28px -8px rgba(45,212,191,0.45)",
                  }}
                >
                  Entrar
                </Button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-card border border-primary/30 p-8 shadow-2xl"
              style={{ boxShadow: "0 30px 80px -20px rgba(255,215,0,0.25)" }}
            >
              <button
                onClick={() => setShowInfo(false)}
                className="absolute top-4 right-4 h-8 w-8 rounded-full bg-background/60 hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 rounded-lg bg-[#135acd] flex items-center justify-center">
                  <Info className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Información de GEX SATELIT</h2>
              </div>

              <div className="space-y-5 text-sm text-foreground/90 leading-relaxed">
                <section>
                  <h3 className="font-bold text-base text-primary mb-1.5">¿Qué es GEX SATELIT?</h3>
                  <p>
                    GEX SATELIT es una plataforma profesional de análisis de <strong>Gamma Exposure</strong> en
                    tiempo real. Te ayuda a entender el posicionamiento de los dealers de opciones en SPX,
                    SPY, QQQ, NDX y otros tickers principales.
                  </p>
                </section>

                <section>
                  <h3 className="font-bold text-base text-primary mb-1.5">¿Para quién es?</h3>
                  <p>
                    Para day traders, swing traders, traders de opciones y quants que quieren anticipar
                    soportes, resistencias y cambios de régimen del mercado con base estadística.
                  </p>
                </section>

                <section>
                  <h3 className="font-bold text-base text-primary mb-1.5">Métricas que ofrecemos</h3>
                  <ul className="list-disc list-inside space-y-1 text-foreground/85">
                    <li><strong>GEX</strong> — Gamma Exposure agregada por strike</li>
                    <li><strong>DEX</strong> — Delta Exposure dealer</li>
                    <li><strong>VEX, Vanna y Charm</strong> — griegas de segundo y tercer orden</li>
                    <li><strong>Call Wall / Put Wall</strong> — niveles magnéticos clave</li>
                    <li><strong>Gamma Flip</strong> — punto donde cambia el régimen</li>
                    <li><strong>IV Surface 3D</strong> — superficie de volatilidad implícita</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-bold text-base text-primary mb-1.5">Tecnología</h3>
                  <p>
                    Datos con latencia menor a 200&nbsp;ms, uptime del 99.9%, alertas push, AI Bias diario y
                    acceso vía API en el plan Elite. Todo accesible desde un dashboard intuitivo.
                  </p>
                </section>

                <section>
                  <h3 className="font-bold text-base text-primary mb-1.5">Planes y precios</h3>
                  <p>
                    Tres planes: <strong>Starter</strong> ($29.99), <strong>Pro</strong> ($79.99) y{" "}
                    <strong>Elite</strong> ($159.99) al mes. Sin permanencia. Aplica códigos de descuento al
                    pagar.
                  </p>
                </section>

                <section>
                  <h3 className="font-bold text-base text-primary mb-1.5">Aviso legal</h3>
                  <p className="text-xs text-muted-foreground">
                    GEX SATELIT es una herramienta educativa. Los datos mostrados pueden ser simulados con
                    fines demostrativos. No constituye asesoramiento financiero.
                  </p>
                </section>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowInfo(false)}>Cerrar</Button>
                <a href="#planes" onClick={() => setShowInfo(false)}>
                  <Button>Ver planes</Button>
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="relative z-10 container pt-2 pb-20">
        {/* Radar — arriba a la izquierda, cerca del logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="absolute -top-2 left-2 md:left-6 z-0 pointer-events-none"
        >
          <RadarMap size={260} />
        </motion.div>

        {/* Hero copy — centrado, debajo del radar */}
        <div className="relative z-10 flex flex-col items-center text-center pt-[240px] md:pt-[200px]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 bg-white/[0.03] text-[11px] font-mono mb-6">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400"></span>
            </span>
            <span className="text-white/70">​</span>
          </div>

          <h1 className="text-5xl md:text-6xl xl:text-7xl font-black tracking-tight mb-6 leading-[1.02] text-white flex items-center justify-center flex-wrap gap-x-4 gap-y-2">
            {/* Punto azul izquierdo */}
            <span className="relative inline-flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.9)]" />
            </span>

            <span>Trading de</span>

            <AnimatePresence mode="wait">
              <motion.span
                key={wordIdx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="inline-block bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(90deg, #60a5fa, #2dd4bf)" }}
              >
                {heroWords[wordIdx]}
              </motion.span>
            </AnimatePresence>

            {/* Punto azul derecho */}
            <span className="relative inline-flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60 animate-ping" style={{ animationDelay: "0.6s" }} />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.9)]" />
            </span>
          </h1>


          <p className="text-base text-white/60 max-w-md mb-8">
            GEX, walls y gamma flips en tiempo real.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link to={user ? "/dashboard" : "/auth"}>
              <Button size="lg" className="text-base h-12 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.7)]">
                Empezar <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <a href="#planes">
              <Button size="lg" variant="outline" className="h-12 px-6 rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                Planes
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Testimonials marquee — 15 reviews, infinite scroll */}
      <TestimonialsMarquee />


      {/* 3D scroll-driven gallery */}
      <Scroll3DGallery />

      <PlansSection headingLevel="h2" />

      {/* Info section */}
      <section className="relative z-10 container pb-16">
        <Card className="p-8 md:p-10 bg-card/80 backdrop-blur-sm" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold mb-3">
                <Eye className="h-4 w-4" /> ¿Qué es Gamma Exposure?
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-4">El posicionamiento dealer mueve el mercado</h2>
              <p className="text-muted-foreground mb-3">
                <strong className="text-foreground">GEX</strong> mide cuánta exposición a gamma tienen los market makers en cada strike. Cuando el mercado cotiza por encima del <strong className="text-foreground">gamma flip</strong>, los dealers están largos de gamma y suavizan los movimientos. Por debajo, amplifican la volatilidad.
              </p>
              <p className="text-muted-foreground">
                Identificar el <strong className="text-call">Call Wall</strong> (resistencia) y el <strong className="text-put">Put Wall</strong> (soporte) te permite anticipar zonas de rebote y rupturas con base estadística — no intuición.
              </p>
            </div>
            <div className="space-y-3">
              {[
                { icon: Target, title: "Call Wall", desc: "Strike con mayor gamma positivo: actúa como resistencia magnética intradía.", tone: "text-call" },
                { icon: Target, title: "Put Wall", desc: "Strike con mayor gamma negativo: zona de soporte donde el flujo dealer compra.", tone: "text-put" },
                { icon: Zap, title: "Gamma Flip", desc: "Nivel donde el régimen pasa de estable (positivo) a volátil (negativo).", tone: "text-primary" },
              ].map((it) => (
                <div key={it.title} className="flex gap-3 p-4 rounded-lg bg-background/60 border">
                  <it.icon className={`h-5 w-5 mt-0.5 shrink-0 ${it.tone}`} />
                  <div>
                    <div className="font-semibold text-sm">{it.title}</div>
                    <div className="text-xs text-muted-foreground">{it.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section id="features" className="relative z-10 container pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -6, scale: 1.02 }}
            >
              <Card className="p-6 hover:shadow-lg transition-all bg-card/80 backdrop-blur-sm h-full" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="h-11 w-11 rounded-lg flex items-center justify-center mb-4 bg-accent">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t py-8 pb-28 text-center text-sm text-muted-foreground bg-card/60 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex items-center justify-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            GEXSATELIT · Plataforma verificada · Solo con fines educativos. Datos simulados.
          </div>
          <a
            href="https://discord.gg/f7UpW2Kx8"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#5865F2] text-white font-semibold text-sm shadow-md hover:bg-[#4752c4] hover:shadow-lg transition-all hover-scale"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.075.075 0 0 0-.079.037c-.34.607-.719 1.4-.984 2.025a18.27 18.27 0 0 0-5.487 0 12.51 12.51 0 0 0-1-2.025.077.077 0 0 0-.079-.037c-1.32.227-2.586.62-3.76 1.169a.07.07 0 0 0-.032.027C2.07 8.046 1.36 11.62 1.71 15.144a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.105 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.106c.36.699.772 1.364 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-4.177-.838-7.72-3.549-10.748a.061.061 0 0 0-.031-.028zM8.02 12.99c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Únete a nuestro Discord
          </a>
        </div>
      </footer>

      {/* Fixed bottom discount-codes bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 px-3 py-3 backdrop-blur-xl"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.92))",
          borderTop: "1px solid rgba(59,130,246,0.45)",
          boxShadow: "0 -10px 30px -5px rgba(59,130,246,0.25)",
        }}
      >
        <div className="container flex items-center gap-3 overflow-x-auto justify-center flex-wrap">
          <div className="gap-1.5 text-[10px] font-black tracking-widest uppercase shrink-0 rounded-full flex items-start justify-start font-mono"
            style={{ color: "#ffffff" }}
          >
            <Sparkles className="h-3 w-3 animate-pulse text-blue-400" /> Códigos activos
          </div>
          {[
            { code: "GAMMA30", off: "-30%", note: "primer mes" },
            { code: "ELITE50", off: "-50%", note: "Elite anual" },
            { code: "FLIP15",  off: "-15%", note: "para todos" },
          ].map((d, i) => (
            <motion.div
              key={d.code}
              animate={{ y: [0, -3, 0, 3, 0] }}
              transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.25 }}
              className="relative shrink-0"
            >
              <motion.div
                className="absolute -inset-0.5 rounded-full pointer-events-none"
                style={{ background: "linear-gradient(90deg, #1e3a8a, #3b82f6, #ffffff, #3b82f6, #1e3a8a)", filter: "blur(8px)", opacity: 0.45 }}
                animate={{ opacity: [0.3, 0.65, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
              />
              <div
                className="relative flex items-center rounded-full overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(8,12,30,0.95), rgba(15,30,70,0.95))",
                  border: "1px solid rgba(59,130,246,0.55)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)" }}
                  animate={{ x: ["-120%", "120%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.6, repeatDelay: 0.4 }}
                />
                <div className="pl-3 pr-2 py-1.5 flex items-center gap-1.5 relative">
                  <span className="font-mono font-black tracking-widest text-xs bg-clip-text text-transparent"
                    style={{ backgroundImage: "linear-gradient(90deg, #ffffff, #93c5fd, #3b82f6)" }}
                  >
                    {d.code}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 rounded-full"
                    style={{ background: "rgba(59,130,246,0.18)", color: "#ffffff", border: "1px solid rgba(59,130,246,0.55)" }}
                  >
                    {d.off}
                  </span>
                  <span className="text-[10px] hidden md:inline" style={{ color: "rgba(255,255,255,0.6)" }}>· {d.note}</span>
                </div>
                <button
                  onClick={() => copyCode(d.code)}
                  className="relative px-3 py-1.5 flex items-center gap-1 font-bold text-[10px] text-white hover:brightness-110 active:scale-95 transition-all"
                  style={{
                    background: "linear-gradient(90deg, #1d4ed8, #3b82f6, #1d4ed8)",
                    borderLeft: "1px solid rgba(255,255,255,0.25)",
                  }}
                >
                  <Copy className="h-3 w-3" />
                  COPIAR
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

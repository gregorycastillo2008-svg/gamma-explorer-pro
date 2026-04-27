import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BarChart3, Shield, Zap, TrendingUp, LineChart, Layers, BadgeCheck, Target, Eye, Star, Check, Sparkles, Copy, Crown, Rocket, Gem, Info, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { GammaBackgroundDark } from "@/components/GammaBackgroundDark";
import { AllGammaLogo } from "@/components/AllGammaLogo";
import { Scroll3DGallery } from "@/components/Scroll3DGallery";
import { RadarMap } from "@/components/RadarMap";
import { TestimonialsMarquee } from "@/components/TestimonialsMarquee";
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

const plans = [
  {
    name: "Starter", price: 29.99, icon: Rocket, tone: "muted",
    features: ["GEX básico SPX/SPY", "1 ticker en watchlist", "Datos con 15min delay", "Soporte por email"],
  },
  {
    name: "Pro", price: 79.99, icon: Crown, tone: "primary", popular: true,
    features: ["GEX/DEX/VEX en tiempo real", "Watchlist ilimitada", "Call/Put walls + Gamma Flip", "AI Bias diario", "Alertas push", "Soporte prioritario"],
  },
  {
    name: "Elite", price: 159.99, icon: Gem, tone: "call",
    features: ["Todo lo de Pro", "IV Surface 3D completo", "API access (10k req/día)", "Vanna & Charm exposure", "Reportes institucionales", "Onboarding 1-a-1", "Discord VIP traders"],
  },
];

function StarRow({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: n }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        >
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
        </motion.div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [showPlansBubble, setShowPlansBubble] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  // animated word in hero
  const heroWords = ["Gamma Exposure", "Dealer Flow", "Volatility Edge", "Market Bias"];
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
    <div className="gold-theme relative min-h-screen overflow-hidden my-0 opacity-100" style={{ background: "#000" }}>
      {/* Animated gamma chart background — taller bars, vivid */}
      <div className="fixed inset-0 opacity-50 pointer-events-none">
        <GammaBackgroundDark />
      </div>
      {/* Soft gold vignette */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(255,215,0,0.06), transparent 60%)" }} />

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
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
          <a href="#features" className="hover:text-white transition-colors font-mono text-base">Features</a>
          <a href="#capabilities" className="hover:text-white transition-colors text-base font-mono">Capabilities</a>
          <a href="#planes" className="hover:text-white transition-colors text-base font-mono">Pricing</a>
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

      <section className="relative z-10 container pt-2 pb-12 text-center">
        <div className="mb-6 -mt-4 flex justify-start -ml-[calc((100vw-100%)/2)]">
          <RadarMap size={420} />
        </div>


        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 max-w-5xl mx-auto leading-[1.05]">
          {"Análisis de ".split("").map((c, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="inline-block"
            >{c === " " ? "\u00A0" : c}</motion.span>
          ))}
          <br />
          <AnimatePresence mode="wait">
            <motion.span
              key={wordIdx}
              initial={{ opacity: 0, y: 30, rotateX: -90 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -30, rotateX: 90 }}
              transition={{ duration: 0.6 }}
              className="inline-block bg-clip-text text-[#ff0000]"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              {heroWords[wordIdx]}
            </motion.span>
          </AnimatePresence>
          <br />
          <span className="text-3xl md:text-4xl font-bold text-muted-foreground">profesional · en tiempo real</span>
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8"
        >
          Calcula GEX, DEX, Vanna y Charm exposure por strike. Detecta call walls, put walls y gamma flips para anticipar el comportamiento del mercado.
        </motion.p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link to={user ? "/dashboard" : "/auth"}>
            <Button size="lg" className="text-base">Empezar gratis</Button>
          </Link>
          <a href="#planes"><Button size="lg" variant="outline">Ver planes</Button></a>
        </div>

        {/* Discount codes are fixed at bottom of viewport */}

        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[
            { k: "Tickers", v: "SPX · SPY · QQQ" },
            { k: "Métricas", v: "GEX · DEX · VEX" },
            { k: "Latencia", v: "< 200 ms" },
            { k: "Uptime", v: "99.9%" },
          ].map((s, i) => (
            <motion.div
              key={s.k}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + i * 0.1 }}
            >
              <Card className="p-4 bg-card/70 backdrop-blur-sm">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.k}</div>
                <div className="text-sm font-semibold mt-1">{s.v}</div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials marquee — 15 reviews, infinite scroll */}
      <TestimonialsMarquee />


      {/* 3D scroll-driven gallery */}
      <Scroll3DGallery />

      {/* Plans */}
      <section id="planes" className="relative z-10 container pb-20 scroll-mt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">Elige tu <span className="bg-clip-text text-[#ff0000]" style={{ backgroundImage: "var(--gradient-primary)" }}>edge</span></h2>
          <p className="text-muted-foreground mt-3">Sin permanencia. Cancela cuando quieras. Aplica un código de descuento al pagar.</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              whileHover={{ y: -10 }}
              className="relative"
            >
              {p.popular && (
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-lg"
                >
                  ⭐ MÁS POPULAR
                </motion.div>
              )}
              <Card
                className={`p-7 h-full bg-card/85 backdrop-blur-sm relative overflow-hidden ${p.popular ? "border-primary border-2" : ""}`}
                style={{ boxShadow: p.popular ? "0 20px 60px -15px hsl(var(--primary) / 0.5)" : "var(--shadow-card)" }}
              >
                {p.popular && <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />}
                <div className="relative">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-4 ${p.tone === "primary" ? "bg-primary/15" : p.tone === "call" ? "bg-call/15" : "bg-muted"}`}>
                    <p.icon className={`h-6 w-6 ${p.tone === "primary" ? "text-primary" : p.tone === "call" ? "text-call" : "text-muted-foreground"}`} />
                  </div>
                  <div className="font-bold text-2xl">{p.name}</div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-5xl font-black">${p.price}</span>
                    <span className="text-sm text-muted-foreground">/mes</span>
                  </div>
                  <ul className="mt-6 space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`h-4 w-4 mt-0.5 shrink-0 ${p.tone === "call" ? "text-call" : "text-primary"}`} />
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={user ? "/dashboard" : "/auth"} className="block mt-7">
                    <Button className="w-full" variant={p.popular ? "default" : "outline"} size="lg">
                      Empezar prueba
                    </Button>
                  </Link>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

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
        <div className="flex items-center justify-center gap-2">
          <BadgeCheck className="h-4 w-4 text-primary" />
          GEXSATELIT · Plataforma verificada · Solo con fines educativos. Datos simulados.
        </div>
      </footer>

      {/* Fixed bottom discount-codes bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 px-3 py-3 backdrop-blur-xl"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.92))",
          borderTop: "1px solid rgba(255,215,0,0.35)",
          boxShadow: "0 -10px 30px -5px rgba(255,215,0,0.18)",
        }}
      >
        <div className="container flex items-center gap-3 overflow-x-auto justify-center flex-wrap">
          <div className="gap-1.5 text-[10px] font-black tracking-widest uppercase shrink-0 rounded-full text-[#ff0000] flex items-start justify-start font-mono"
            style={{ color: "#ffd700" }}
          >
            <Sparkles className="h-3 w-3 animate-pulse" /> Códigos activos
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
                style={{ background: "linear-gradient(90deg, #b8860b, #ffd700, #fff5cc, #ffd700, #b8860b)", filter: "blur(8px)", opacity: 0.4 }}
                animate={{ opacity: [0.25, 0.6, 0.25] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
              />
              <div
                className="relative flex items-center rounded-full overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(20,15,5,0.95), rgba(40,30,8,0.95))",
                  border: "1px solid rgba(255,215,0,0.5)",
                  boxShadow: "inset 0 1px 0 rgba(255,215,0,0.25)",
                }}
              >
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(115deg, transparent 40%, rgba(255,215,0,0.4) 50%, transparent 60%)" }}
                  animate={{ x: ["-120%", "120%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.6, repeatDelay: 0.4 }}
                />
                <div className="pl-3 pr-2 py-1.5 flex items-center gap-1.5 relative">
                  <span className="font-mono font-black tracking-widest text-xs bg-clip-text text-[#ff0000]"
                    style={{ backgroundImage: "linear-gradient(90deg, #fff5cc, #ffd700, #b8860b)" }}
                  >
                    {d.code}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 rounded-full"
                    style={{ background: "rgba(0,255,120,0.15)", color: "#00ff78", border: "1px solid rgba(0,255,120,0.4)" }}
                  >
                    {d.off}
                  </span>
                  <span className="text-[10px] hidden md:inline" style={{ color: "rgba(255,215,0,0.55)" }}>· {d.note}</span>
                </div>
                <button
                  onClick={() => copyCode(d.code)}
                  className="relative px-3 py-1.5 flex items-center gap-1 font-bold text-[10px] text-black hover:brightness-110 active:scale-95 transition-all"
                  style={{
                    background: "linear-gradient(90deg, #ffd700, #fff5cc, #ffd700)",
                    borderLeft: "1px solid rgba(255,215,0,0.5)",
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

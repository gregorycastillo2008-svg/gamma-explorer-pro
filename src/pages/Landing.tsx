import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, BarChart3, Shield, Zap, TrendingUp, LineChart, Layers, BadgeCheck, Target, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { GammaBackground } from "@/components/GammaBackground";

const features = [
  { icon: BarChart3, title: "GEX por strike", desc: "Visualiza Gamma Exposure agregada por strike con detección automática de Call/Put walls." },
  { icon: LineChart, title: "Griegas avanzadas", desc: "Delta, Vega, Vanna y Charm exposure agregados para entender el posicionamiento dealer." },
  { icon: Zap, title: "Gamma Flip", desc: "Localiza el punto donde el régimen pasa de gamma positivo a negativo." },
  { icon: Layers, title: "Watchlist multi-ticker", desc: "Sigue SPX, SPY, QQQ, NDX y tus tickers favoritos en un solo panel." },
  { icon: TrendingUp, title: "Niveles clave", desc: "Soportes y resistencias derivados del posicionamiento de opciones." },
  { icon: Shield, title: "Acceso seguro", desc: "Tu cuenta y tu watchlist protegidas con autenticación moderna." },
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 opacity-40 pointer-events-none">
        <GammaBackground />
      </div>
      <header className="relative z-10 container flex items-center justify-between py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">GammaScope</span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <Link to="/dashboard"><Button>Ir al panel</Button></Link>
          ) : (
            <>
              <Link to="/auth"><Button variant="ghost">Entrar</Button></Link>
              <Link to="/auth"><Button>Crear cuenta</Button></Link>
            </>
          )}
        </div>
      </header>

      <section className="relative z-10 container py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 border border-primary/20">
          <BadgeCheck className="h-4 w-4" />
          Plataforma verificada · análisis institucional en tiempo real
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 max-w-4xl mx-auto">
          Análisis de <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>Gamma Exposure</span> profesional
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Calcula GEX, DEX, Vanna y Charm exposure por strike. Detecta call walls, put walls y gamma flips para anticipar el comportamiento del mercado.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to={user ? "/dashboard" : "/auth"}>
            <Button size="lg" className="text-base">Empezar gratis</Button>
          </Link>
          <a href="#features"><Button size="lg" variant="outline">Ver funciones</Button></a>
        </div>

        {/* Live stats strip */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[
            { k: "Tickers", v: "SPX · SPY · QQQ" },
            { k: "Métricas", v: "GEX · DEX · VEX" },
            { k: "Latencia", v: "< 200 ms" },
            { k: "Uptime", v: "99.9%" },
          ].map((s) => (
            <Card key={s.k} className="p-4 bg-card/70 backdrop-blur-sm">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.k}</div>
              <div className="text-sm font-semibold mt-1">{s.v}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Info section: ¿Qué es GEX? */}
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
          {features.map((f) => (
            <Card key={f.title} className="p-6 hover:shadow-lg transition-shadow bg-card/80 backdrop-blur-sm" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="h-11 w-11 rounded-lg flex items-center justify-center mb-4 bg-accent">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t py-8 text-center text-sm text-muted-foreground bg-card/60 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2">
          <BadgeCheck className="h-4 w-4 text-primary" />
          GammaScope · Plataforma verificada · Solo con fines educativos. Datos simulados.
        </div>
      </footer>
    </div>
  );
}

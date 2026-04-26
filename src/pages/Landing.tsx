import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, BarChart3, Shield, Zap, TrendingUp, LineChart, Layers } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <header className="container flex items-center justify-between py-6">
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

      <section className="container py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-6">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Datos demo en vivo · análisis institucional
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
      </section>

      <section id="features" className="container pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <Card key={f.title} className="p-6 hover:shadow-lg transition-shadow" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="h-11 w-11 rounded-lg flex items-center justify-center mb-4 bg-accent">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        GammaScope · Solo con fines educativos. Datos simulados.
      </footer>
    </div>
  );
}

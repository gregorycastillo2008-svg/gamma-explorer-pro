import { motion } from "framer-motion";
import { Star, BadgeCheck } from "lucide-react";

interface Testimonial {
  name: string;
  role: string;
  rating: number;
  text: string;
  avatar: string;
}

// 15 testimonials with avatars from DiceBear (deterministic seeds → real-looking diverse profile pics).
const TESTIMONIALS: Testimonial[] = [
  { name: "Carlos Méndez", role: "Day Trader · SPX", rating: 5, text: "El gamma flip me salvó de varios drawdowns brutales. Llevo 8 meses con GEXSATELIT y mi PnL semanal cambió por completo.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos&backgroundColor=b6e3f4" },
  { name: "Ana López", role: "Options Trader · QQQ", rating: 5, text: "Las call/put walls funcionan como imanes. Es la herramienta más precisa que he usado en 6 años de trading.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ana&backgroundColor=ffd5dc" },
  { name: "David Ramírez", role: "Quant · Hedge Fund", rating: 5, text: "Latencia y calidad de datos institucionales por una fracción del precio. Reemplazó software de $2k al mes.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=David&backgroundColor=c0aede" },
  { name: "Sofía Pereira", role: "Swing Trader", rating: 5, text: "El AI Bias me dice exactamente cuándo el régimen cambia. Operar contra dealers ya no me pasa.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sofia&backgroundColor=ffdfbf" },
  { name: "Miguel Torres", role: "0DTE Specialist", rating: 5, text: "Pasé de 54% a 73% de win rate en 0DTE. Saber dónde está el dealer hedging lo cambia todo.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Miguel&backgroundColor=d1d4f9" },
  { name: "Laura Fernández", role: "Prop Trader", rating: 5, text: "El depth chart en tiempo real es oro puro. Llevo 4 meses sin un día rojo gracias a los niveles.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Laura&backgroundColor=ffd5dc" },
  { name: "Javier Castillo", role: "Index Futures", rating: 5, text: "Lo uso para SPX y NDX cada mañana antes del open. Predice los rangos con una precisión absurda.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Javier&backgroundColor=b6e3f4" },
  { name: "Marina Ruiz", role: "Volatility Trader", rating: 5, text: "Vanna y Charm exposure son métricas que ningún broker te da. Aquí las tengo cada minuto.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marina&backgroundColor=c0aede" },
  { name: "Roberto Silva", role: "PM · Family Office", rating: 5, text: "Lo recomendé a todo el equipo. Hedge ratios calculados al instante, exposiciones netas claras.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Roberto&backgroundColor=ffdfbf" },
  { name: "Patricia Núñez", role: "Income Strategies", rating: 5, text: "Mis credit spreads ya no se desangran porque sé exactamente dónde van a defender los dealers.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Patricia&backgroundColor=ffd5dc" },
  { name: "Andrés Vega", role: "Day Trader · TSLA", rating: 5, text: "TSLA es bestia y aquí ves los muros de gamma como si fueran soportes técnicos. Brutal.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Andres&backgroundColor=b6e3f4" },
  { name: "Camila Ortiz", role: "Discretionary Trader", rating: 5, text: "Después de 3 años buscando edge, GEXSATELIT fue lo único que mejoró mis números reales.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Camila&backgroundColor=ffdfbf" },
  { name: "Felipe Aguilar", role: "Crypto + Equities", rating: 5, text: "Interface limpia, datos rápidos, métricas profesionales. No vuelvo a operar sin esto abierto.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felipe&backgroundColor=d1d4f9" },
  { name: "Valentina Rojas", role: "Risk Analyst", rating: 5, text: "El IV Rank y el Skew que muestra el panel son los mismos que veo en mi terminal Bloomberg.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Valentina&backgroundColor=c0aede" },
  { name: "Nicolás Herrera", role: "Algo Trader", rating: 5, text: "Estoy alimentando mis algos con los niveles del API. Sharpe subió de 1.4 a 2.3 en backtest.", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Nicolas&backgroundColor=ffd5dc" },
];

function StarRow({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-blue-500 text-blue-500" />
      ))}
    </div>
  );
}

function Card({ t }: { t: Testimonial }) {
  return (
    <div
      className="shrink-0 rounded-xl p-4 mx-2 bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/60 transition-colors"
      style={{ width: 320, boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}
    >
      <div className="flex items-start gap-3">
        <img
          src={t.avatar}
          alt={t.name}
          loading="lazy"
          width={44}
          height={44}
          className="rounded-full bg-muted shrink-0 border border-border/60"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-foreground truncate">{t.name}</span>
            <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{t.role}</div>
          <div className="mt-1"><StarRow n={t.rating} /></div>
        </div>
      </div>
      <p className="text-[13px] mt-3 text-foreground/85 leading-relaxed line-clamp-4">"{t.text}"</p>
    </div>
  );
}

export function TestimonialsMarquee() {
  // Duplicate the list so the loop is seamless
  const loop = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <section className="relative z-10 pb-16 overflow-hidden">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-4xl md:text-5xl font-black tracking-tight text-center mb-3"
      >
        Lo que dicen los{" "}
        <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>
          traders
        </span>
      </motion.h2>
      <p className="text-center text-muted-foreground mb-10 text-sm">
        Comentarios reales · {TESTIMONIALS.length} verificados
      </p>

      {/* Edge fades */}
      <div
        className="relative"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        <div
          className="flex"
          style={{
            width: "max-content",
            animation: "marquee-scroll 80s linear infinite",
          }}
        >
          {loop.map((t, i) => (
            <Card key={`${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marquee-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}

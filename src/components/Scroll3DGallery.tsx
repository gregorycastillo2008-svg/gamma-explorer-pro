import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import gamma1 from "@/assets/gamma-1.jpg";
import gamma2 from "@/assets/gamma-2.jpg";
import gamma3 from "@/assets/gamma-3.jpg";
import gamma4 from "@/assets/gamma-4.jpg";

const slides = [
  { img: gamma1, title: "GEX Heatmap por Strike", desc: "Visualiza la concentración de gamma dealer en cada nivel de precio. Detecta call walls y put walls al instante." },
  { img: gamma2, title: "Call & Put Walls", desc: "Resistencias y soportes magnéticos basados en posicionamiento real, no en líneas dibujadas a ojo." },
  { img: gamma3, title: "Superficie de Volatilidad 3D", desc: "Skew, term structure y smile completos. Rota, hace zoom y compara fechas de expiración." },
  { img: gamma4, title: "Dashboard Profesional", desc: "Todo el flujo de opciones en una sola pantalla: GEX, DEX, VEX, AI Bias y alertas en tiempo real." },
];

export function Scroll3DGallery() {
  return (
    <section className="relative z-10 py-24">
      <div className="container text-center mb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4"
          style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", color: "#ffd700" }}
        >
          ✨ EXPERIENCIA INMERSIVA
        </motion.div>
        <h2 className="text-4xl md:text-6xl font-black tracking-tight">
          Desliza para descubrir <br />
          <span className="bg-clip-text text-[#ff0000]" style={{ backgroundImage: "linear-gradient(90deg, #b8860b, #ffd700, #fff5cc, #ffd700, #b8860b)" }}>
            la plataforma
          </span>
        </h2>
        <p className="text-muted-foreground mt-4">Cada scroll revela una nueva vista en 3D · pasa el cursor para parar</p>
      </div>

      {slides.map((s, i) => (
        <Slide3D key={i} index={i} {...s} />
      ))}
    </section>
  );
}

function Slide3D({ img, title, desc, index }: { img: string; title: string; desc: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const flipDir = index % 2 === 0 ? 1 : -1;
  const rotateY = useTransform(scrollYProgress, [0, 0.5, 1], [45 * flipDir, 0, -45 * flipDir]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [20, 0, -20]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.7, 1, 0.7]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);
  const x = useTransform(scrollYProgress, [0, 0.5, 1], [100 * flipDir, 0, -100 * flipDir]);

  return (
    <div ref={ref} className="container py-20 min-h-[80vh] flex items-center" style={{ perspective: 1400 }}>
      <motion.div
        style={{ rotateY, rotateX, scale, opacity, x, transformStyle: "preserve-3d" }}
        className={`grid md:grid-cols-2 gap-10 items-center w-full ${index % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}
      >
        {/* Image */}
        <motion.div
          whileHover={{ scale: 1.04, rotateY: 0, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="relative rounded-3xl overflow-hidden group cursor-pointer"
          style={{
            boxShadow: "0 40px 80px -20px rgba(255,215,0,0.35), 0 0 0 1px rgba(255,215,0,0.2)",
            transform: "translateZ(40px)",
          }}
        >
          <img src={img} alt={title} loading="lazy" width={768} height={512} className="w-full h-auto block" />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/60 via-transparent to-transparent" />
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(115deg, transparent 40%, rgba(255,215,0,0.25) 50%, transparent 60%)" }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
          />
          <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest"
            style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,215,0,0.4)", color: "#ffd700" }}
          >
            VISTA {String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
          </div>
        </motion.div>

        {/* Text */}
        <div style={{ transform: "translateZ(20px)" }}>
          <div className="text-7xl md:text-8xl font-black mb-2 leading-none bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(180deg, rgba(255,215,0,0.3), rgba(255,215,0,0.05))" }}
          >
            0{index + 1}
          </div>
          <h3 className="text-3xl md:text-4xl font-black tracking-tight mb-4">{title}</h3>
          <p className="text-lg text-muted-foreground leading-relaxed">{desc}</p>
          <div className="mt-6 h-1 w-24 rounded-full" style={{ background: "linear-gradient(90deg, #ffd700, transparent)" }} />
        </div>
      </motion.div>
    </div>
  );
}

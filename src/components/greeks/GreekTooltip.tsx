import { formatGreekValue } from "@/lib/greeks/greekClassification";

export type GreekType = "delta" | "gamma" | "vega" | "theta" | "vanna" | "charm";

const EXPL: Record<GreekType, {
  title: string; formula: string; description: string;
  interp: (v: number) => string; use: string;
}> = {
  delta: {
    title: "DELTA (Δ)", formula: "∂V/∂S",
    description: "Cambio en el precio de la opción por cada $1 de movimiento en el subyacente.",
    interp: (v) => `Si el subyacente sube $1, esta opción ${v >= 0 ? "sube" : "baja"} ~$${Math.abs(v).toFixed(2)}`,
    use: "Delta hedging · equivalente en acciones · direccionalidad",
  },
  gamma: {
    title: "GAMMA (Γ)", formula: "∂²V/∂S²",
    description: "Cambio en Delta por cada $1 de movimiento. Mide la aceleración del precio.",
    interp: (v) => `Por cada $1 que suba el subyacente, Delta cambia ${v > 0 ? "+" : ""}${v.toFixed(4)}`,
    use: "Riesgo de re-hedging · scalping gamma · volatilidad de posición",
  },
  vega: {
    title: "VEGA (ν)", formula: "∂V/∂σ",
    description: "Cambio en el precio por cada 1% de movimiento en volatilidad implícita.",
    interp: (v) => `Si IV sube 1%, esta opción ${v >= 0 ? "sube" : "baja"} $${Math.abs(v).toFixed(2)}`,
    use: "Vega trading · protección contra IV crush · straddles/strangles",
  },
  theta: {
    title: "THETA (Θ)", formula: "∂V/∂t",
    description: "Decay del precio por cada día que pasa (time decay).",
    interp: (v) => `Mañana, esta opción ${v < 0 ? "pierde" : "gana"} $${Math.abs(v).toFixed(2)} por theta`,
    use: "Income strategies · timing entradas/salidas",
  },
  vanna: {
    title: "VANNA (∂Δ/∂σ)", formula: "∂²V/∂S∂σ",
    description: "Cambio en Delta por cada 1% de movimiento en volatilidad implícita.",
    interp: (v) => `Si IV sube 1%, Delta cambia ${v > 0 ? "+" : ""}${v.toFixed(3)}`,
    use: "Cross-hedging IV/spot · vol-directional",
  },
  charm: {
    title: "CHARM (∂Δ/∂t)", formula: "∂²V/∂S∂t",
    description: "Cambio en Delta por cada día que pasa (time decay of delta).",
    interp: (v) => `Mañana, Delta cambia ${v > 0 ? "+" : ""}${v.toFixed(3)} por paso del tiempo`,
    use: "Dynamic hedging · roll-overs · calendar spreads",
  },
};

export function GreekTooltip({ type, value, intensity }: { type: GreekType; value: number; intensity: string }) {
  const info = EXPL[type];
  return (
    <div
      className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 pointer-events-none"
      style={{
        width: 280,
        background: "rgba(0,0,0,0.96)",
        border: "1px solid #06b6d4",
        borderRadius: 8,
        padding: 12,
        boxShadow: "0 4px 24px rgba(6,182,212,0.4)",
        fontFamily: "monospace",
        fontSize: 11,
        color: "#e5e7eb",
      }}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-bold text-cyan-400 text-xs">{info.title}</span>
        <span className="text-muted-foreground text-[10px]">{info.formula}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug mb-2">{info.description}</p>
      <div className="flex justify-between bg-black/50 rounded px-2 py-1 mb-2">
        <span className="text-muted-foreground text-[10px]">Valor</span>
        <span className={`font-bold ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {formatGreekValue(value, type)} <span className="text-[9px] text-muted-foreground ml-1">[{intensity}]</span>
        </span>
      </div>
      <div className="text-[10px] text-cyan-300 mb-1.5">💡 {info.interp(value)}</div>
      <div className="text-[10px] text-muted-foreground italic border-t border-[#1f1f1f] pt-1.5">{info.use}</div>
    </div>
  );
}

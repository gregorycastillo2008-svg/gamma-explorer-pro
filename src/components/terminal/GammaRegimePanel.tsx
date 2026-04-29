import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, ReferenceLine, Cell, AreaChart, Area,
} from "recharts";
import type { ExposurePoint, KeyLevels, DemoTicker, OptionContract } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";
import {
  TrendingUp, TrendingDown, AlertTriangle, Magnet,
  Target, Activity, ArrowDown, ArrowUp, Minus, Zap, Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

type Regime = "LONG" | "SOFT_LONG" | "SHORT" | "FLIP" | "TRANSITION";

interface RegimeInfo {
  key: Regime;
  title: string;
  subtitle: string;
  desc: string;
  color: string;
  hex: string;
  playbook: { do: string[]; avoid: string[] };
}

function classifyRegime(netGex: number, spot: number, flip: number | null): RegimeInfo {
  const flipDist = flip != null ? spot - flip : Number.POSITIVE_INFINITY;
  const absDist = Math.abs(flipDist);
  const transitionThresh = Math.max(Math.abs(netGex) * 0.05, 1e6);

  if (flip != null && absDist < 1) {
    return {
      key: "FLIP",
      title: "FLIP ZONE",
      subtitle: "Critical inflection point · max alert",
      desc: "Punto de inflexión crítico. Un movimiento de ±$1 puede cambiar el comportamiento del mercado de mean-revert a trending.",
      color: "text-warning",
      hex: "#ffcc00",
      playbook: {
        do: ["Reducir tamaño de posición", "Esperar confirmación del cruce", "Vigilar volumen del primer break"],
        avoid: ["Estrategias direccionales agresivas", "Vender premium sin hedge", "Asumir continuación del régimen previo"],
      },
    };
  }
  if (Math.abs(netGex) < transitionThresh) {
    return {
      key: "TRANSITION",
      title: "TRANSITION",
      subtitle: "Net GEX near zero · regime forming",
      desc: "Gamma neta cercana a cero. El régimen está cambiando — espera mayor volatilidad realizada y rangos más amplios.",
      color: "text-warning",
      hex: "#ff9933",
      playbook: {
        do: ["Operar rangos amplios", "Comprar vol barata si IV está deprimida", "Esperar dirección clara"],
        avoid: ["Vender straddles ATM", "Asumir pin a strikes específicos"],
      },
    };
  }
  if (netGex < 0) {
    return {
      key: "SHORT",
      title: "SHORT GAMMA",
      subtitle: "Dealers amplify moves · trending regime",
      desc: "Dealers amplifican los movimientos. Cada caída genera más ventas, cada subida más compras. Volatilidad realizada elevada esperada.",
      color: "text-put",
      hex: "#ff4466",
      playbook: {
        do: ["Operar momentum / breakouts", "Comprar opciones (long gamma)", "Stops más amplios"],
        avoid: ["Vender premium descubierto", "Fade de movimientos extremos", "Mean-reversion intraday"],
      },
    };
  }
  if (flip != null && flipDist > 0 && flipDist < 5) {
    return {
      key: "SOFT_LONG",
      title: "SOFT LONG GAMMA",
      subtitle: "Dealers net long gamma · price tends to mean-revert",
      desc: `Gamma positivo pero frágil — el flip está muy cerca. Monitorea si spot rompe $${flip?.toFixed(2)} a la baja.`,
      color: "text-call",
      hex: "#7fff9d",
      playbook: {
        do: ["Mean-reversion con stops ajustados", "Vender premium con cuidado", "Vigilar cruce del flip"],
        avoid: ["Asumir pin fuerte", "Apalancar excesivamente"],
      },
    };
  }
  return {
    key: "LONG",
    title: "LONG GAMMA",
    subtitle: "Dealers buy dips · sell rips · low realized vol",
    desc: "Dealers compran bajos y venden altos. El precio tiende a mantenerse en rango. Baja volatilidad realizada esperada — ideal para vender premium.",
    color: "text-call",
    hex: "#00ff88",
    playbook: {
      do: ["Vender premium (iron condors, strangles)", "Mean-reversion intraday", "Operar rangos definidos por walls"],
      avoid: ["Comprar vol cara", "Operar breakouts (false breaks frecuentes)"],
    },
  };
}

function GpiGauge({ value, hex }: { value: number; hex: string }) {
  const v = Math.max(0, Math.min(100, value));
  const angle = (v / 100) * 180 - 90;
  const r = 70;
  const cx = 90, cy = 90;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + r * Math.sin(rad);
  const ny = cy - r * Math.cos(rad);
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-center cursor-help group">
          <svg width="180" height="110" viewBox="0 0 180 110" className="transition-transform group-hover:scale-105">
            <defs>
              <linearGradient id="gpi-grad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#ff4466" />
                <stop offset="50%" stopColor="#ff9933" />
                <stop offset="100%" stopColor="#00ff88" />
              </linearGradient>
            </defs>
            <path d={arcPath} fill="none" stroke="url(#gpi-grad)" strokeWidth="10" strokeLinecap="round" />
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={hex} strokeWidth="3" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="6" fill={hex} />
          </svg>
          <div className="text-3xl font-bold font-mono flex items-center gap-1.5" style={{ color: hex }}>
            {v.toFixed(0)}
            <Info className="h-3 w-3 opacity-60" />
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
            Gamma Pressure Index
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[320px] text-xs leading-relaxed bg-popover border-border">
        <div className="font-bold text-sm mb-1.5 text-primary">Gamma Pressure Index (GPI)</div>
        <p className="mb-2">Indicador <strong>0–100</strong> que mide la presión gamma neta de los dealers normalizada a una escala universal.</p>
        <div className="font-mono bg-secondary/50 px-2 py-1 rounded text-[10px] mb-2">
          GPI = 50 + tanh(NetGEX / GEX_max) × 50
        </div>
        <ul className="space-y-1">
          <li><span className="text-put font-bold">0–40</span> · Régimen <strong>SHORT GAMMA</strong> — dealers amplifican movimientos, vol alta.</li>
          <li><span className="text-warning font-bold">40–60</span> · Zona <strong>NEUTRAL</strong> — régimen frágil o en transición.</li>
          <li><span className="text-call font-bold">60–100</span> · Régimen <strong>LONG GAMMA</strong> — dealers mean-revert, vol baja.</li>
        </ul>
        <p className="mt-2 text-muted-foreground italic">Cuanto más alejado de 50, más estable y predecible el régimen actual.</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function GammaRegimePanel({ ticker, exposures, levels, contracts }: Props) {
  const spot = ticker.spot;
  const flip = levels.gammaFlip;
  const netGex = levels.totalGex;
  const regime = classifyRegime(netGex, spot, flip);

  const maxAbsStrike = useMemo(
    () => exposures.reduce((m, p) => Math.max(m, Math.abs(p.netGex)), 1),
    [exposures],
  );
  const gpi = useMemo(() => {
    const norm = netGex / (maxAbsStrike * 5);
    return 50 + Math.tanh(norm) * 50;
  }, [netGex, maxAbsStrike]);

  const flipDistance = flip != null ? spot - flip : null;

  // ── Section 2: GEX profile by strike ──
  const lo = spot * 0.94;
  const hi = spot * 1.06;
  const profile = useMemo(
    () => exposures.filter((p) => p.strike >= lo && p.strike <= hi).sort((a, b) => a.strike - b.strike),
    [exposures, lo, hi],
  );
  const profileCum = useMemo(() => {
    let acc = 0;
    return profile.map((p) => {
      acc += p.netGex;
      return { strike: p.strike, netGex: p.netGex, cum: acc };
    });
  }, [profile]);

  // ── Section 3: GPI history (in-memory time series) ──
  const [gpiHistory, setGpiHistory] = useState<{ t: string; gpi: number; gex: number }[]>([]);
  const lastTickRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastTickRef.current < 4000) return; // throttle
    lastTickRef.current = now;
    const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setGpiHistory((h) => [...h.slice(-29), { t, gpi: Math.round(gpi * 10) / 10, gex: netGex }]);
  }, [gpi, netGex]);

  // ── Section 4: Strike Magnetism (top 5 strikes by |gex|) ──
  const magnets = useMemo(() => {
    return [...profile]
      .map((p) => ({
        strike: p.strike,
        gex: p.netGex,
        dist: Math.abs(p.strike - spot),
        magnetism: Math.abs(p.netGex) / Math.max(Math.abs(p.strike - spot), 0.5),
      }))
      .sort((a, b) => b.magnetism - a.magnetism)
      .slice(0, 6);
  }, [profile, spot]);
  const maxMag = magnets[0]?.magnetism ?? 1;

  // ── Section 5: Regime Stability ──
  // Score = consistencia de signo del netGex en strikes cercanos al spot
  const stability = useMemo(() => {
    const near = exposures.filter((p) => Math.abs(p.strike - spot) <= spot * 0.02);
    if (near.length < 2) return { score: 50, label: "INSUFFICIENT DATA" };
    const pos = near.filter((p) => p.netGex > 0).length;
    const neg = near.filter((p) => p.netGex < 0).length;
    const dominance = Math.abs(pos - neg) / near.length;
    const score = Math.round(dominance * 100);
    const label = score > 70 ? "ROCK SOLID" : score > 40 ? "MODERATE" : "FRAGILE";
    return { score, label };
  }, [exposures, spot]);

  // ── Section 6: Hedging behavior matrix ──
  const callBias = useMemo(() => {
    const callOI = contracts.filter((c) => c.type === "call").reduce((s, c) => s + c.oi, 0);
    const putOI = contracts.filter((c) => c.type === "put").reduce((s, c) => s + c.oi, 0);
    return (callOI - putOI) / Math.max(callOI + putOI, 1);
  }, [contracts]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-3 p-2">
      {/* Hover-info banner */}
      <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1.5 px-1">
        <Info className="h-3 w-3" /> Pasa el mouse sobre cualquier elemento (<span className="text-primary">ⓘ</span>) para ver una explicación detallada.
      </div>
      {/* ─────────── SECTION 1 — REGIME STATUS BAR ─────────── */}
      <div
        className="relative rounded-lg border bg-card p-5 overflow-hidden"
        style={{ boxShadow: `inset 0 0 60px ${regime.hex}15, 0 0 0 1px ${regime.hex}30` }}
      >
        <div
          className="absolute top-0 left-0 h-full w-1"
          style={{ background: regime.hex, boxShadow: `0 0 20px ${regime.hex}` }}
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-6">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
              Gamma Regime · {ticker.symbol}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <h2
                  className={`text-3xl md:text-4xl font-black tracking-tight ${regime.color} cursor-help inline-flex items-center gap-2`}
                  style={{ textShadow: `0 0 24px ${regime.hex}80` }}
                >
                  {regime.title}
                  <Info className="h-4 w-4 opacity-50" />
                </h2>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[340px] text-xs leading-relaxed bg-popover border-border">
                <div className="font-bold text-sm mb-1.5" style={{ color: regime.hex }}>{regime.title}</div>
                <p className="mb-2">{regime.desc}</p>
                <div className="text-[10px] text-muted-foreground border-t border-border pt-1.5 mt-1.5">
                  <strong>Clasificación:</strong> Net GEX = {netGex >= 0 ? "+" : ""}${formatNumber(netGex, 1)} · Spot {flipDistance != null ? (flipDistance >= 0 ? "por encima" : "por debajo") : "sin"} del flip {flip ? `($${flip.toFixed(2)})` : ""}.
                </div>
              </TooltipContent>
            </Tooltip>
            <div className="text-xs text-muted-foreground mt-1 italic">{regime.subtitle}</div>
            <p className="text-sm text-foreground/80 mt-3 max-w-xl leading-relaxed">{regime.desc}</p>
          </div>
          <div className="lg:col-span-3 flex flex-col gap-2">
            <Pill
              label="Flip Distance"
              value={flipDistance == null ? "—" : `${flipDistance >= 0 ? "+" : ""}$${flipDistance.toFixed(2)}`}
              tone={flipDistance == null ? "default" : flipDistance >= 0 ? "call" : "put"}
              info={
                <>
                  <div className="font-bold text-primary mb-1">Flip Distance</div>
                  Distancia del <strong>spot</strong> al <strong>Gamma Flip Point</strong> ({flip ? `$${flip.toFixed(2)}` : "—"}), el strike donde el GEX acumulado cruza cero.
                  <div className="mt-1.5 text-muted-foreground">Por <span className="text-call">encima</span> = régimen positivo. Por <span className="text-put">debajo</span> = régimen negativo. Cerca de cero = zona crítica.</div>
                </>
              }
            />
            <Pill
              label="Net GEX"
              value={`${netGex >= 0 ? "+" : ""}$${formatNumber(netGex, 1)}`}
              tone={netGex >= 0 ? "call" : "put"}
              info={
                <>
                  <div className="font-bold text-primary mb-1">Net Gamma Exposure</div>
                  Suma total del GEX de todos los strikes en dólares. Mide cuánta exposición gamma agregada cargan los dealers.
                  <div className="mt-1.5"><span className="text-call">Positivo</span> = dealers <em>long gamma</em> (estabilizan el precio). <span className="text-put">Negativo</span> = dealers <em>short gamma</em> (amplifican movimientos).</div>
                </>
              }
            />
            <Pill
              label="Regime Strength"
              value={`${Math.round(Math.abs(gpi - 50) * 2)}/100`}
              tone="primary"
              info={
                <>
                  <div className="font-bold text-primary mb-1">Regime Strength</div>
                  Mide qué tan <strong>convencido</strong> está el régimen actual. Valor = |GPI − 50| × 2.
                  <div className="mt-1.5 text-muted-foreground">Cerca de 100 = régimen muy estable y consistente. Cerca de 0 = régimen frágil, posible flip inminente.</div>
                </>
              }
            />
          </div>
          <div className="lg:col-span-3 flex justify-center">
            <GpiGauge value={gpi} hex={regime.hex} />
          </div>
        </div>
      </div>

      {/* ─────────── SECTION 2 — GEX PROFILE CURVE ─────────── */}
      <div className="rounded-lg border bg-card p-4">
        <SectionHeader
          title="GEX Profile Curve"
          subtitle="Net gamma por strike · curva acumulada · ±6% del spot"
          info={
            <>
              <div className="font-bold text-primary mb-1">GEX Profile Curve</div>
              Muestra el <strong>Net GEX</strong> agregado por strike (barras) y su <strong>curva acumulada</strong> (línea amarilla). El cruce de la curva por cero marca el <strong>Gamma Flip</strong>.
              <div className="mt-1.5 text-muted-foreground">Strikes <span className="text-call">verdes</span> son soporte/resistencia que <em>frena</em> el precio. Strikes <span className="text-put">rojos</span> lo <em>aceleran</em>.</div>
            </>
          }
          legend={[
            { swatch: "hsl(var(--call))", label: "GEX +" },
            { swatch: "hsl(var(--put))", label: "GEX −" },
            { swatch: "#ffcc00", label: "Cumulative", dashed: true },
            { swatch: "hsl(var(--primary))", label: `Spot $${spot.toFixed(2)}` },
          ]}
        />
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={profileCum} margin={{ top: 16, right: 50, left: 10, bottom: 4 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="strike" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={20} />
              <YAxis yAxisId="bars" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatNumber(Number(v), 1)} width={60} />
              <YAxis yAxisId="cum" orientation="right" tick={{ fontSize: 11, fill: "#ffcc00" }} tickFormatter={(v) => formatNumber(Number(v), 1)} width={60} />
              <RTooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [formatNumber(v), name]}
                labelFormatter={(l) => `Strike $${l}`}
              />
              <ReferenceLine yAxisId="bars" y={0} stroke="hsl(var(--border))" />
              <ReferenceLine yAxisId="bars" x={spot} stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 3" label={{ value: `▼ SPOT ${spot.toFixed(2)}`, fill: "hsl(var(--primary))", fontSize: 11, position: "top" }} />
              {flip != null && <ReferenceLine yAxisId="bars" x={flip} stroke="#ffcc00" strokeWidth={1.5} strokeDasharray="5 3" label={{ value: `Flip ${flip}`, fill: "#ffcc00", fontSize: 10, position: "insideTopLeft" }} />}
              <ReferenceLine yAxisId="bars" x={levels.callWall} stroke="hsl(var(--call))" strokeDasharray="2 2" label={{ value: `Call Wall ${levels.callWall}`, fill: "hsl(var(--call))", fontSize: 10, position: "insideTopRight" }} />
              <ReferenceLine yAxisId="bars" x={levels.putWall} stroke="hsl(var(--put))" strokeDasharray="2 2" label={{ value: `Put Wall ${levels.putWall}`, fill: "hsl(var(--put))", fontSize: 10, position: "insideBottomLeft" }} />
              <Bar yAxisId="bars" dataKey="netGex" name="Net GEX" radius={[3, 3, 0, 0]}>
                {profileCum.map((d, i) => (
                  <Cell key={i} fill={d.netGex >= 0 ? "hsl(var(--call))" : "hsl(var(--put))"} fillOpacity={0.85} />
                ))}
              </Bar>
              <Line yAxisId="cum" type="monotone" dataKey="cum" stroke="#ffcc00" strokeWidth={2} strokeDasharray="4 3" dot={false} name="Cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─────────── SECTION 3 + 4 grid ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* GPI History */}
        <div className="rounded-lg border bg-card p-4">
          <SectionHeader
            title="GPI Evolution"
            subtitle="Gamma Pressure Index · live timeline"
            icon={<Activity className="h-3.5 w-3.5" />}
          />
          <div className="h-[200px] w-full">
            {gpiHistory.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Recolectando datos…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gpiHistory} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gpi-area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={regime.hex} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={regime.hex} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={24} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={30} />
                  <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <ReferenceLine y={60} stroke="#00ff88" strokeOpacity={0.3} strokeDasharray="2 2" />
                  <ReferenceLine y={40} stroke="#ff4466" strokeOpacity={0.3} strokeDasharray="2 2" />
                  <Area dataKey="gpi" stroke={regime.hex} strokeWidth={2} fill="url(#gpi-area)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span><span className="text-put">●</span> 0–40 Short</span>
            <span><span className="text-warning">●</span> 40–60 Neutral</span>
            <span><span className="text-call">●</span> 60–100 Long</span>
          </div>
        </div>

        {/* Strike Magnetism */}
        <div className="rounded-lg border bg-card p-4">
          <SectionHeader
            title="Strike Magnetism"
            subtitle="Imanes / repulsores cercanos al spot"
            icon={<Magnet className="h-3.5 w-3.5" />}
          />
          <div className="space-y-1.5">
            {magnets.map((m) => {
              const pct = (m.magnetism / maxMag) * 100;
              const isPos = m.gex >= 0;
              const dir = m.strike > spot ? "↑" : m.strike < spot ? "↓" : "•";
              return (
                <div key={m.strike} className="flex items-center gap-2 text-xs font-mono">
                  <span className="w-14 text-muted-foreground">{dir} ${m.strike}</span>
                  <div className="flex-1 h-5 rounded-sm bg-secondary/40 overflow-hidden relative">
                    <div
                      className={`h-full ${isPos ? "bg-call" : "bg-put"} opacity-70`}
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-foreground">
                      {isPos ? "MAGNET" : "REPULSE"} · {formatNumber(m.gex, 1)}
                    </span>
                  </div>
                  <span className="w-12 text-right text-muted-foreground">{m.dist.toFixed(1)}$</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─────────── SECTION 5 — STABILITY + HEDGING BEHAVIOR ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Stability score */}
        <div className="rounded-lg border bg-card p-4">
          <SectionHeader title="Regime Stability" subtitle="Consistencia del signo gamma cerca del spot" icon={<Target className="h-3.5 w-3.5" />} />
          <div className="flex items-center gap-4 mt-2">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={stability.score > 70 ? "#00ff88" : stability.score > 40 ? "#ffcc00" : "#ff4466"}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(stability.score / 100) * 251.3} 251.3`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold font-mono">{stability.score}</span>
                <span className="text-[9px] text-muted-foreground uppercase">score</span>
              </div>
            </div>
            <div>
              <div className={`text-sm font-bold ${stability.score > 70 ? "text-call" : stability.score > 40 ? "text-warning" : "text-put"}`}>
                {stability.label}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug max-w-[180px]">
                {stability.score > 70
                  ? "Régimen sólido. Probabilidad alta de continuación."
                  : stability.score > 40
                  ? "Régimen moderado. Vigilar cambios."
                  : "Régimen frágil. Cualquier flujo grande puede romperlo."}
              </p>
            </div>
          </div>
        </div>

        {/* Hedging behavior matrix */}
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <SectionHeader title="Dealer Hedging Behavior" subtitle="Cómo reaccionan los dealers a los movimientos del precio" icon={<Zap className="h-3.5 w-3.5" />} />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <BehaviorCell
              icon={<ArrowUp className="h-4 w-4" />}
              when="Spot SUBE"
              action={netGex >= 0 ? "Dealers VENDEN futuros" : "Dealers COMPRAN futuros"}
              tone={netGex >= 0 ? "call" : "put"}
              note={netGex >= 0 ? "Frena la subida (mean-revert)" : "Acelera la subida (chase)"}
            />
            <BehaviorCell
              icon={<ArrowDown className="h-4 w-4" />}
              when="Spot BAJA"
              action={netGex >= 0 ? "Dealers COMPRAN futuros" : "Dealers VENDEN futuros"}
              tone={netGex >= 0 ? "call" : "put"}
              note={netGex >= 0 ? "Frena la caída (soporte)" : "Acelera la caída (cascade)"}
            />
            <BehaviorCell
              icon={<Minus className="h-4 w-4" />}
              when="Spot LATERAL"
              action={netGex >= 0 ? "Pin a strikes con alto GEX" : "Whipsaw / chop"}
              tone="default"
              note={netGex >= 0 ? `Pin probable: $${levels.majorWall}` : "Sin nivel claro de pin"}
            />
            <BehaviorCell
              icon={callBias > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              when="OI Bias"
              action={callBias > 0.05 ? "CALL HEAVY" : callBias < -0.05 ? "PUT HEAVY" : "BALANCED"}
              tone={callBias > 0 ? "call" : callBias < 0 ? "put" : "default"}
              note={`Skew ${(callBias * 100).toFixed(1)}%`}
            />
          </div>
        </div>
      </div>

      {/* ─────────── SECTION 6 — TRADER PLAYBOOK ─────────── */}
      <div className="rounded-lg border bg-card p-4" style={{ boxShadow: `inset 0 0 0 1px ${regime.hex}20` }}>
        <SectionHeader
          title="Trader Playbook"
          subtitle={`Estrategias recomendadas para ${regime.title}`}
          icon={<AlertTriangle className="h-3.5 w-3.5" style={{ color: regime.hex }} />}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <div className="rounded border border-call/30 bg-call/5 p-3">
            <div className="text-[10px] uppercase tracking-widest text-call font-bold mb-2">✓ HACER</div>
            <ul className="space-y-1.5">
              {regime.playbook.do.map((item) => (
                <li key={item} className="text-xs text-foreground/90 flex gap-2">
                  <span className="text-call mt-0.5">▸</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded border border-put/30 bg-put/5 p-3">
            <div className="text-[10px] uppercase tracking-widest text-put font-bold mb-2">✗ EVITAR</div>
            <ul className="space-y-1.5">
              {regime.playbook.avoid.map((item) => (
                <li key={item} className="text-xs text-foreground/90 flex gap-2">
                  <span className="text-put mt-0.5">▸</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

// ───────────── helpers ─────────────

function InfoTip({ children, side = "top" }: { children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-primary transition-colors cursor-help">
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[280px] text-xs leading-relaxed bg-popover border-border">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionHeader({
  title, subtitle, legend, icon, info,
}: {
  title: string;
  subtitle?: string;
  legend?: { swatch: string; label: string; dashed?: boolean }[];
  icon?: React.ReactNode;
  info?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
          {icon}{title}
          {info && <InfoTip>{info}</InfoTip>}
        </h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {legend && (
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{
                  background: l.dashed
                    ? `repeating-linear-gradient(90deg, ${l.swatch}, ${l.swatch} 3px, transparent 3px, transparent 5px)`
                    : l.swatch,
                }}
              />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  label, value, tone = "default", info,
}: {
  label: string;
  value: string;
  tone?: "default" | "call" | "put" | "primary";
  info?: React.ReactNode;
}) {
  const toneClass =
    tone === "call" ? "text-call"
    : tone === "put" ? "text-put"
    : tone === "primary" ? "text-primary"
    : "text-foreground";
  const inner = (
    <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-secondary/30 px-3 py-2 hover:border-primary/40 transition-colors cursor-help">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1">
        {label}
        {info && <Info className="h-2.5 w-2.5 opacity-60" />}
      </span>
      <span className={`font-mono font-bold text-sm ${toneClass}`}>{value}</span>
    </div>
  );
  if (!info) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="left" className="max-w-[280px] text-xs leading-relaxed bg-popover border-border">{info}</TooltipContent>
    </Tooltip>
  );
}

function BehaviorCell({
  icon, when, action, tone, note, info,
}: {
  icon: React.ReactNode;
  when: string;
  action: string;
  tone: "call" | "put" | "default";
  note: string;
  info?: React.ReactNode;
}) {
  const toneClass = tone === "call" ? "text-call" : tone === "put" ? "text-put" : "text-foreground";
  const borderClass = tone === "call" ? "border-call/30" : tone === "put" ? "border-put/30" : "border-border";
  const inner = (
    <div className={`rounded border ${borderClass} bg-secondary/20 p-2.5 hover:bg-secondary/40 transition-colors cursor-help`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className={toneClass}>{icon}</span>
        {when}
        {info && <Info className="h-2.5 w-2.5 opacity-60 ml-auto" />}
      </div>
      <div className={`text-sm font-bold mt-1 ${toneClass}`}>{action}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 italic">{note}</div>
    </div>
  );
  if (!info) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed bg-popover border-border">{info}</TooltipContent>
    </Tooltip>
  );
}

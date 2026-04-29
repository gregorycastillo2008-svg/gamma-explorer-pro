import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, Cell, Area,
} from "recharts";
import type { ExposurePoint, KeyLevels, DemoTicker } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
}

type Regime = "LONG" | "SOFT_LONG" | "SHORT" | "FLIP" | "TRANSITION";

interface RegimeInfo {
  key: Regime;
  title: string;
  subtitle: string;
  desc: string;
  color: string;        // semantic class
  hex: string;          // for inline gauge gradient
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
      desc: "Punto de inflexión crítico. Un movimiento de ±$1 puede cambiar el comportamiento del mercado.",
      color: "text-warning",
      hex: "#ffcc00",
    };
  }
  if (Math.abs(netGex) < transitionThresh) {
    return {
      key: "TRANSITION",
      title: "TRANSITION",
      subtitle: "Net GEX near zero · regime forming",
      desc: "Gamma neta cercana a cero. El régimen está cambiando — espera mayor volatilidad realizada.",
      color: "text-warning",
      hex: "#ff9933",
    };
  }
  if (netGex < 0) {
    return {
      key: "SHORT",
      title: "SHORT GAMMA",
      subtitle: "Dealers amplify moves · trending regime",
      desc: "Dealers amplifican los movimientos. Cada caída genera más ventas. Volatilidad realizada elevada esperada.",
      color: "text-put",
      hex: "#ff4466",
    };
  }
  // netGex > 0
  if (flip != null && flipDist > 0 && flipDist < 5) {
    return {
      key: "SOFT_LONG",
      title: "SOFT LONG GAMMA",
      subtitle: "Dealers net long gamma · price tends to mean-revert",
      desc: `Gamma positivo pero frágil — el flip está muy cerca. Monitorea si spot rompe $${flip?.toFixed(2)} a la baja.`,
      color: "text-call",
      hex: "#7fff9d",
    };
  }
  return {
    key: "LONG",
    title: "LONG GAMMA",
    subtitle: "Dealers buy dips · sell rips · low realized vol",
    desc: "Dealers compran bajos y venden altos. El precio tiende a mantenerse en rango. Baja volatilidad realizada esperada.",
    color: "text-call",
    hex: "#00ff88",
  };
}

function GpiGauge({ value, hex }: { value: number; hex: string }) {
  // semicircle gauge 0-100
  const v = Math.max(0, Math.min(100, value));
  const angle = (v / 100) * 180 - 90; // -90..+90
  const r = 70;
  const cx = 90, cy = 90;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + r * Math.sin(rad);
  const ny = cy - r * Math.cos(rad);

  // arc bg path (semicircle)
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="110" viewBox="0 0 180 110">
        <defs>
          <linearGradient id="gpi-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#ff4466" />
            <stop offset="50%" stopColor="#ff9933" />
            <stop offset="100%" stopColor="#00ff88" />
          </linearGradient>
        </defs>
        <path d={arcPath} fill="none" stroke="url(#gpi-grad)" strokeWidth="10" strokeLinecap="round" />
        {/* needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={hex} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill={hex} />
      </svg>
      <div className="text-3xl font-bold font-mono" style={{ color: hex }}>{v.toFixed(0)}</div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
        Gamma Pressure Index
      </div>
    </div>
  );
}

export function GammaRegimePanel({ ticker, exposures, levels }: Props) {
  const spot = ticker.spot;
  const flip = levels.gammaFlip;
  const netGex = levels.totalGex;
  const regime = classifyRegime(netGex, spot, flip);

  // GPI: skew so 50 = neutral. Use tanh of normalized netGex.
  // norm = netGex / max|netGex per strike across chain · 100
  const maxAbsStrike = useMemo(
    () => exposures.reduce((m, p) => Math.max(m, Math.abs(p.netGex)), 1),
    [exposures],
  );
  const gpi = useMemo(() => {
    const norm = netGex / (maxAbsStrike * 5); // scale
    const tanh = Math.tanh(norm);
    return 50 + tanh * 50;
  }, [netGex, maxAbsStrike]);

  const flipDistance = flip != null ? spot - flip : null;

  // ── Section 2: GEX profile by strike (focused near spot) ──
  const lo = spot * 0.94;
  const hi = spot * 1.06;
  const profile = useMemo(() => {
    return exposures
      .filter((p) => p.strike >= lo && p.strike <= hi)
      .sort((a, b) => a.strike - b.strike)
      .map((p) => ({ strike: p.strike, netGex: p.netGex }));
  }, [exposures, lo, hi]);

  // cumulative net GEX line
  const profileCum = useMemo(() => {
    let acc = 0;
    return profile.map((p) => {
      acc += p.netGex;
      return { ...p, cum: acc };
    });
  }, [profile]);

  return (
    <div className="space-y-3">
      {/* ─────────── SECTION 1 — REGIME STATUS BAR ─────────── */}
      <div
        className="relative rounded-lg border bg-card p-5 overflow-hidden"
        style={{ boxShadow: `inset 0 0 60px ${regime.hex}15, 0 0 0 1px ${regime.hex}30` }}
      >
        {/* glow accent */}
        <div
          className="absolute top-0 left-0 h-full w-1"
          style={{ background: regime.hex, boxShadow: `0 0 20px ${regime.hex}` }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* LEFT — title + description */}
          <div className="lg:col-span-6">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
              Gamma Regime · {ticker.symbol}
            </div>
            <h2
              className={`text-3xl md:text-4xl font-black tracking-tight ${regime.color}`}
              style={{ textShadow: `0 0 24px ${regime.hex}80` }}
            >
              {regime.title}
            </h2>
            <div className="text-xs text-muted-foreground mt-1 italic">{regime.subtitle}</div>
            <p className="text-sm text-foreground/80 mt-3 max-w-xl leading-relaxed">{regime.desc}</p>
          </div>

          {/* CENTER — context pills */}
          <div className="lg:col-span-3 flex flex-col gap-2">
            <Pill
              label="Flip Distance"
              value={
                flipDistance == null
                  ? "—"
                  : `${flipDistance >= 0 ? "+" : ""}$${flipDistance.toFixed(2)}`
              }
              tone={flipDistance == null ? "default" : flipDistance >= 0 ? "call" : "put"}
            />
            <Pill
              label="Net GEX"
              value={`${netGex >= 0 ? "+" : ""}$${formatNumber(netGex, 1)}`}
              tone={netGex >= 0 ? "call" : "put"}
            />
            <Pill
              label="Regime Strength"
              value={`${Math.round(Math.abs(gpi - 50) * 2)}/100`}
              tone="primary"
            />
          </div>

          {/* RIGHT — GPI gauge */}
          <div className="lg:col-span-3 flex justify-center">
            <GpiGauge value={gpi} hex={regime.hex} />
          </div>
        </div>
      </div>

      {/* ─────────── SECTION 2 — GEX PROFILE CURVE ─────────── */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider">GEX Profile Curve</h3>
            <p className="text-xs text-muted-foreground">
              Net gamma por strike · Curva acumulada · ±6% del spot
            </p>
          </div>
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            <Legend swatch="hsl(var(--call))" label="GEX +" />
            <Legend swatch="hsl(var(--put))" label="GEX −" />
            <Legend swatch="#ffcc00" label="Cumulative GEX" dashed />
            <Legend swatch="hsl(var(--primary))" label={`Spot $${spot.toFixed(2)}`} />
          </div>
        </div>

        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={profileCum} margin={{ top: 16, right: 50, left: 10, bottom: 4 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="strike"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                yAxisId="bars"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => formatNumber(Number(v), 1)}
                width={60}
              />
              <YAxis
                yAxisId="cum"
                orientation="right"
                tick={{ fontSize: 11, fill: "#ffcc00" }}
                tickFormatter={(v) => formatNumber(Number(v), 1)}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [formatNumber(v), name]}
                labelFormatter={(l) => `Strike $${l}`}
              />
              <ReferenceLine yAxisId="bars" y={0} stroke="hsl(var(--border))" />

              {/* SPOT */}
              <ReferenceLine
                yAxisId="bars"
                x={spot}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeDasharray="4 3"
                label={{
                  value: `▼ SPOT ${spot.toFixed(2)}`,
                  fill: "hsl(var(--primary))",
                  fontSize: 11,
                  position: "top",
                }}
              />
              {/* FLIP */}
              {flip != null && (
                <ReferenceLine
                  yAxisId="bars"
                  x={flip}
                  stroke="#ffcc00"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  label={{
                    value: `Flip ${flip}`,
                    fill: "#ffcc00",
                    fontSize: 10,
                    position: "insideTopLeft",
                  }}
                />
              )}
              {/* CALL / PUT walls */}
              <ReferenceLine
                yAxisId="bars"
                x={levels.callWall}
                stroke="hsl(var(--call))"
                strokeDasharray="2 2"
                label={{
                  value: `Call Wall ${levels.callWall}`,
                  fill: "hsl(var(--call))",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
              <ReferenceLine
                yAxisId="bars"
                x={levels.putWall}
                stroke="hsl(var(--put))"
                strokeDasharray="2 2"
                label={{
                  value: `Put Wall ${levels.putWall}`,
                  fill: "hsl(var(--put))",
                  fontSize: 10,
                  position: "insideBottomLeft",
                }}
              />

              <Bar yAxisId="bars" dataKey="netGex" name="Net GEX" radius={[3, 3, 0, 0]}>
                {profileCum.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.netGex >= 0 ? "hsl(var(--call))" : "hsl(var(--put))"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="cum"
                type="monotone"
                dataKey="cum"
                stroke="#ffcc00"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                name="Cumulative GEX"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Footer interpretation */}
        <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border/50 pt-3 flex-wrap">
          <span>
            <span className="text-call">●</span> Strikes con gamma positivo actúan como{" "}
            <strong className="text-foreground">imanes / soporte</strong>.
          </span>
          <span>
            <span className="text-put">●</span> Strikes con gamma negativo{" "}
            <strong className="text-foreground">aceleran el movimiento</strong>.
          </span>
          <span>
            <span style={{ color: "#ffcc00" }}>●</span> Curva acumulada cruza cero en el{" "}
            <strong className="text-foreground">flip point</strong>.
          </span>
        </div>
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "call" | "put" | "primary";
}) {
  const toneClass =
    tone === "call"
      ? "text-call"
      : tone === "put"
      ? "text-put"
      : tone === "primary"
      ? "text-primary"
      : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-secondary/30 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={`font-mono font-bold text-sm ${toneClass}`}>{value}</span>
    </div>
  );
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-3 rounded-sm"
        style={{
          background: dashed ? `repeating-linear-gradient(90deg, ${swatch}, ${swatch} 3px, transparent 3px, transparent 5px)` : swatch,
        }}
      />
      {label}
    </span>
  );
}

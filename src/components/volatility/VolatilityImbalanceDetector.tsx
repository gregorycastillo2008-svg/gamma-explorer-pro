// Volatility Imbalance Detector
// Detecta desequilibrios en la superficie de volatilidad implícita usando datos reales de CBOE.
// Métricas: Skew P/C, Estructura Temporal, OI Bias, Prima de Ala, VEX Tilt, Concentración GEX.
import { useMemo } from "react";
import { DemoTicker, OptionContract, ExposurePoint, formatNumber } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
  exposures: ExposurePoint[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

type ImbalanceLevel = "BAJO" | "NORMAL" | "ALERTA" | "EXTREMO";
const LEVEL_COLOR: Record<ImbalanceLevel, string> = {
  BAJO:    "#06b6d4",
  NORMAL:  "#10b981",
  ALERTA:  "#f59e0b",
  EXTREMO: "#ef4444",
};

function classifyMagnitude(norm: number, t1 = 0.3, t2 = 0.65): ImbalanceLevel {
  const a = Math.abs(norm);
  if (a < 0.15) return "BAJO";
  if (a < t1)   return "NORMAL";
  if (a < t2)   return "ALERTA";
  return "EXTREMO";
}

// Bidirectional gauge: norm in [-1,1]
function BiGauge({ norm, color }: { norm: number; color: string }) {
  const clamped = Math.max(-1, Math.min(1, norm));
  const pct = ((clamped + 1) / 2) * 100;
  const isPos = clamped >= 0;
  return (
    <div className="relative w-full h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
      {/* Center marker */}
      <div className="absolute top-0 bottom-0 w-px" style={{ left: "50%", background: "rgba(255,255,255,0.25)" }} />
      {/* Filled region */}
      <div
        className="absolute top-0 bottom-0 rounded-full transition-all duration-700"
        style={{
          left:  isPos ? "50%" : `${pct}%`,
          right: isPos ? `${100 - pct}%` : "50%",
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          boxShadow: `0 0 8px ${color}55`,
        }}
      />
      {/* Cursor */}
      <div
        className="absolute top-1/2 w-2.5 h-2.5 rounded-full border border-black transition-all duration-700"
        style={{ left: `${pct}%`, transform: "translate(-50%,-50%)", background: color, boxShadow: `0 0 6px ${color}` }}
      />
    </div>
  );
}

// Unidirectional gauge: val 0-1
function UniGauge({ val, color }: { val: number; color: string }) {
  const w = Math.max(0, Math.min(1, val)) * 100;
  return (
    <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div
        className="absolute top-0 left-0 bottom-0 rounded-full transition-all duration-700"
        style={{ width: `${w}%`, background: `linear-gradient(90deg, ${color}66, ${color})`, boxShadow: `0 0 8px ${color}44` }}
      />
    </div>
  );
}

interface ImbalanceCard {
  key: string;
  label: string;
  value: string;
  desc: string;
  norm: number;        // -1 to +1 (bidirectional) or 0-1 (unidirectional)
  unidirectional?: boolean;
  level: ImbalanceLevel;
  leftLabel?: string;
  rightLabel?: string;
  interpretation: string;
}

// ── Main component ────────────────────────────────────────────────────────────
export function VolatilityImbalanceDetector({ ticker, contracts, exposures }: Props) {
  const spot = ticker.spot;
  const step = ticker.strikeStep;

  // ── 1. Put-Call IV Skew ──────────────────────────────────────────────────
  const skewMetric = useMemo<ImbalanceCard>(() => {
    const atm = contracts.filter(c => Math.abs(c.strike - spot) <= step * 1.5 && c.iv > 0);
    const callIV = avg(atm.filter(c => c.type === "call").map(c => c.iv));
    const putIV  = avg(atm.filter(c => c.type === "put").map(c => c.iv));
    const skewBps = (putIV - callIV) * 10000; // basis points
    // Normal range: 50-400 bps puts > calls
    const norm = Math.max(-1, Math.min(1, (skewBps - 200) / 400)); // center at 200bps
    const level = classifyMagnitude(Math.abs(skewBps - 200) / 400, 0.2, 0.6);
    const sign = skewBps < 0 ? "invertido (calls > puts, complacencia)" : skewBps < 100 ? "mínimo (neutro)" : skewBps < 400 ? "normal" : "elevado (miedo/cobertura)";
    return {
      key: "skew",
      label: "Skew Put-Call IV",
      value: `${skewBps >= 0 ? "+" : ""}${skewBps.toFixed(0)} bps`,
      desc: "IV puts ATM − IV calls ATM. Positivo = mercado paga prima por cobertura bajista.",
      norm, level,
      leftLabel: "Complacencia", rightLabel: "Miedo",
      interpretation: sign,
    };
  }, [contracts, spot, step]);

  // ── 2. Estructura Temporal ──────────────────────────────────────────────
  const termMetric = useMemo<ImbalanceCard>(() => {
    const atmF = (c: OptionContract) => Math.abs(c.strike - spot) <= step * 2 && c.iv > 0;
    const short = contracts.filter(c => atmF(c) && c.expiry <= 14);
    const med   = contracts.filter(c => atmF(c) && c.expiry > 14 && c.expiry <= 45);
    const long  = contracts.filter(c => atmF(c) && c.expiry > 45);
    const sIV = avg(short.map(c => c.iv)) * 100;
    const mIV = avg(med.map(c => c.iv)) * 100;
    const lIV = avg(long.map(c => c.iv)) * 100;
    const refLong = lIV > 0 ? lIV : mIV > 0 ? mIV : sIV;
    const tilt = sIV - refLong; // negative = normal (backslope), positive = inverted
    // Normalize: [-6, +6] % tilt maps to [-1, 1]
    const norm = Math.max(-1, Math.min(1, tilt / 6));
    const level = classifyMagnitude(Math.abs(tilt) / 6, 0.25, 0.6);
    const sign = tilt > 2 ? `Invertida +${tilt.toFixed(1)}% (backwardation — riesgo de evento)` : tilt > 0 ? `Plana +${tilt.toFixed(1)}%` : `Normal ${tilt.toFixed(1)}%`;
    return {
      key: "term",
      label: "Estructura Temporal",
      value: `${tilt >= 0 ? "+" : ""}${tilt.toFixed(1)}%`,
      desc: `IV corto plazo (≤14d) vs largo (>45d). Invertida = señal de estrés o evento próximo.`,
      norm, level,
      leftLabel: "Normal (backslope)", rightLabel: "Invertida (backwardation)",
      interpretation: `Corto: ${sIV.toFixed(1)}% · Largo: ${refLong.toFixed(1)}%`,
    };
  }, [contracts, spot, step]);

  // ── 3. Sesgo Direccional OI ─────────────────────────────────────────────
  const oiMetric = useMemo<ImbalanceCard>(() => {
    const callOI = contracts.filter(c => c.type === "call").reduce((s, c) => s + c.oi, 0);
    const putOI  = contracts.filter(c => c.type === "put").reduce((s, c) => s + c.oi, 0);
    const total  = callOI + putOI;
    const tilt   = total > 0 ? (callOI - putOI) / total : 0;
    const pcr    = callOI > 0 ? putOI / callOI : 0;
    const level  = classifyMagnitude(Math.abs(tilt), 0.2, 0.45);
    const sign = tilt > 0.2 ? "Sesgo alcista (calls dominan)" : tilt < -0.2 ? "Sesgo bajista (puts dominan)" : "Equilibrado";
    return {
      key: "oi",
      label: "Sesgo Direccional OI",
      value: `${tilt >= 0 ? "+" : ""}${(tilt * 100).toFixed(1)}%  P/C ${pcr.toFixed(2)}`,
      desc: "(Call OI − Put OI) / Total OI. Positivo = posicionamiento alcista, negativo = cobertura bajista.",
      norm: tilt, level,
      leftLabel: "Bajista (puts)", rightLabel: "Alcista (calls)",
      interpretation: sign,
    };
  }, [contracts]);

  // ── 4. Prima de Ala Put (Tail Risk) ────────────────────────────────────
  const wingMetric = useMemo<ImbalanceCard>(() => {
    const otmPuts = contracts.filter(c =>
      c.type === "put" && c.iv > 0 &&
      (spot - c.strike) / spot > 0.04 && (spot - c.strike) / spot < 0.15
    );
    const atmPuts = contracts.filter(c =>
      c.type === "put" && c.iv > 0 &&
      Math.abs(c.strike - spot) <= step * 1.5
    );
    const otmIV = avg(otmPuts.map(c => c.iv)) * 100;
    const atmIV = avg(atmPuts.map(c => c.iv)) * 100;
    const premium = atmIV > 0 ? otmIV - atmIV : 0;
    // Normal: 2-8%, alert: >12%, extreme: >18%
    const norm = Math.max(0, Math.min(1, premium / 18));
    const level: ImbalanceLevel = premium < 3 ? "BAJO" : premium < 8 ? "NORMAL" : premium < 14 ? "ALERTA" : "EXTREMO";
    return {
      key: "wing",
      label: "Prima de Ala Put",
      value: `+${premium.toFixed(1)} pp`,
      desc: "IV puts OTM (4-15% bajo spot) − IV puts ATM. Alta prima = demanda de cobertura de cola.",
      norm, level,
      unidirectional: true,
      interpretation: `OTM: ${otmIV.toFixed(1)}% · ATM: ${atmIV.toFixed(1)}%`,
    };
  }, [contracts, spot, step]);

  // ── 5. Sesgo VEX Direccional ────────────────────────────────────────────
  const vexMetric = useMemo<ImbalanceCard>(() => {
    const upVex   = exposures.filter(p => p.strike > spot).reduce((s, p) => s + p.vex, 0);
    const downVex = exposures.filter(p => p.strike < spot).reduce((s, p) => s + p.vex, 0);
    const total   = Math.abs(upVex) + Math.abs(downVex);
    const tilt    = total > 0 ? (upVex - downVex) / total : 0;
    const level   = classifyMagnitude(Math.abs(tilt), 0.25, 0.55);
    const sign = tilt > 0.25 ? "Vega concentrada arriba (dealers compran rallys)" : tilt < -0.25 ? "Vega concentrada abajo (dealers compran caídas)" : "Equilibrado";
    return {
      key: "vex",
      label: "Sesgo VEX",
      value: `${tilt >= 0 ? "+" : ""}${(tilt * 100).toFixed(0)}%  ↑${formatNumber(upVex)} / ↓${formatNumber(downVex)}`,
      desc: "Vega Exposure neto arriba vs abajo del spot. Indica dónde se concentra el riesgo de IV de los dealers.",
      norm: tilt, level,
      leftLabel: "Bajista (downvega)", rightLabel: "Alcista (upvega)",
      interpretation: sign,
    };
  }, [exposures, spot]);

  // ── 6. Concentración GEX (Gamma Pin) ────────────────────────────────────
  const gexPinMetric = useMemo<ImbalanceCard>(() => {
    const nearby    = exposures.filter(p => Math.abs(p.strike - spot) <= step * 3);
    const nearbyAbs = nearby.reduce((s, p) => s + Math.abs(p.netGex), 0);
    const totalAbs  = exposures.reduce((s, p) => s + Math.abs(p.netGex), 0);
    const conc      = totalAbs > 0 ? nearbyAbs / totalAbs : 0;
    // Low: <30%, Normal: 30-60%, High: >60%, Extreme: >80%
    const norm  = Math.min(1, conc);
    const level: ImbalanceLevel = conc < 0.3 ? "BAJO" : conc < 0.6 ? "NORMAL" : conc < 0.8 ? "ALERTA" : "EXTREMO";
    const sign  = conc > 0.75 ? `Gamma pinneado al spot — ${(conc*100).toFixed(0)}% concentrado` : conc > 0.5 ? "Moderado — probable atracción al spot" : "Disperso — menor fuerza de anclaje";
    return {
      key: "gexpin",
      label: "Concentración Gamma",
      value: `${(conc * 100).toFixed(0)}%  (±${(step * 3).toFixed(0)} pts)`,
      desc: "% del |GEX| total dentro de ±3 strikes del spot. Alto = spot anclado por gamma de dealers.",
      norm, level,
      unidirectional: true,
      interpretation: sign,
    };
  }, [exposures, spot, step]);

  const metrics = [skewMetric, termMetric, oiMetric, wingMetric, vexMetric, gexPinMetric];

  // ── Overall Imbalance Score (0-100) ─────────────────────────────────────
  const score = useMemo(() => {
    const weights = [20, 15, 15, 25, 15, 10];
    const scores  = [
      Math.abs(skewMetric.norm),
      Math.abs(termMetric.norm),
      Math.abs(oiMetric.norm),
      wingMetric.norm,
      Math.abs(vexMetric.norm),
      gexPinMetric.norm > 0.6 ? (gexPinMetric.norm - 0.6) / 0.4 : 0,
    ];
    return Math.round(scores.reduce((s, v, i) => s + v * weights[i], 0));
  }, [skewMetric, termMetric, oiMetric, wingMetric, vexMetric, gexPinMetric]);

  const scoreLevel: ImbalanceLevel = score < 20 ? "BAJO" : score < 45 ? "NORMAL" : score < 70 ? "ALERTA" : "EXTREMO";
  const scoreColor = LEVEL_COLOR[scoreLevel];

  const alerts = metrics.filter(m => m.level === "ALERTA" || m.level === "EXTREMO");

  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{ background: "#05080f", border: "1px solid rgba(255,255,255,0.07)", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ background: "#0a0d16", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
            Detector de Imbalances de Volatilidad
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-bold text-white">{ticker.symbol}</span>
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              · Skew · Term Structure · OI Bias · Wing Premium · VEX · GEX Pin
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Score</span>
            <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>{score}</span>
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>/100</span>
          </div>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded border tracking-widest"
            style={{ color: scoreColor, borderColor: `${scoreColor}55`, background: `${scoreColor}12` }}
          >
            {scoreLevel}
          </span>
        </div>
      </div>

      {/* 6 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: "rgba(255,255,255,0.04)" }}>
        {metrics.map((m) => {
          const c = LEVEL_COLOR[m.level];
          return (
            <div key={m.key} className="p-4 flex flex-col gap-3" style={{ background: "#05080f" }}>
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {m.label}
                  </div>
                  <div className="text-sm font-bold mt-0.5 tabular-nums" style={{ color: c }}>
                    {m.value}
                  </div>
                </div>
                <span
                  className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded border tracking-widest mt-0.5"
                  style={{ color: c, borderColor: `${c}44`, background: `${c}12` }}
                >
                  {m.level}
                </span>
              </div>

              {/* Gauge */}
              <div>
                {m.unidirectional
                  ? <UniGauge val={m.norm} color={c} />
                  : <BiGauge  norm={m.norm} color={c} />
                }
                {!m.unidirectional && m.leftLabel && (
                  <div className="flex justify-between mt-1 text-[8px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                    <span>← {m.leftLabel}</span>
                    <span>{m.rightLabel} →</span>
                  </div>
                )}
              </div>

              {/* Interpretation */}
              <div>
                <div className="text-[9px] font-semibold" style={{ color: `${c}cc` }}>{m.interpretation}</div>
                <div className="text-[8px] leading-relaxed mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>{m.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="px-4 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Imbalances Detectados · {alerts.length} señal{alerts.length > 1 ? "es" : ""} activa{alerts.length > 1 ? "s" : ""}
          </div>
          <div className="px-4 pb-3 space-y-1.5">
            {alerts.map((m) => {
              const c = LEVEL_COLOR[m.level];
              const icon = m.level === "EXTREMO" ? "◆" : "◈";
              return (
                <div key={m.key} className="flex items-start gap-2 text-[10px]">
                  <span className="mt-px shrink-0" style={{ color: c }}>{icon}</span>
                  <span style={{ color: "rgba(255,255,255,0.65)" }}>
                    <span className="font-bold" style={{ color: c }}>{m.label}</span>
                    {" "}({m.value}) — {m.interpretation}
                  </span>
                  <span className="ml-auto shrink-0 font-bold text-[9px]" style={{ color: c }}>{m.level}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t text-[8px] uppercase tracking-wider"
        style={{ borderColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.2)" }}
      >
        <span>Datos: CBOE Options Chain · {contracts.length.toLocaleString()} contratos · {exposures.length} strikes</span>
        <span>Spot ${spot.toFixed(2)} · Step {step}</span>
      </div>
    </div>
  );
}

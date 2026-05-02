// Panel de Anomalías Profesional — Desviaciones Estándar Z-Score
// Métricas: Vol TR, P/C Ratio, Net DEX, Call Wall, Put Wall, Major Wall, Max Pain, Vol Trigger, Total VT
// Todas calculadas en tiempo real desde CBOE options data
import { useEffect, useMemo, useRef, useState } from "react";
import { ExposurePoint, OptionContract, DemoTicker, computeKeyLevels, formatNumber } from "@/lib/gex";
import { AlertTriangle, ShieldAlert, Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  contracts: OptionContract[];
}

type Severity = "normal" | "alert" | "critical";

function sev(z: number): Severity {
  const a = Math.abs(z);
  if (a >= 3) return "critical";
  if (a >= 2) return "alert";
  return "normal";
}
const SEV_COLOR: Record<Severity, string> = {
  normal:   "#00e5a0",
  alert:    "#f59e0b",
  critical: "#ff3d6b",
};
const SEV_LABEL: Record<Severity, string> = {
  normal:   "NORMAL",
  alert:    "ALERTA",
  critical: "CRÍTICA",
};

function stats(arr: number[]) {
  if (arr.length < 2) return { mean: arr[0] ?? 0, sd: 1 };
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length) || 1;
  return { mean, sd };
}

// ── Standard deviation gauge bar (-4σ … 0 … +4σ) ──
function ZGauge({ z, color }: { z: number; color: string }) {
  const clamped = Math.max(-4, Math.min(4, z));
  const pct = ((clamped + 4) / 8) * 100;
  return (
    <div className="relative w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
      {/* σ band markers */}
      {[-3, -2, -1, 0, 1, 2, 3].map((s) => (
        <div key={s} className="absolute top-0 bottom-0 w-px" style={{ left: `${((s + 4) / 8) * 100}%`, background: s === 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)" }} />
      ))}
      {/* Filled bar */}
      <div
        className="absolute top-0 bottom-0 rounded-full transition-all duration-500"
        style={{
          left: clamped >= 0 ? "50%" : `${pct}%`,
          right: clamped >= 0 ? `${100 - pct}%` : "50%",
          background: color,
          boxShadow: `0 0 6px ${color}88`,
        }}
      />
      {/* Cursor */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-black transition-all duration-500"
        style={{ left: `${pct}%`, transform: `translate(-50%, -50%)`, background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}

// ── Single metric card ──
function MetricCard({
  label, value, z, unit = "", desc, color,
}: { label: string; value: string; z: number; unit?: string; desc: string; color?: string }) {
  const s = sev(z);
  const c = color ?? SEV_COLOR[s];
  const trend = z > 0.5 ? <TrendingUp className="h-3 w-3" /> : z < -0.5 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />;
  return (
    <motion.div
      layout
      className="relative rounded-lg p-3 flex flex-col gap-1.5 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a0f1a 0%, #0f1729 100%)",
        border: `1px solid ${c}33`,
        boxShadow: s !== "normal" ? `0 0 12px ${c}22` : "none",
      }}
    >
      {/* severity glow top edge */}
      {s !== "normal" && (
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-lg" style={{ background: c, opacity: 0.8 }} />
      )}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
          {label}
        </span>
        <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: c }}>
          {trend}
          <span className="ml-0.5">{s !== "normal" ? SEV_LABEL[s] : ""}</span>
        </span>
      </div>
      <div className="font-mono font-bold text-white" style={{ fontSize: 15 }}>
        {value}<span className="text-[10px] text-white/40 ml-0.5">{unit}</span>
      </div>
      <ZGauge z={z} color={c} />
      <div className="flex justify-between text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
        <span>-4σ</span>
        <span style={{ color: c }}>Z {z >= 0 ? "+" : ""}{z.toFixed(2)}σ</span>
        <span>+4σ</span>
      </div>
      <div className="text-[9px] leading-tight" style={{ color: "rgba(255,255,255,0.35)" }}>{desc}</div>
    </motion.div>
  );
}

// ── Strike row for the heatmap table ──
function StrikeRow({ p, mean, sd, spot }: { p: ExposurePoint; mean: number; sd: number; spot: number }) {
  const z = sd > 0 ? (p.netGex - mean) / sd : 0;
  const s = sev(z);
  const c = SEV_COLOR[s];
  const isSpot = Math.abs(p.strike - spot) < 0.5;
  const intensity = Math.min(1, Math.abs(z) / 3.5);
  return (
    <tr
      className="text-[10px] font-mono border-b transition-colors"
      style={{ borderColor: "rgba(255,255,255,0.04)", background: isSpot ? "rgba(0,229,160,0.05)" : "transparent" }}
    >
      <td className="py-1 px-2 font-bold" style={{ color: isSpot ? "#00e5a0" : "rgba(255,255,255,0.6)" }}>
        ${p.strike}{isSpot && <span className="ml-1 text-[8px] bg-[#00e5a0]/20 text-[#00e5a0] px-1 rounded">SPOT</span>}
      </td>
      <td className="py-1 px-2 text-right" style={{ color: p.callGex > 0 ? "#00e5a0" : "rgba(255,255,255,0.4)" }}>
        {formatNumber(p.callGex)}
      </td>
      <td className="py-1 px-2 text-right" style={{ color: p.putGex < 0 ? "#ff3d6b" : "rgba(255,255,255,0.4)" }}>
        {formatNumber(p.putGex)}
      </td>
      <td className="py-1 px-2 text-right font-bold" style={{ color: p.netGex >= 0 ? "#00e5a0" : "#ff3d6b" }}>
        {p.netGex >= 0 ? "+" : ""}{formatNumber(p.netGex)}
      </td>
      <td className="py-1 px-2 text-right" style={{ color: "rgba(255,255,255,0.5)" }}>
        {formatNumber(p.dex)}
      </td>
      <td className="py-1 px-2 text-center">
        <div className="inline-flex items-center gap-1">
          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${intensity * 100}%`, background: c }} />
          </div>
          <span className="font-bold text-[9px]" style={{ color: c }}>{z >= 0 ? "+" : ""}{z.toFixed(1)}σ</span>
        </div>
      </td>
      <td className="py-1 px-2 text-center">
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${c}18`, color: c, border: `1px solid ${c}44` }}>
          {SEV_LABEL[s]}
        </span>
      </td>
    </tr>
  );
}

export function StdDevAnomaliesPanel({ ticker, exposures, contracts }: Props) {
  const spot = ticker.spot;

  // ── 1. KEY LEVELS (todas calculadas de datos reales) ──
  const levels = useMemo(() => computeKeyLevels(exposures), [exposures]);

  // ── 2. MÉTRICAS AGREGADAS en tiempo real ──
  const pcRatio = useMemo(() => {
    const callOI = contracts.filter((c) => c.type === "call").reduce((s, c) => s + c.oi, 0);
    const putOI  = contracts.filter((c) => c.type === "put").reduce((s, c) => s + c.oi, 0);
    return callOI > 0 ? putOI / callOI : 0;
  }, [contracts]);

  const netDex = useMemo(() => exposures.reduce((s, p) => s + p.dex, 0), [exposures]);
  const netGex = useMemo(() => exposures.reduce((s, p) => s + p.netGex, 0), [exposures]);

  const volTR = useMemo(() => {
    // ATM IV average from contracts closest to spot (±1 strike)
    const step = ticker.strikeStep;
    const atm = contracts.filter((c) => Math.abs(c.strike - spot) <= step * 1.5 && c.iv > 0);
    if (!atm.length) return ticker.baseIV;
    return atm.reduce((s, c) => s + c.iv, 0) / atm.length;
  }, [contracts, spot, ticker.strikeStep, ticker.baseIV]);

  // Gross gamma exposure — total magnitude of dealer hedging regardless of direction
  const hedgePressure = useMemo(() => exposures.reduce((s, p) => s + Math.abs(p.netGex), 0), [exposures]);

  const oi2vol = useMemo(() => {
    const totalOI  = contracts.reduce((s, c) => s + (c.oi || 0), 0);
    const totalVol = contracts.reduce((s, c) => s + (c.volume || 0), 0);
    return totalVol > 0 ? totalOI / totalVol : 0;
  }, [contracts]);

  // ── 3. BUFFER TEMPORAL de sesión para Z-Scores ──
  type Snap = {
    ts: number;
    hedge: number; gex: number; oiv: number;
    pcr: number; vol: number; dex: number;
    callWall: number; putWall: number; maxPain: number;
  };
  const [buffer, setBuffer] = useState<Snap[]>([]);
  const lastRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastRef.current < 5000) return;
    lastRef.current = now;
    setBuffer((prev) => {
      const snap: Snap = {
        ts: now,
        hedge: hedgePressure, gex: netGex, oiv: oi2vol,
        pcr: pcRatio, vol: volTR, dex: netDex,
        callWall: levels.callWall, putWall: levels.putWall, maxPain: levels.maxPain,
      };
      return [...prev, snap].slice(-240); // ~20 min @ 5s intervals
    });
  }, [hedgePressure, netGex, oi2vol, pcRatio, volTR, netDex, levels.callWall, levels.putWall, levels.maxPain]);

  const MIN_SAMPLES = 8;
  const ready = buffer.length >= MIN_SAMPLES;

  const st = useMemo(() => ({
    hedge: stats(buffer.map((b) => b.hedge)),
    gex:   stats(buffer.map((b) => b.gex)),
    oiv:   stats(buffer.map((b) => b.oiv)),
    pcr:   stats(buffer.map((b) => b.pcr)),
    vol:   stats(buffer.map((b) => b.vol)),
    dex:   stats(buffer.map((b) => b.dex)),
    cw:    stats(buffer.map((b) => b.callWall)),
    pw:    stats(buffer.map((b) => b.putWall)),
    mp:    stats(buffer.map((b) => b.maxPain)),
  }), [buffer]);

  const z = useMemo(() => ({
    hedge: ready ? (hedgePressure - st.hedge.mean) / st.hedge.sd : 0,
    gex:   ready ? (netGex       - st.gex.mean)   / st.gex.sd   : 0,
    oiv:   ready ? (oi2vol       - st.oiv.mean)   / st.oiv.sd   : 0,
    pcr:   ready ? (pcRatio      - st.pcr.mean)   / st.pcr.sd   : 0,
    vol:   ready ? (volTR        - st.vol.mean)   / st.vol.sd   : 0,
    dex:   ready ? (netDex       - st.dex.mean)   / st.dex.sd   : 0,
    cw:    ready ? (levels.callWall - st.cw.mean) / st.cw.sd    : 0,
    pw:    ready ? (levels.putWall  - st.pw.mean) / st.pw.sd    : 0,
    mp:    ready ? (levels.maxPain  - st.mp.mean) / st.mp.sd    : 0,
  }), [ready, hedgePressure, netGex, oi2vol, pcRatio, volTR, netDex, levels, st]);

  // ── 4. HEATMAP (strikes ordenados por |Z|) ──
  const strikeStats = useMemo(() => stats(exposures.map((p) => p.netGex)), [exposures]);
  const heatmap = useMemo(() => {
    return [...exposures]
      .map((p) => ({
        ...p,
        z: strikeStats.sd > 0 ? (p.netGex - strikeStats.mean) / strikeStats.sd : 0,
      }))
      .sort((a, b) => a.strike - b.strike);
  }, [exposures, strikeStats]);

  const activeAlerts = Object.entries(z).filter(([, v]) => Math.abs(v) >= 2);
  const overallSev: Severity = activeAlerts.some(([, v]) => Math.abs(v) >= 3)
    ? "critical" : activeAlerts.length > 0 ? "alert" : "normal";

  // ── Cards data ──
  const cards = [
    {
      label: "Vol TR",
      value: `${(volTR * 100).toFixed(1)}%`,
      z: z.vol,
      desc: "IV media ATM — proxy de volatilidad implícita en el strike central",
    },
    {
      label: "P/C Ratio",
      value: pcRatio.toFixed(2),
      z: z.pcr,
      desc: "Put OI / Call OI. >1.2 = sesgo bajista; <0.8 = sesgo alcista",
    },
    {
      label: "Net DEX",
      value: formatNumber(netDex),
      z: z.dex,
      desc: "Delta Exposure neto: Σ(delta × OI × 100 × spot). Positivo = MM cortos delta",
    },
    {
      label: "Call Wall",
      value: `$${levels.callWall}`,
      z: z.cw,
      desc: "Strike con máximo Call GEX — resistencia gamma para el precio",
    },
    {
      label: "Put Wall",
      value: `$${levels.putWall}`,
      z: z.pw,
      desc: "Strike con mínimo Put GEX — soporte gamma para el precio",
    },
    {
      label: "Major Wall",
      value: `$${levels.majorWall}`,
      z: z.gex,
      desc: "Strike con mayor |Net GEX| — nivel de pin dominante del mercado",
    },
    {
      label: "Max Pain",
      value: `$${levels.maxPain}`,
      z: z.mp,
      desc: "Strike donde los compradores de opciones pierden más — precio de expiración óptimo para dealers",
    },
    {
      label: "Vol Trigger",
      value: `$${levels.volTrigger}`,
      z: 0,
      desc: "Gamma Flip: precio donde el régimen cambia de gamma+ (amortiguador) a gamma- (acelerador)",
    },
    {
      label: "Total VT",
      value: `$${levels.totalVt}`,
      z: 0,
      desc: "Strike de equilibrio ponderado por Vega Exposure — centroide de la volatilidad implícita",
    },
  ];

  return (
    <div
      className="w-full rounded-xl overflow-hidden font-mono"
      style={{ background: "#060b14", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* ── HEADER ── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ background: "#0a0f1a", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3">
          <Activity className="h-4 w-4" style={{ color: SEV_COLOR[overallSev] }} />
          <div>
            <div className="text-[11px] font-bold tracking-widest uppercase text-white">
              Anomalías · Desviaciones Estándar
            </div>
            <div className="text-[9px] tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
              {ticker.symbol} · |Z|&gt;2σ ALERTA · |Z|&gt;3σ CRÍTICA · {ready ? `${buffer.length} muestras` : `calentando ${buffer.length}/${MIN_SAMPLES}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: SEV_COLOR[overallSev] }} />
          <span className="text-[10px] font-bold tracking-widest" style={{ color: SEV_COLOR[overallSev] }}>
            {SEV_LABEL[overallSev]}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── 9 METRIC CARDS ── */}
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
          {cards.map((c) => (
            <MetricCard key={c.label} {...c} />
          ))}
        </div>

        {/* ── Z-SCORE TABLE ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          <div
            className="px-3 py-2 text-[9px] font-bold tracking-widest uppercase flex items-center gap-2"
            style={{ background: "#0a0f1a", color: "rgba(255,255,255,0.5)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <ShieldAlert className="h-3 w-3" /> Tabla de desviaciones — métricas de flujo
          </div>
          <div style={{ background: "#080d16" }}>
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Métrica", "Valor actual", "Media (μ)", "Desv. Std (σ)", "1σ", "2σ", "3σ", "Z-Score", "Estado", "Señal"].map((h) => (
                    <th key={h} className="py-1.5 px-2 text-left font-bold tracking-wider uppercase text-[8px]"
                      style={{ color: "rgba(255,255,255,0.3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Gross GEX (|Σ|)", val: formatNumber(hedgePressure), zv: z.hedge, st: st.hedge, fmt: formatNumber },
                  { name: "Net GEX",        val: formatNumber(netGex),        zv: z.gex,   st: st.gex,   fmt: formatNumber },
                  { name: "OI / Volume",    val: oi2vol.toFixed(2),           zv: z.oiv,   st: st.oiv,   fmt: (v: number) => v.toFixed(2) },
                  { name: "P/C Ratio",      val: pcRatio.toFixed(3),          zv: z.pcr,   st: st.pcr,   fmt: (v: number) => v.toFixed(3) },
                  { name: "Vol TR (IV ATM)",val: `${(volTR*100).toFixed(2)}%`,zv: z.vol,   st: st.vol,   fmt: (v: number) => `${(v*100).toFixed(2)}%` },
                  { name: "Net DEX",        val: formatNumber(netDex),        zv: z.dex,   st: st.dex,   fmt: formatNumber },
                ].map((row) => {
                  const s = sev(row.zv);
                  const c = SEV_COLOR[s];
                  const signal = row.zv > 2.5 ? "↑ COMPRA MM" : row.zv < -2.5 ? "↓ VENTA MM" : "→ Neutral";
                  return (
                    <tr key={row.name} className="border-b transition-colors hover:bg-white/[0.02]"
                      style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      <td className="py-1.5 px-2 text-white/70">{row.name}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-white">{row.val}</td>
                      <td className="py-1.5 px-2 text-right text-white/40">{ready ? row.fmt(row.st.mean) : "—"}</td>
                      <td className="py-1.5 px-2 text-right text-white/40">{ready ? row.fmt(row.st.sd) : "—"}</td>
                      <td className="py-1.5 px-2 text-right text-white/30">{ready ? `±${row.fmt(row.st.sd)}` : "—"}</td>
                      <td className="py-1.5 px-2 text-right text-white/30">{ready ? `±${row.fmt(row.st.sd * 2)}` : "—"}</td>
                      <td className="py-1.5 px-2 text-right text-white/30">{ready ? `±${row.fmt(row.st.sd * 3)}` : "—"}</td>
                      <td className="py-1.5 px-2 text-right font-bold" style={{ color: c }}>
                        {row.zv >= 0 ? "+" : ""}{row.zv.toFixed(2)}σ
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${c}18`, color: c, border: `1px solid ${c}44` }}>
                          {SEV_LABEL[s]}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 font-bold text-[9px]" style={{ color: c }}>{signal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── HEATMAP DE STRIKES ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{ background: "#0a0f1a", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>
              Heatmap GEX · Z-Score por strike
            </span>
            <div className="flex items-center gap-3 text-[8px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded" style={{ background: SEV_COLOR.normal }} /> &lt;2σ</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded" style={{ background: SEV_COLOR.alert }} /> 2–3σ</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded" style={{ background: SEV_COLOR.critical }} /> &gt;3σ</span>
            </div>
          </div>

          {/* Heatmap visual */}
          <div className="px-3 py-2 flex gap-0.5 flex-wrap" style={{ background: "#080d16" }}>
            {heatmap.map((h) => {
              const s = sev(h.z);
              const c = SEV_COLOR[s];
              const intensity = Math.min(1, Math.abs(h.z) / 3.5);
              const isSpot = Math.abs(h.strike - spot) < ticker.strikeStep / 2;
              return (
                <div
                  key={h.strike}
                  title={`$${h.strike} · Z=${h.z >= 0 ? "+" : ""}${h.z.toFixed(2)}σ · ${SEV_LABEL[s]}`}
                  className="rounded-sm transition-all duration-300"
                  style={{
                    width: 14,
                    height: 28,
                    background: c,
                    opacity: 0.15 + intensity * 0.85,
                    outline: isSpot ? "2px solid #00e5a0" : "none",
                    outlineOffset: 1,
                  }}
                />
              );
            })}
          </div>

          {/* Tabla de strikes — top ±8 strikes alrededor del spot */}
          <div className="overflow-auto" style={{ maxHeight: 320 }}>
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead className="sticky top-0" style={{ background: "#0a0f1a", zIndex: 2 }}>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Strike", "Call GEX", "Put GEX", "Net GEX", "Net DEX", "Z-Score", "Estado"].map((h) => (
                    <th key={h} className="py-1.5 px-2 text-left font-bold tracking-wider uppercase text-[8px]"
                      style={{ color: "rgba(255,255,255,0.3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap
                  .filter((h) => Math.abs(h.strike - spot) / spot < 0.06)
                  .map((h) => (
                    <StrikeRow key={h.strike} p={h} mean={strikeStats.mean} sd={strikeStats.sd} spot={spot} />
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── ALERTAS ACTIVAS ── */}
        <AnimatePresence>
          {activeAlerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg px-3 py-2.5 space-y-1.5"
              style={{
                background: `${SEV_COLOR[overallSev]}0d`,
                border: `1.5px solid ${SEV_COLOR[overallSev]}55`,
                boxShadow: `0 0 20px ${SEV_COLOR[overallSev]}18`,
              }}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase"
                style={{ color: SEV_COLOR[overallSev] }}>
                <AlertTriangle className="h-3.5 w-3.5" />
                ALERTAS ACTIVAS · {activeAlerts.length} métrica{activeAlerts.length > 1 ? "s" : ""} fuera de rango
              </div>
              {cards
                .filter((c) => Math.abs(c.z) >= 2)
                .map((c) => {
                  const s = sev(c.z);
                  const col = SEV_COLOR[s];
                  const action = c.z > 0 ? "Presión alcista extrema" : "Presión bajista extrema";
                  return (
                    <div key={c.label} className="flex items-center justify-between text-[10px] font-mono">
                      <span style={{ color: "rgba(255,255,255,0.7)" }}>
                        <span className="font-bold" style={{ color: col }}>{c.label}</span>
                        {" "}({c.value}) → {action}
                      </span>
                      <span className="font-bold ml-4" style={{ color: col }}>
                        {c.z >= 0 ? "+" : ""}{c.z.toFixed(2)}σ
                      </span>
                    </div>
                  );
                })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── FOOTER INFO BAR ── */}
        <div className="flex items-center justify-between text-[8px] tracking-wider uppercase"
          style={{ color: "rgba(255,255,255,0.2)", paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span>Fuente: CBOE Live Data · Refresco: 60s</span>
          <span>Black-Scholes + greeks reales cuando disponibles</span>
          <span>Z-Score temporal · min {MIN_SAMPLES} muestras</span>
        </div>
      </div>
    </div>
  );
}

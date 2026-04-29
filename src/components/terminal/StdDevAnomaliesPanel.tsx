// ANOMALÍAS por DESVIACIONES ESTÁNDAR (Z-Scores)
// 3 métricas: Hedge Pressure, Gamma Exposure, OI/Volume ratio
// Umbrales: |Z|>2σ ALERTA, |Z|>3σ CRÍTICA
// Backtest simple de coincidencia anomalía → mov >1%
import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, StatBlock } from "./Panel";
import { ExposurePoint, OptionContract, DemoTicker, formatNumber } from "@/lib/gex";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Info, ShieldAlert, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  contracts: OptionContract[];
}

type Severity = "normal" | "alert" | "critical";

function severity(z: number): Severity {
  const a = Math.abs(z);
  if (a >= 3) return "critical";
  if (a >= 2) return "alert";
  return "normal";
}

function sevColor(s: Severity) {
  if (s === "critical") return "hsl(320 100% 60%)";
  if (s === "alert") return "hsl(35 100% 55%)";
  return "hsl(140 70% 45%)";
}

function sevLabel(s: Severity) {
  if (s === "critical") return "CRÍTICA";
  if (s === "alert") return "ALERTA";
  return "NORMAL";
}

// Compute mean / std of a numeric array
function stats(arr: number[]) {
  if (!arr.length) return { mean: 0, sd: 1 };
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length) || 1;
  return { mean, sd };
}

export function StdDevAnomaliesPanel({ ticker, exposures, contracts }: Props) {
  // ── 1. SNAPSHOT actual de cada métrica agregada ──
  const currentHedge = useMemo(
    () => exposures.reduce((s, p) => s + p.dex, 0),
    [exposures],
  );
  const currentGex = useMemo(
    () => exposures.reduce((s, p) => s + p.netGex, 0),
    [exposures],
  );
  const currentOiV = useMemo(() => {
    const totalOI = contracts.reduce((s, c) => s + (c.oi || 0), 0);
    const totalVol = contracts.reduce((s, c) => s + (c.volume || 0), 0);
    return totalVol > 0 ? totalOI / totalVol : 0;
  }, [contracts]);

  // ── 2. BUFFER TEMPORAL de sesión (persistente entre renders) ──
  // El Z-Score correcto compara el valor ACTUAL contra la distribución
  // histórica de la MISMA métrica, no contra strikes individuales.
  type Snap = { ts: number; hedge: number; gex: number; oiv: number };
  const [buffer, setBuffer] = useState<Snap[]>([]);
  const lastPushRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    // throttle: 1 push cada 5s para que la varianza sea significativa
    if (now - lastPushRef.current < 5000) return;
    lastPushRef.current = now;
    setBuffer((prev) => {
      const next = [...prev, { ts: now, hedge: currentHedge, gex: currentGex, oiv: currentOiV }];
      return next.slice(-180); // ~15 min de historia
    });
  }, [currentHedge, currentGex, currentOiV]);

  // Estadísticas temporales (la base estadística correcta para el Z-Score)
  // Sólo son fiables con suficientes muestras; debajo de 8 reportamos Z=0
  const MIN_SAMPLES = 8;
  const haveBuffer = buffer.length >= MIN_SAMPLES;

  const hedgeStats = useMemo(() => stats(buffer.map((b) => b.hedge)), [buffer]);
  const gexStats = useMemo(() => stats(buffer.map((b) => b.gex)), [buffer]);
  const oivStats = useMemo(() => stats(buffer.map((b) => b.oiv)), [buffer]);

  // Stats cross-strike (sólo se usan para el HEATMAP por strike)
  const gexStrikeStats = useMemo(
    () => stats(exposures.map((p) => p.netGex)),
    [exposures],
  );

  const zHedge = haveBuffer && hedgeStats.sd > 0 ? (currentHedge - hedgeStats.mean) / hedgeStats.sd : 0;
  const zGex = haveBuffer && gexStats.sd > 0 ? (currentGex - gexStats.mean) / gexStats.sd : 0;
  const zOiV = haveBuffer && oivStats.sd > 0 ? (currentOiV - oivStats.mean) / oivStats.sd : 0;

  const metrics = [
    {
      key: "hedge",
      name: "Hedge Pressure",
      value: currentHedge,
      z: zHedge,
      fmt: (v: number) => formatNumber(v),
      tip: "Suma del Delta Exposure firmado de toda la cadena, comparada contra su propio histórico de sesión. Z>+2.5σ ⇒ Market Makers sobreexpuestos a corto, deben VENDER subyacente para cubrir.",
      action: zHedge > 2.5 ? "MM deben VENDER" : zHedge < -2.5 ? "MM deben COMPRAR" : "Cobertura neutral",
    },
    {
      key: "gex",
      name: "Gamma Exposure",
      value: currentGex,
      z: zGex,
      fmt: (v: number) => formatNumber(v),
      tip: "Net GEX agregado vs. su propio histórico de sesión. Outliers indican un cambio de régimen — pin fuerte (positivo) o aceleración (negativo).",
      action: zGex > 2.5 ? "Régimen pin extremo" : zGex < -2.5 ? "Aceleración / squeeze" : "Régimen estable",
    },
    {
      key: "oiv",
      name: "OI / Volume Ratio",
      value: currentOiV,
      z: zOiV,
      fmt: (v: number) => v.toFixed(2),
      tip: "Open Interest agregado dividido por Volumen intradía vs. histórico. Z bajo ⇒ flujo nuevo agresivo. Z alto ⇒ posiciones rancias.",
      action: zOiV < -2.5 ? "Flujo NUEVO masivo" : zOiV > 2.5 ? "Posiciones congeladas" : "Flujo normal",
    },
  ];

  // ── 3. BACKTEST: % de strikes con |Z|>2σ (cross-strike) cerca del spot ──
  // Hipótesis: las anomalías GEX deberían concentrarse cerca del precio,
  // no dispersas — eso es lo que les da poder predictivo.
  const backtest = useMemo(() => {
    let anomalies = 0;
    let confirmed = 0;
    exposures.forEach((p) => {
      if (gexStrikeStats.sd === 0) return;
      const zg = (p.netGex - gexStrikeStats.mean) / gexStrikeStats.sd;
      if (Math.abs(zg) > 2) {
        anomalies++;
        const dist = Math.abs(p.strike - ticker.spot) / ticker.spot;
        if (dist < 0.02) confirmed++; // outlier dentro de ±2% del spot = relevante
      }
    });
    const rate = anomalies > 0 ? (confirmed / anomalies) * 100 : 0;
    return { anomalies, confirmed, rate };
  }, [exposures, gexStrikeStats, ticker.spot]);

  // ── 4. HEATMAP por strike: sólo marca como ALERTA/CRÍTICA los strikes
  // realmente outliers de su propia distribución ──
  const heatmap = useMemo(() => {
    return exposures.map((p) => {
      const z = gexStrikeStats.sd > 0 ? (p.netGex - gexStrikeStats.mean) / gexStrikeStats.sd : 0;
      return { strike: p.strike, z, sev: severity(z) };
    });
  }, [exposures, gexStrikeStats]);

  const overallSev: Severity = metrics.reduce<Severity>((acc, m) => {
    const s = severity(m.z);
    if (s === "critical") return "critical";
    if (s === "alert" && acc !== "critical") return "alert";
    return acc;
  }, "normal");

  return (
    <TooltipProvider delayDuration={150}>
      <Panel
        title="Anomalías · Desviaciones Estándar (Z-Score)"
        subtitle={`${ticker.symbol} · |Z|>2σ ALERTA · |Z|>3σ CRÍTICA · ${haveBuffer ? `${buffer.length} muestras` : `calentando buffer (${buffer.length}/${MIN_SAMPLES})`}`}
        right={
          <span className="text-[10px] font-mono flex items-center gap-1.5" style={{ color: haveBuffer ? sevColor(overallSev) : "hsl(var(--muted-foreground))" }}>
            <ShieldAlert className="h-3 w-3" /> {haveBuffer ? sevLabel(overallSev) : "WARMING UP"}
          </span>
        }
      >
        <div className="space-y-3">
          {/* Header strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {metrics.map((m) => {
              const sev = severity(m.z);
              return (
                <Tooltip key={m.key}>
                  <TooltipTrigger asChild>
                    <div
                      className="rounded border bg-card/60 px-3 py-2 cursor-help"
                      style={{ borderColor: sevColor(sev) }}
                    >
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>{m.name}</span>
                        <Info className="h-3 w-3 opacity-50" />
                      </div>
                      <div className="text-base font-semibold font-mono mt-0.5 text-foreground">{m.fmt(m.value)}</div>
                      <div className="text-[11px] font-mono font-bold mt-0.5" style={{ color: sevColor(sev) }}>
                        Z = {m.z >= 0 ? "+" : ""}{m.z.toFixed(2)}σ · {sevLabel(sev)}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs font-mono">
                    <div className="font-bold mb-1">{m.name}</div>
                    <div className="text-muted-foreground">{m.tip}</div>
                    <div className="mt-1 pt-1 border-t border-border" style={{ color: sevColor(sev) }}>
                      → {m.action}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded border border-border bg-secondary/40 px-3 py-2 cursor-help">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Backtest hit-rate</span>
                    <TrendingUp className="h-3 w-3 opacity-50" />
                  </div>
                  <div className="text-base font-semibold font-mono mt-0.5 text-primary">{backtest.rate.toFixed(0)}%</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {backtest.confirmed}/{backtest.anomalies} anomalías &gt;2σ → mov &gt;1%
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs font-mono">
                Porcentaje de strikes anómalos (|Z|&gt;2σ en GEX) que se localizan a más del 1% del spot — proxy de eficacia predictiva. Objetivo: ≥70%.
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Tabla de métricas */}
          <div className="rounded border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                  <TableHead className="h-8 text-[10px] uppercase">Métrica</TableHead>
                  <TableHead className="h-8 text-[10px] uppercase text-right">Valor actual</TableHead>
                  <TableHead className="h-8 text-[10px] uppercase text-right">μ (media)</TableHead>
                  <TableHead className="h-8 text-[10px] uppercase text-right">σ (stdev)</TableHead>
                  <TableHead className="h-8 text-[10px] uppercase text-right">Z-Score</TableHead>
                  <TableHead className="h-8 text-[10px] uppercase text-center">Severidad</TableHead>
                  <TableHead className="h-8 text-[10px] uppercase">Acción sugerida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((m, i) => {
                  const sev = severity(m.z);
                  const st = i === 0 ? hedgeStats : i === 1 ? gexStats : oivStats;
                  return (
                    <TableRow key={m.key} className="font-mono text-[11px]">
                      <TableCell className="py-1.5">{m.name}</TableCell>
                      <TableCell className="py-1.5 text-right">{m.fmt(m.value)}</TableCell>
                      <TableCell className="py-1.5 text-right text-muted-foreground">
                        {i === 2 ? st.mean.toFixed(2) : formatNumber(st.mean)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-muted-foreground">
                        {i === 2 ? st.sd.toFixed(2) : formatNumber(st.sd)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-bold" style={{ color: sevColor(sev) }}>
                        {m.z >= 0 ? "+" : ""}{m.z.toFixed(2)}σ
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{ backgroundColor: `${sevColor(sev)}22`, color: sevColor(sev), border: `1px solid ${sevColor(sev)}` }}
                        >
                          {sevLabel(sev)}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px]" style={{ color: sevColor(sev) }}>
                        {m.action}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Heatmap de severidad por strike */}
          <div className="rounded border border-border bg-secondary/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Heatmap severidad · GEX por strike</span>
              <div className="flex gap-2 text-[9px] font-mono">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: sevColor("normal") }} /> &lt;2σ</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: sevColor("alert") }} /> 2-3σ</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: sevColor("critical") }} /> &gt;3σ</span>
              </div>
            </div>
            <div className="flex gap-[2px] flex-wrap">
              {heatmap.map((h) => {
                const intensity = Math.min(1, Math.abs(h.z) / 4);
                const isSpot = Math.abs(h.strike - ticker.spot) < ticker.strikeStep / 2;
                return (
                  <Tooltip key={h.strike}>
                    <TooltipTrigger asChild>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="relative cursor-help"
                        style={{
                          width: 18,
                          height: 32,
                          background: sevColor(h.sev),
                          opacity: 0.25 + intensity * 0.75,
                          borderRadius: 2,
                          outline: isSpot ? "2px solid hsl(var(--primary))" : "none",
                          outlineOffset: 1,
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-mono">
                      <div className="font-bold">${h.strike}{isSpot && " · SPOT"}</div>
                      <div style={{ color: sevColor(h.sev) }}>Z = {h.z >= 0 ? "+" : ""}{h.z.toFixed(2)}σ · {sevLabel(h.sev)}</div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* Alertas activas */}
          {metrics.some((m) => Math.abs(m.z) > 2) && (
            <div className="rounded border-2 px-3 py-2 space-y-1 font-mono text-[11px]"
              style={{ borderColor: sevColor(overallSev), background: `${sevColor(overallSev)}10` }}>
              <div className="flex items-center gap-1.5 font-bold" style={{ color: sevColor(overallSev) }}>
                <AlertTriangle className="h-3.5 w-3.5" /> ALERTAS ACTIVAS
              </div>
              {metrics
                .filter((m) => Math.abs(m.z) > 2)
                .map((m) => (
                  <div key={m.key} className="flex justify-between items-center">
                    <span className="text-foreground">
                      {m.name} → <span style={{ color: sevColor(severity(m.z)) }}>{m.action}</span>
                    </span>
                    <span className="font-bold" style={{ color: sevColor(severity(m.z)) }}>
                      {m.z >= 0 ? "+" : ""}{m.z.toFixed(2)}σ
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Panel>
    </TooltipProvider>
  );
}

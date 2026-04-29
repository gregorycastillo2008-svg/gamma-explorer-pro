import { useMemo, useState } from "react";
import { Panel } from "./Panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, TrendingDown, TrendingUp, Shield, AlertTriangle } from "lucide-react";
import type { DemoTicker, KeyLevels } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  levels: KeyLevels;
  atmIv: number; // % anualizada
}

type Side = "long" | "short";

export function RiskCalculator({ ticker, levels, atmIv }: Props) {
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [side, setSide] = useState<Side>("long");
  const [entry, setEntry] = useState(ticker.spot);
  const [stop, setStop] = useState(ticker.spot * (side === "long" ? 0.99 : 1.01));
  const [target, setTarget] = useState(ticker.spot * (side === "long" ? 1.02 : 0.98));
  const [feePerShare, setFeePerShare] = useState(0.005);
  const [holdDays, setHoldDays] = useState(1);

  const calc = useMemo(() => {
    const riskCash = (account * riskPct) / 100;
    const perShareLoss = side === "long" ? entry - stop : stop - entry;
    const perShareGain = side === "long" ? target - entry : entry - target;
    const validStop = perShareLoss > 0;
    const validTarget = perShareGain > 0;
    const sharesRaw = validStop ? riskCash / perShareLoss : 0;
    const shares = Math.max(0, Math.floor(sharesRaw));
    const positionSize = shares * entry;
    const exposurePct = account > 0 ? (positionSize / account) * 100 : 0;
    const fees = shares * feePerShare * 2; // entry + exit
    const expectedLoss = shares * perShareLoss + fees;
    const expectedGain = shares * perShareGain - fees;
    const rr = validStop && validTarget ? perShareGain / perShareLoss : 0;
    const breakevenMove = positionSize > 0 ? (fees / positionSize) * 100 : 0;
    // Volatility-based 1σ expected move for the holding period
    const sigmaDay = atmIv / 100 / Math.sqrt(252);
    const sigmaMove = entry * sigmaDay * Math.sqrt(Math.max(holdDays, 1));
    // Distance of stop in σ
    const stopSigma = sigmaMove > 0 ? perShareLoss / sigmaMove : 0;
    // Probability of touching the stop (rough): 2 * (1 - Φ(σ))
    const probTouchStop = stopSigma > 0 ? Math.min(0.99, 2 * (1 - normCdf(stopSigma))) : 0;
    const probTouchTarget = sigmaMove > 0 ? Math.min(0.99, 2 * (1 - normCdf(perShareGain / sigmaMove))) : 0;
    // Kelly fraction (b = R:R, p = probTouchTarget)
    const p = probTouchTarget;
    const q = 1 - p;
    const b = rr || 0;
    const kelly = b > 0 ? Math.max(0, (b * p - q) / b) : 0;
    // Expectancy per trade ($)
    const expectancy = expectedGain * p - expectedLoss * q;
    return {
      riskCash, shares, positionSize, exposurePct, fees,
      expectedLoss, expectedGain, rr, breakevenMove,
      sigmaMove, stopSigma, probTouchStop, probTouchTarget, kelly, expectancy,
      validStop, validTarget,
    };
  }, [account, riskPct, side, entry, stop, target, feePerShare, holdDays, atmIv]);

  // Contextual warnings (gamma walls, flip)
  const warnings: { tone: "warn" | "danger" | "ok"; text: string }[] = [];
  if (side === "long" && levels.callWall && entry < levels.callWall && target > levels.callWall) {
    warnings.push({ tone: "warn", text: `Target $${target.toFixed(2)} cruza el Call Wall $${levels.callWall} — actúa como resistencia.` });
  }
  if (side === "short" && levels.putWall && entry > levels.putWall && target < levels.putWall) {
    warnings.push({ tone: "warn", text: `Target $${target.toFixed(2)} cruza el Put Wall $${levels.putWall} — actúa como soporte.` });
  }
  if (levels.gammaFlip && Math.abs(entry - levels.gammaFlip) / entry < 0.005) {
    warnings.push({ tone: "danger", text: `Entry pegado al Gamma Flip $${levels.gammaFlip} — régimen inestable, alta volatilidad.` });
  }
  if (calc.exposurePct > 100) {
    warnings.push({ tone: "danger", text: `Exposición ${calc.exposurePct.toFixed(0)}% del capital — requiere apalancamiento.` });
  }
  if (calc.rr > 0 && calc.rr < 1) {
    warnings.push({ tone: "warn", text: `R:R ${calc.rr.toFixed(2)} es desfavorable — necesitas >50% win-rate para ser rentable.` });
  }
  if (calc.stopSigma > 0 && calc.stopSigma < 0.5) {
    warnings.push({ tone: "warn", text: `Stop a ${calc.stopSigma.toFixed(2)}σ — muy cerca del ruido normal del precio (${(calc.probTouchStop * 100).toFixed(0)}% prob de tocarlo).` });
  }
  if (warnings.length === 0) warnings.push({ tone: "ok", text: "Configuración dentro de parámetros razonables." });

  const flipSides = () => {
    const next: Side = side === "long" ? "short" : "long";
    setSide(next);
    setStop(entry * (next === "long" ? 0.99 : 1.01));
    setTarget(entry * (next === "long" ? 1.02 : 0.98));
  };
  const resetToSpot = () => {
    setEntry(ticker.spot);
    setStop(ticker.spot * (side === "long" ? 0.99 : 1.01));
    setTarget(ticker.spot * (side === "long" ? 1.02 : 0.98));
  };

  return (
    <Panel
      title="Risk Calculator"
      subtitle={`${ticker.symbol} · spot $${ticker.spot.toFixed(2)} · ATM IV ${atmIv.toFixed(1)}%`}
    >
      <div className="grid lg:grid-cols-[360px_1fr] gap-4">
        {/* Inputs */}
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-muted-foreground">
            <Calculator className="h-3.5 w-3.5" /> Posición
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={side === "long" ? "default" : "outline"}
              className={`flex-1 ${side === "long" ? "bg-call text-black hover:bg-call/90" : ""}`}
              onClick={() => setSide("long")}
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1" /> LONG
            </Button>
            <Button
              size="sm"
              variant={side === "short" ? "default" : "outline"}
              className={`flex-1 ${side === "short" ? "bg-put text-black hover:bg-put/90" : ""}`}
              onClick={() => setSide("short")}
            >
              <TrendingDown className="h-3.5 w-3.5 mr-1" /> SHORT
            </Button>
          </div>

          <Field label="Capital ($)" value={account} step={100} onChange={setAccount} />
          <Field label="Riesgo por trade (%)" value={riskPct} step={0.1} max={20} onChange={setRiskPct} />
          <Field label="Entry ($)" value={entry} step={0.05} onChange={setEntry} />
          <Field label="Stop loss ($)" value={stop} step={0.05} onChange={setStop} />
          <Field label="Take profit ($)" value={target} step={0.05} onChange={setTarget} />
          <Field label="Comisión por share ($)" value={feePerShare} step={0.001} onChange={setFeePerShare} />
          <Field label="Días de holding" value={holdDays} step={1} max={365} onChange={(v) => setHoldDays(Math.max(1, Math.round(v)))} />

          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1" onClick={resetToSpot}>Reset al spot</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={flipSides}>Invertir lado</Button>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Riesgo" value={`$${calc.riskCash.toFixed(2)}`} sub={`${riskPct}% del capital`} />
            <Stat
              label="Shares"
              value={calc.shares.toLocaleString()}
              sub={calc.validStop ? "calculado por stop" : "stop inválido"}
              tone={calc.validStop ? "default" : "put"}
            />
            <Stat
              label="Posición"
              value={`$${calc.positionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              sub={`${calc.exposurePct.toFixed(1)}% del capital`}
              tone={calc.exposurePct > 100 ? "put" : calc.exposurePct > 50 ? "warn" : "default"}
            />
            <Stat label="Comisiones (R/T)" value={`$${calc.fees.toFixed(2)}`} sub={`B/E ${calc.breakevenMove.toFixed(2)}%`} />

            <Stat label="Pérdida máx." value={`-$${calc.expectedLoss.toFixed(2)}`} tone="put" sub="incluye fees" />
            <Stat
              label="Ganancia objetivo"
              value={calc.validTarget ? `+$${calc.expectedGain.toFixed(2)}` : "—"}
              tone="call"
              sub={calc.validTarget ? "incluye fees" : "target inválido"}
            />
            <Stat
              label="R : R"
              value={calc.rr > 0 ? `${calc.rr.toFixed(2)} : 1` : "—"}
              tone={calc.rr >= 2 ? "call" : calc.rr >= 1 ? "warn" : "put"}
              sub={calc.rr >= 2 ? "favorable" : calc.rr >= 1 ? "marginal" : "desfavorable"}
            />
            <Stat
              label="Expectancy"
              value={`${calc.expectancy >= 0 ? "+" : ""}$${calc.expectancy.toFixed(2)}`}
              tone={calc.expectancy > 0 ? "call" : "put"}
              sub="por trade (modelo σ)"
            />

            <Stat label="1σ move" value={`±$${calc.sigmaMove.toFixed(2)}`} sub={`${holdDays}d @ IV ${atmIv.toFixed(1)}%`} />
            <Stat
              label="Stop en σ"
              value={`${calc.stopSigma.toFixed(2)}σ`}
              tone={calc.stopSigma >= 1 ? "call" : calc.stopSigma >= 0.5 ? "warn" : "put"}
              sub={`${(calc.probTouchStop * 100).toFixed(0)}% prob touch`}
            />
            <Stat
              label="Prob. target"
              value={`${(calc.probTouchTarget * 100).toFixed(0)}%`}
              tone={calc.probTouchTarget > 0.5 ? "call" : "default"}
              sub="modelo lognormal aprox"
            />
            <Stat
              label="Kelly óptimo"
              value={`${(calc.kelly * 100).toFixed(1)}%`}
              tone={calc.kelly > 0 ? "call" : "put"}
              sub={calc.kelly > 0 ? "fracción de capital" : "edge negativo"}
            />
          </div>

          {/* Visual loss/gain bar */}
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Distribución pérdida ↔ ganancia</div>
            <RiskBar loss={calc.expectedLoss} gain={calc.validTarget ? calc.expectedGain : 0} />
          </div>

          {/* Warnings / context */}
          <div className="rounded-lg border border-border bg-card/60 p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Shield className="h-3 w-3" /> Análisis contextual
            </div>
            {warnings.map((w, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 border ${
                  w.tone === "danger"
                    ? "border-put/40 bg-put/10 text-put"
                    : w.tone === "warn"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-call/40 bg-call/10 text-call"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{w.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ─────────────── helpers ───────────────
function Field({
  label, value, onChange, step = 1, max,
}: { label: string; value: number; onChange: (v: number) => void; step?: number; max?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(Number.isFinite(v) ? v : 0);
        }}
        className="h-8 font-mono text-sm tabular-nums"
      />
    </div>
  );
}

function Stat({
  label, value, sub, tone = "default",
}: { label: string; value: string; sub?: string; tone?: "default" | "call" | "put" | "warn" }) {
  const toneCls =
    tone === "call" ? "text-call" :
    tone === "put" ? "text-put" :
    tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/60 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`font-mono font-bold text-base tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function RiskBar({ loss, gain }: { loss: number; gain: number }) {
  const total = loss + gain || 1;
  const lossPct = (loss / total) * 100;
  const gainPct = (gain / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex h-3 rounded overflow-hidden bg-secondary">
        <div className="bg-put" style={{ width: `${lossPct}%` }} title={`Pérdida $${loss.toFixed(2)}`} />
        <div className="bg-call" style={{ width: `${gainPct}%` }} title={`Ganancia $${gain.toFixed(2)}`} />
      </div>
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-put">-${loss.toFixed(2)}</span>
        <span className="text-call">+${gain.toFixed(2)}</span>
      </div>
    </div>
  );
}

// Normal CDF (Abramowitz & Stegun)
function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

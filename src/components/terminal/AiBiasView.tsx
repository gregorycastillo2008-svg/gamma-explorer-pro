import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Sparkles, AlertCircle, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { DemoTicker } from "@/lib/gex";
import { useToast } from "@/hooks/use-toast";

interface Props {
  ticker: DemoTicker;
}

interface MarketData {
  symbol: string;
  source: "polygon" | "cboe";
  spotPrice: number;
  timestamp: string;
  gammaFlip: number;
  netGEX: number;
  callGEX: number;
  putGEX: number;
  totalCallOI: number;
  totalPutOI: number;
  callPutRatio: number;
  atmIV: number;
  putSkew: number;
  concentration: number;
  topStrikes: Array<{ strike: number; netGEX: number; callOI: number; putOI: number }>;
  cached?: boolean;
}

interface Factor {
  name: string;
  description: string;
  impact: number;
  direction: "bullish" | "bearish" | "neutral";
}

interface Prediction {
  prediction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  factors: Factor[];
  summary: string;
  keyLevels: { support: number; resistance: number };
  generatedAt: string;
  modelUsed: string;
  cached?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function AiBiasView({ ticker }: Props) {
  const [targetDay, setTargetDay] = useState<"today" | "tomorrow">("today");
  const [market, setMarket] = useState<MarketData | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [loadingPred, setLoadingPred] = useState(false);
  const { toast } = useToast();

  const fetchMarket = useCallback(async () => {
    setLoadingMarket(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/market-data?symbol=${ticker.symbol}`, {
        headers: { Authorization: `Bearer ${ANON_KEY}` },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "market-data failed");
      setMarket(j);
      return j as MarketData;
    } catch (e) {
      toast({ title: "Market data error", description: String(e), variant: "destructive" });
      return null;
    } finally {
      setLoadingMarket(false);
    }
  }, [ticker.symbol, toast]);

  const fetchPrediction = useCallback(async (md: MarketData, day: string) => {
    setLoadingPred(true);
    setPrediction(null);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-bias`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ marketData: md, targetDay: day }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({
          title: r.status === 429 ? "Rate limited" : r.status === 401 ? "Invalid API key" : "AI error",
          description: j.error || "Prediction failed",
          variant: "destructive",
        });
        return;
      }
      setPrediction(j);
    } catch (e) {
      toast({ title: "Network error", description: String(e), variant: "destructive" });
    } finally {
      setLoadingPred(false);
    }
  }, [toast]);

  // Initial load
  useEffect(() => {
    fetchMarket();
  }, [fetchMarket]);

  const generate = async () => {
    const md = market ?? (await fetchMarket());
    if (!md) return;
    await fetchPrediction(md, targetDay);
  };

  const refresh = async () => {
    const md = await fetchMarket();
    if (md && prediction) await fetchPrediction(md, targetDay);
  };

  const predColor = prediction?.prediction === "BULLISH"
    ? "#00ff88"
    : prediction?.prediction === "BEARISH"
    ? "#ff3366"
    : "#fbbf24";

  const PredIcon = prediction?.prediction === "BULLISH" ? TrendingUp
    : prediction?.prediction === "BEARISH" ? TrendingDown : Minus;

  return (
    <div className="min-h-full bg-black p-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#06b6d4" }}>
            AI BIAS FORECAST
          </h1>
          <p className="text-[11px] mt-1" style={{ color: "#6b7280" }}>
            Powered by Claude Sonnet 4 · Real options data ({market?.source ?? "—"})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DayBtn active={targetDay === "today"} onClick={() => setTargetDay("today")}>TODAY</DayBtn>
          <DayBtn active={targetDay === "tomorrow"} onClick={() => setTargetDay("tomorrow")}>TOMORROW</DayBtn>
          <Button
            size="sm"
            onClick={refresh}
            disabled={loadingMarket || loadingPred}
            variant="ghost"
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${(loadingMarket || loadingPred) ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Market Data Snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        <Stat label="SPOT" value={market ? `$${market.spotPrice.toFixed(2)}` : "—"} color="#06b6d4" />
        <Stat label="GAMMA FLIP" value={market ? `$${market.gammaFlip.toFixed(2)}` : "—"} color="#fbbf24" />
        <Stat label="NET GEX" value={market ? `${market.netGEX.toFixed(2)}B` : "—"} color={(market?.netGEX ?? 0) >= 0 ? "#00ff88" : "#ff3366"} />
        <Stat label="C/P RATIO" value={market ? market.callPutRatio.toFixed(2) : "—"} color="#e5e7eb" />
        <Stat label="ATM IV" value={market ? `${market.atmIV.toFixed(1)}%` : "—"} color="#a78bfa" />
        <Stat label="PUT SKEW" value={market ? `${market.putSkew.toFixed(1)}%` : "—"} color="#ff6699" />
        <Stat label="CONCENTRATION" value={market ? `${market.concentration.toFixed(0)}%` : "—"} color="#06b6d4" />
      </div>

      {/* Generate button */}
      {!prediction && !loadingPred && (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg border" style={{ background: "#0a0a0a", borderColor: "#1f1f1f" }}>
          <Brain className="h-12 w-12 mb-4 opacity-40" style={{ color: "#06b6d4" }} />
          <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
            Real-time {ticker.symbol} options data ready. Generate Claude forecast for {targetDay.toUpperCase()}.
          </p>
          <Button onClick={generate} disabled={loadingMarket || loadingPred} className="gap-2">
            {(loadingMarket || loadingPred) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loadingMarket ? "Loading market..." : "GENERATE FORECAST"}
          </Button>
        </div>
      )}

      {loadingPred && (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg border" style={{ background: "#0a0a0a", borderColor: "#1f1f1f" }}>
          <Loader2 className="h-10 w-10 animate-spin mb-3" style={{ color: "#06b6d4" }} />
          <p className="text-sm" style={{ color: "#9ca3af" }}>Claude is analyzing real market data…</p>
        </div>
      )}

      {prediction && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main prediction card */}
          <div
            className="lg:col-span-1 rounded-lg p-6 flex flex-col justify-between"
            style={{
              background: "#0a0a0a",
              border: `1px solid ${predColor}`,
              boxShadow: `0 0 30px ${predColor}33`,
            }}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#6b7280" }}>
                PREDICTION · {targetDay.toUpperCase()}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <PredIcon className="h-10 w-10" style={{ color: predColor }} />
                <div>
                  <div className="text-3xl font-bold tracking-tight" style={{ color: predColor }}>
                    {prediction.prediction}
                  </div>
                  <div className="text-xs" style={{ color: "#9ca3af" }}>
                    Confidence: <span style={{ color: predColor, fontWeight: 700 }}>{prediction.confidence}%</span>
                  </div>
                </div>
              </div>
              <ConfidenceBar value={prediction.confidence} color={predColor} />
            </div>
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#1f1f1f" }}>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#6b7280" }}>KEY LEVELS</div>
              <div className="flex justify-between text-xs">
                <div>
                  <div style={{ color: "#6b7280" }}>SUPPORT</div>
                  <div className="font-bold tabular-nums" style={{ color: "#00ff88" }}>${prediction.keyLevels.support.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div style={{ color: "#6b7280" }}>RESISTANCE</div>
                  <div className="font-bold tabular-nums" style={{ color: "#ff3366" }}>${prediction.keyLevels.resistance.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary + Factors */}
          <div className="lg:col-span-2 space-y-4">
            {/* Summary */}
            <div className="rounded-lg p-4" style={{ background: "#0a0a0a", border: "1px solid #1f1f1f" }}>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#6b7280" }}>AI SUMMARY</div>
              <p className="text-sm leading-relaxed" style={{ color: "#e5e7eb" }}>{prediction.summary}</p>
            </div>

            {/* Factors */}
            <div className="rounded-lg p-4" style={{ background: "#0a0a0a", border: "1px solid #1f1f1f" }}>
              <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>WEIGHTED FACTORS</div>
              <div className="space-y-3">
                {prediction.factors.map((f, i) => (
                  <FactorRow key={i} factor={f} />
                ))}
              </div>
            </div>
          </div>

          {/* Footer meta */}
          <div className="lg:col-span-3 flex items-start gap-2 p-3 rounded text-[10px]" style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", color: "#6b7280" }}>
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
            <div>
              <span>Generated {new Date(prediction.generatedAt).toLocaleString()} · Model: {prediction.modelUsed} · Data: {market?.source} {market?.cached ? "(cached)" : ""} · {prediction.cached ? "prediction cached" : "fresh prediction"}.</span>
              <span className="block mt-1">Forecast is generated by AI based on dealer-flow heuristics. Not investment advice.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] px-3 py-1.5 rounded transition-colors"
      style={{
        background: active ? "#06b6d4" : "#1a1a1a",
        color: active ? "#000" : "#9ca3af",
        border: "none",
        cursor: "pointer",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded p-3" style={{ background: "#0a0a0a", border: "1px solid #1f1f1f" }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: "#6b7280" }}>{label}</div>
      <div className="text-base font-bold tabular-nums mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-2 rounded overflow-hidden" style={{ background: "#1a1a1a" }}>
      <div
        className="h-full transition-all"
        style={{ width: `${value}%`, background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </div>
  );
}

function FactorRow({ factor }: { factor: Factor }) {
  const color = factor.direction === "bullish" ? "#00ff88"
    : factor.direction === "bearish" ? "#ff3366"
    : "#fbbf24";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold" style={{ color: "#e5e7eb" }}>{factor.name}</span>
        <span className="text-[10px] uppercase tabular-nums" style={{ color, fontWeight: 700 }}>
          {factor.direction} · {factor.impact}
        </span>
      </div>
      <div className="w-full h-1.5 rounded mb-1.5" style={{ background: "#1a1a1a" }}>
        <div className="h-full rounded" style={{ width: `${factor.impact}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <p className="text-[10px] leading-relaxed" style={{ color: "#9ca3af" }}>{factor.description}</p>
    </div>
  );
}

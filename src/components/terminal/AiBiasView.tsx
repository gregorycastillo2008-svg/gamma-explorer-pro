import { useState } from "react";
import { Panel, StatBlock } from "./Panel";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Sparkles, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DemoTicker, ExposurePoint, KeyLevels, OptionContract, formatNumber } from "@/lib/gex";
import { useToast } from "@/hooks/use-toast";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

export function AiBiasView({ ticker, exposures, levels, contracts }: Props) {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Aggregate inputs
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);
  const aggVanna = exposures.reduce((s, p) => s + p.vanna, 0);
  const aggCharm = exposures.reduce((s, p) => s + p.charm, 0);
  const atmContracts = contracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
  const atmIv = atmContracts.length
    ? (atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length) * 100
    : 0;

  // Z-Score of current Net GEX vs strike distribution (proxy)
  const gexes = exposures.map((p) => p.netGex);
  const meanG = gexes.reduce((s, x) => s + x, 0) / gexes.length || 0;
  const sdG = Math.sqrt(gexes.reduce((s, x) => s + (x - meanG) ** 2, 0) / gexes.length) || 1;
  const peakGex = Math.max(...gexes.map(Math.abs));
  const zScore = ((peakGex - meanG) / sdG).toFixed(2);

  const regime = levels.gammaFlip == null
    ? "Undefined"
    : ticker.spot > levels.gammaFlip
      ? "Positive Gamma"
      : "Negative Gamma";

  const generate = async () => {
    setLoading(true);
    setOutput("");
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-bias`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          ticker: ticker.symbol,
          spot: ticker.spot,
          netGex: formatNumber(levels.totalGex),
          gammaFlip: levels.gammaFlip,
          callWall: levels.callWall,
          putWall: levels.putWall,
          netDex: formatNumber(netDex),
          vanna: formatNumber(aggVanna),
          charm: formatNumber(aggCharm),
          atmIv: atmIv.toFixed(1),
          zScore,
        }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        toast({
          title: resp.status === 429 ? "Rate limited" : resp.status === 402 ? "Out of credits" : "Error",
          description: err.error || "Could not reach AI gateway.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setOutput(acc);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      toast({ title: "Network error", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Input snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatBlock label="Symbol" value={ticker.symbol} tone="primary" sub={`spot $${ticker.spot}`} />
        <StatBlock label="Net GEX" value={formatNumber(levels.totalGex)} tone={levels.totalGex >= 0 ? "call" : "put"} />
        <StatBlock label="Gamma Flip" value={levels.gammaFlip ? `$${levels.gammaFlip}` : "—"} tone="warning" />
        <StatBlock label="Regime" value={regime} tone={regime === "Positive Gamma" ? "call" : regime === "Negative Gamma" ? "put" : "default"} />
        <StatBlock label="Call Wall" value={`$${levels.callWall}`} tone="call" />
        <StatBlock label="Put Wall" value={`$${levels.putWall}`} tone="put" />
      </div>

      <Panel
        title="AI Market Bias Forecast"
        subtitle="Senior Quant prompt · GEX structure → 24-48h outlook"
        right={
          <Button size="sm" onClick={generate} disabled={loading} className="h-7 gap-1.5">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loading ? "Analyzing..." : "Generate Forecast"}
          </Button>
        }
      >
        {!output && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground max-w-md">
              Click <span className="font-semibold text-foreground">Generate Forecast</span> to run the
              Senior Quant prompt against the current <span className="font-mono text-primary">{ticker.symbol}</span> GEX structure.
            </p>
            <p className="text-[10px] text-muted-foreground mt-2 font-mono">
              Inputs: Net GEX · Flip · Walls · Vanna · Charm · ATM IV · Z-Score
            </p>
          </div>
        )}

        {(output || loading) && (
          <div className="prose prose-sm prose-invert max-w-none
            prose-headings:text-foreground prose-headings:font-bold
            prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2 prose-h2:pb-1 prose-h2:border-b prose-h2:border-border
            prose-strong:text-primary prose-strong:font-semibold
            prose-p:text-sm prose-p:text-foreground/90 prose-p:leading-relaxed
            prose-ul:my-2 prose-li:text-sm prose-li:my-0.5 prose-li:text-foreground/90
            prose-ol:my-2 prose-code:text-call prose-code:bg-secondary/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
            font-mono text-xs"
          >
            <ReactMarkdown>{output}</ReactMarkdown>
            {loading && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />}
          </div>
        )}
      </Panel>

      <Panel title="Context fed to model" subtitle="Live snapshot">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs font-mono">
          <KV k="Net DEX" v={formatNumber(netDex)} />
          <KV k="Σ Vanna" v={formatNumber(aggVanna)} />
          <KV k="Σ Charm" v={formatNumber(aggCharm)} />
          <KV k="ATM IV" v={`${atmIv.toFixed(1)}%`} />
          <KV k="Peak GEX Z" v={`${zScore}σ`} />
          <KV k="Spot vs Flip" v={levels.gammaFlip ? `${(((ticker.spot - levels.gammaFlip) / levels.gammaFlip) * 100).toFixed(2)}%` : "—"} />
          <KV k="Dist Call Wall" v={`${(((levels.callWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
          <KV k="Dist Put Wall" v={`${(((levels.putWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
        </div>
        <div className="mt-3 flex items-start gap-2 p-2 rounded bg-secondary/30 text-[10px] text-muted-foreground">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-warning" />
          <span>Forecast is generated by AI based on dealer-flow heuristics. Not investment advice.</span>
        </div>
      </Panel>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/30 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground font-semibold">{v}</span>
    </div>
  );
}

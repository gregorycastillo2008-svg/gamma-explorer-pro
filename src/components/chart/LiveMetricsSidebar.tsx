import { useEffect, useState } from "react";
import type { GexSnapshot } from "@/lib/gexSimData";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function fmtNum(n: number, suffix = "") {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e12) return `${s}${(a / 1e12).toFixed(2)}T${suffix}`;
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B${suffix}`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M${suffix}`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(2)}K${suffix}`;
  return `${s}${a.toFixed(2)}${suffix}`;
}

interface Props {
  snapshot: GexSnapshot;
  symbol: string;
  onSymbolChange: (s: string) => void;
  symbols: string[];
}

export function LiveMetricsSidebar({ snapshot, symbol, onSymbolChange, symbols }: Props) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border-t border-[#1f1f1f] pt-2 mt-2">
      <div className="text-[10px] font-bold tracking-wider text-cyan-400 mb-1.5 uppercase">{title}</div>
      <div className="space-y-1 font-mono text-[11px]">{children}</div>
    </div>
  );

  const Row = ({ k, v, color = "text-foreground" }: { k: string; v: string; color?: string }) => (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`${color} font-semibold`}>{v}</span>
    </div>
  );

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3 text-foreground" style={{ width: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-bold text-cyan-400">GEXSATELIT</div>
          <div className="text-[10px] text-muted-foreground">classic</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground font-mono">1x</span>
        </div>
      </div>

      {/* Ticker */}
      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground">Ticker</div>
        <Select value={symbol} onValueChange={onSymbolChange}>
          <SelectTrigger className="h-7 bg-black border-[#1f1f1f] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0a0a0a] border-[#1f1f1f]">
            {symbols.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Aggregation info */}
      <div className="mt-2 text-[11px] font-mono">
        <div className="text-muted-foreground">90d (agg)</div>
        <div className="text-cyan-400">• latest ({now.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" })})</div>
        <div className="text-muted-foreground">• next</div>
      </div>

      <Section title="UPDATE">
        <Row k="date" v={now.toLocaleDateString()} />
        <Row k="time" v={now.toLocaleTimeString()} />
        <Row k="spot" v={snapshot.spot.toFixed(2)} color="text-yellow-400" />
      </Section>

      <Section title="VOLUME">
        <Row k="zero gamma" v={snapshot.keyLevels.zeroGamma.toFixed(2)} color="text-purple-400" />
        <Row k="major positive" v={snapshot.keyLevels.majorPositive.toFixed(2)} color="text-emerald-400" />
        <Row k="major negative" v={snapshot.keyLevels.majorNegative.toFixed(2)} color="text-red-400" />
        <Row k="net gex" v={fmtNum(snapshot.aggregates.netGEX)} color={snapshot.aggregates.netGEX >= 0 ? "text-emerald-400" : "text-red-400"} />
      </Section>

      <Section title="OPEN INTEREST">
        <Row k="call OI" v={snapshot.aggregates.totalCallOI.toLocaleString()} color="text-emerald-400" />
        <Row k="put OI" v={snapshot.aggregates.totalPutOI.toLocaleString()} color="text-red-400" />
        <Row k="P/C ratio" v={(snapshot.aggregates.totalPutOI / Math.max(1, snapshot.aggregates.totalCallOI)).toFixed(2)} />
      </Section>

      <Section title="MAX CHANGE GEX">
        {snapshot.maxChange.map((m) => (
          <div key={m.window} className="flex justify-between">
            <span className="text-muted-foreground">{m.window} min</span>
            <span className="font-semibold">
              <span className="text-cyan-400">{m.strike.toFixed(0)}</span>
              <span className="text-muted-foreground"> ({fmtNum(m.delta)})</span>
            </span>
          </div>
        ))}
      </Section>

      <div className="flex gap-2 mt-3">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] border-[#1f1f1f] bg-black hover:bg-[#1a1a1a]">load history</Button>
        <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] border-[#1f1f1f] bg-black hover:bg-[#1a1a1a]">clear cache</Button>
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground font-mono text-center">last tick: {now.toLocaleTimeString()}</div>
    </div>
  );
}

import { Plus, Minus, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemoTicker, KeyLevels, formatNumber } from "@/lib/gex";
import type { DataStatus } from "@/hooks/useOptionsData";
import { useEffect, useState } from "react";

interface Props {
  ticker: DemoTicker;
  watchlist: string[];
  active: string;
  onActive: (s: string) => void;
  onAdd: () => void;
  onRemove: (s: string) => void;
  expiry: string;
  onExpiry: (e: string) => void;
  status?: DataStatus;
  source?: string;
  fetchedAt?: string | null;
  priceChangePct?: number;
  onReload?: () => void;
  levels: KeyLevels;
  atmIv?: number;
  pcr?: number;
  netDex?: number;
}

function useElapsed(fetchedAt: string | null | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!fetchedAt) return null;
  const sec = Math.max(0, Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

interface WallProps { label: string; value: number | string; tone: "call" | "put" | "warning" | "primary" | "flip"; }
function Wall({ label, value, tone }: WallProps) {
  const toneCls: Record<string, string> = {
    call: "text-call",
    put: "text-put",
    warning: "text-warning",
    primary: "text-primary",
    flip: "text-[hsl(var(--flip))]",
  };
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className={`text-[10px] tracking-[0.15em] uppercase ${toneCls[tone]}/80 font-mono font-bold border-8 bg-black border-black/0`}>{label}</span>
      <span className={`font-mono font-bold text-sm tabular-nums ${toneCls[tone]}`}>
        ${typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

export function Topbar({
  ticker, watchlist, active, onActive, onAdd, onRemove, expiry, onExpiry,
  status = "loading", source, fetchedAt, priceChangePct = 0, onReload, levels,
  atmIv, pcr, netDex,
}: Props) {
  const elapsed = useElapsed(fetchedAt);
  const isLive = status === "live";
  const isLoading = status === "loading";
  const badgeCls = isLive
    ? "bg-call/20 text-call border-call/40"
    : isLoading
      ? "bg-warning/20 text-warning border-warning/40"
      : "bg-muted/30 text-muted-foreground border-border";
  const badgeLabel = isLive ? "LIVE" : isLoading ? "SYNC" : "DEMO";
  const changeCls = priceChangePct >= 0 ? "text-call" : "text-put";

  return (
    <header className="border-b border-border bg-black shrink-0 flex flex-col">
      {/* LEFT — Brand + Ticker + Spot */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-black text-base tracking-[0.2em] bg-gradient-to-r from-[#b8860b] via-[#ffd700] to-[#fff5cc] bg-clip-text text-secondary-foreground text-[#fffafa]">
          GEXSATELIT
        </span>
        <span className="text-primary font-mono font-bold text-base tabular-nums">
          ${ticker.spot.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        {isLive && priceChangePct !== 0 && (
          <span className={`font-mono text-xs ${changeCls}`}>
            {priceChangePct >= 0 ? "+" : ""}{priceChangePct.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Ticker selector */}
      <div className="flex items-center gap-1 shrink-0">
        <Select value={active} onValueChange={onActive}>
          <SelectTrigger className="h-7 w-20 text-xs font-mono font-bold bg-card/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {watchlist.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="icon" variant="outline" className="h-7 w-7" onClick={onAdd}><Plus className="h-3 w-3" /></Button>
        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onRemove(active)} disabled={watchlist.length <= 1}><Minus className="h-3 w-3" /></Button>
      </div>

      {/* WALLS TICKER — Altaris style */}
      <div className="flex items-center gap-5 shrink-0 border-l border-border/60 pl-4">
        <Wall label="Call Wall" value={levels.callWall} tone="call" />
        <Wall label="Put Wall"  value={levels.putWall}  tone="put" />
        <Wall label="Major Wall" value={levels.majorWall} tone="primary" />
        <Wall label="Max Pain"  value={levels.maxPain}  tone="warning" />
        <Wall label="Vol Trigger" value={levels.volTrigger} tone="flip" />
        <Wall label="Total VT"  value={levels.totalVt}  tone="call" />
      </div>

      {/* RIGHT — Expiry + status */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <Select value={expiry} onValueChange={onExpiry}>
          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All expiries</SelectItem>
            {ticker.expiries.map((e) => (
              <SelectItem key={e} value={String(e)}>{e === 1 ? "0DTE" : `${e}d`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground font-mono" title={source}>
          {isLoading ? "Fetching…" : elapsed ? `Updated ${elapsed}` : status === "demo" ? "Demo" : "—"}
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}>{badgeLabel}</span>
        {onReload && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onReload} disabled={isLoading} title="Reload">
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </header>
  );
}

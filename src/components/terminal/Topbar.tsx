import { Plus, Minus, Bell, Settings, Clock, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemoTicker } from "@/lib/gex";
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

export function Topbar({
  ticker, watchlist, active, onActive, onAdd, onRemove, expiry, onExpiry,
  status = "loading", source, fetchedAt, priceChangePct = 0, onReload,
}: Props) {
  const elapsed = useElapsed(fetchedAt);
  const isLive = status === "live";
  const isLoading = status === "loading";
  const badgeCls = isLive
    ? "bg-call/20 text-call border-call/30"
    : isLoading
      ? "bg-warning/20 text-warning border-warning/30"
      : "bg-muted/30 text-muted-foreground border-border";
  const badgeLabel = isLive ? "LIVE" : isLoading ? "SYNC" : "DEMO";
  const changeCls = priceChangePct >= 0 ? "text-call" : "text-put";

  return (
    <header className="h-14 border-b border-border bg-card/40 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-sm tracking-wider">{ticker.symbol}</span>
        <span className="text-primary font-mono text-sm">${ticker.spot.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        {isLive && priceChangePct !== 0 && (
          <span className={`font-mono text-xs ${changeCls}`}>
            {priceChangePct >= 0 ? "+" : ""}{priceChangePct.toFixed(2)}%
          </span>
        )}
      </div>

      <Select value={active} onValueChange={onActive}>
        <SelectTrigger className="h-8 w-24 text-xs font-mono"><SelectValue /></SelectTrigger>
        <SelectContent>
          {watchlist.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button size="icon" variant="outline" className="h-8 w-8" onClick={onAdd}><Plus className="h-3.5 w-3.5" /></Button>
      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => onRemove(active)} disabled={watchlist.length <= 1}><Minus className="h-3.5 w-3.5" /></Button>

      <Select value={expiry} onValueChange={onExpiry}>
        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All expiries</SelectItem>
          {ticker.expiries.map((e) => (
            <SelectItem key={e} value={String(e)}>{e === 1 ? "0DTE" : `${e}d`}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 text-xs text-muted-foreground" title={source}>
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
        <span>{isLoading ? "Fetching CBOE…" : elapsed ? `Updated ${elapsed}` : status === "demo" ? "Demo data" : "—"}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}>{badgeLabel}</span>
        {onReload && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onReload} disabled={isLoading} title="Reload chain">
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button size="icon" variant="ghost" className="h-8 w-8"><Bell className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" className="h-8"><Settings className="h-3.5 w-3.5 mr-1.5" />Settings</Button>
      </div>
    </header>
  );
}


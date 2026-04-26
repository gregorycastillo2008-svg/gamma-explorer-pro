import { Plus, Minus, Bell, Settings, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemoTicker } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  watchlist: string[];
  active: string;
  onActive: (s: string) => void;
  onAdd: () => void;
  onRemove: (s: string) => void;
  expiry: string;
  onExpiry: (e: string) => void;
}

export function Topbar({ ticker, watchlist, active, onActive, onAdd, onRemove, expiry, onExpiry }: Props) {
  return (
    <header className="h-14 border-b border-border bg-card/40 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-sm tracking-wider">{ticker.symbol}</span>
        <span className="text-primary font-mono text-sm">${ticker.spot.toLocaleString()}</span>
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

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>Updated 13s ago</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-call/20 text-call border border-call/30">LIVE</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button size="icon" variant="ghost" className="h-8 w-8"><Bell className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" className="h-8"><Settings className="h-3.5 w-3.5 mr-1.5" />Settings</Button>
      </div>
    </header>
  );
}

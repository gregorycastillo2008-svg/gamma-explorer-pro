import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, TrendingDown, TrendingUp, Globe2, Landmark, Building2, Flame, Newspaper } from "lucide-react";

type Category = "all" | "trump" | "fed" | "macro" | "geopolitics" | "earnings";
type Impact = "high" | "medium" | "low";

interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  category: Exclude<Category, "all">;
  impact: Impact;
  tone: number;
  language: string;
}

const CAT_META: Record<Exclude<Category, "all">, { label: string; color: string; icon: any }> = {
  trump:       { label: "Trump / WH",   color: "#facc15", icon: Landmark },
  fed:         { label: "Fed / Powell", color: "#22d3ee", icon: Building2 },
  macro:       { label: "Macro",        color: "#a78bfa", icon: TrendingUp },
  geopolitics: { label: "Geopolitics",  color: "#ef4444", icon: Globe2 },
  earnings:    { label: "Earnings",     color: "#10b981", icon: Flame },
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function EconomyView() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category>("all");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const fetchSeq = useRef(0);

  const load = async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    try {
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/economy-news`;
      const r = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const j = await r.json();
      if (seq !== fetchSeq.current) return;
      if (j.error) throw new Error(j.error);
      setItems(j.items ?? []);
      setLastUpdate(new Date());
    } catch (e: any) {
      if (seq !== fetchSeq.current) return;
      setError(e?.message ?? "Failed to fetch");
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000); // every 5 min
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.category] = (c[i.category] ?? 0) + 1;
    return c;
  }, [items]);

  const highImpactCount = useMemo(() => items.filter((i) => i.impact === "high").length, [items]);

  return (
    <div className="h-full w-full flex flex-col bg-black text-foreground overflow-hidden">
      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-red-500/20 flex items-center justify-center border border-amber-500/30">
            <Newspaper className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Economy & High-Volatility Events</h2>
            <p className="text-xs text-muted-foreground font-mono">
              Live world feed · Fed · Trump · Macro · Geopolitics · Earnings
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-red-300 font-mono font-bold">{highImpactCount} HIGH</span>
            </span>
            <span className="text-muted-foreground font-mono">
              {lastUpdate ? `Updated ${timeAgo(lastUpdate.toISOString())}` : "Loading…"}
            </span>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-[#1f1f1f] bg-black hover:bg-[#0f0f0f] hover:border-cyan-500/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-1.5 px-6 py-3 border-b border-[#1f1f1f] overflow-x-auto shrink-0">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={counts.all ?? 0}
          color="#9ca3af"
        />
        {(Object.keys(CAT_META) as Array<Exclude<Category, "all">>).map((k) => {
          const m = CAT_META[k];
          const Icon = m.icon;
          return (
            <FilterChip
              key={k}
              active={filter === k}
              onClick={() => setFilter(k)}
              label={m.label}
              count={counts[k] ?? 0}
              color={m.color}
              icon={<Icon className="h-3 w-3" />}
            />
          );
        })}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-3 mb-4">
            Error: {error}
          </div>
        )}
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">
            Loading global news feed…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">
            No events found in this category
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active, onClick, label, count, color, icon,
}: { active: boolean; onClick: () => void; label: string; count: number; color: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold rounded-full border whitespace-nowrap transition-all"
      style={{
        background: active ? `${color}20` : "transparent",
        borderColor: active ? color : "#1f1f1f",
        color: active ? color : "#9ca3af",
        boxShadow: active ? `0 0 12px ${color}40` : "none",
      }}
    >
      {icon}
      {label}
      <span className="opacity-60">· {count}</span>
    </button>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const meta = CAT_META[item.category];
  const Icon = meta.icon;
  const impactColor = item.impact === "high" ? "#ef4444" : item.impact === "medium" ? "#facc15" : "#6b7280";
  const ToneIcon = item.tone >= 0 ? TrendingUp : TrendingDown;
  const toneColor = item.tone >= 1 ? "#10b981" : item.tone <= -1 ? "#ef4444" : "#9ca3af";

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 p-4 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] hover:border-[color:var(--accent)] hover:bg-[#0f0f0f] transition-all"
      style={{ ["--accent" as any]: meta.color }}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider"
          style={{ color: meta.color, background: `${meta.color}15`, border: `1px solid ${meta.color}40` }}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <span
          className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
          style={{ color: impactColor, background: `${impactColor}15`, border: `1px solid ${impactColor}40` }}
        >
          {item.impact} impact
        </span>
      </div>

      <h3 className="text-sm font-semibold leading-snug line-clamp-3 group-hover:text-white">
        {item.title || "(untitled)"}
      </h3>

      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mt-auto pt-2 border-t border-[#1f1f1f]">
        <span className="truncate flex-1">{item.source}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <ToneIcon className="h-3 w-3" style={{ color: toneColor }} />
          <span style={{ color: toneColor }}>{item.tone >= 0 ? "+" : ""}{item.tone.toFixed(1)}</span>
          <span className="text-muted-foreground">·</span>
          <span>{timeAgo(item.publishedAt)}</span>
          <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
        </span>
      </div>
    </a>
  );
}

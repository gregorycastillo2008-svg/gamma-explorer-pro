import { Activity, BarChart3, LineChart, Layers, Target, TrendingUp, Wind, Gauge, Shuffle, Sigma, Shield, LogOut, ChevronLeft, ChevronRight, Grid3x3, AlertTriangle, BarChart2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

export type Section =
  | "overview" | "oi-analytics" | "gex-dex" | "greeks" | "depth" | "levels"
  | "hedge" | "vanna-charm" | "vega-theta"
  | "volatility" | "heatmap" | "regime" | "risk" | "anomaly"
  | "ai-bias";

export const SECTIONS: { id: Section; label: string; icon: any; group: string }[] = [
  { id: "overview", label: "Overview", icon: Activity, group: "MAIN" },
  { id: "oi-analytics", label: "OI Analytics", icon: BarChart2, group: "MAIN" },
  { id: "gex-dex", label: "GEX & DEX", icon: BarChart3, group: "MAIN" },
  { id: "greeks", label: "Greek Ladder", icon: Sigma, group: "MAIN" },
  { id: "depth", label: "Depth View", icon: Layers, group: "MAIN" },
  { id: "levels", label: "Level Scan", icon: Target, group: "MAIN" },
  { id: "hedge", label: "Hedge Pressure", icon: Gauge, group: "MAIN" },
  { id: "vanna-charm", label: "Vanna & Charm", icon: Wind, group: "MAIN" },
  { id: "vega-theta", label: "Vega & Theta", icon: TrendingUp, group: "MAIN" },
  { id: "volatility", label: "Volatility", icon: LineChart, group: "ANALYSIS" },
  { id: "heatmap", label: "Heatmap / 3D", icon: Grid3x3, group: "ANALYSIS" },
  { id: "regime", label: "Regime", icon: Shuffle, group: "ANALYSIS" },
  { id: "risk", label: "Risk", icon: Shield, group: "ANALYSIS" },
  { id: "anomaly", label: "Anomaly Detection", icon: AlertTriangle, group: "ANALYSIS" },
  { id: "ai-bias", label: "AI Bias Forecast", icon: Brain, group: "AI" },
];

interface Props {
  active: Section;
  onSelect: (s: Section) => void;
  collapsed: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  email?: string;
  onSignOut: () => void;
  allowed?: Section[];
  tier?: string | null;
  onUpgrade?: () => void;
}

export function Sidebar({ active, onSelect, collapsed, onToggle, isAdmin, email, onSignOut, allowed, tier, onUpgrade }: Props) {
  const allowSet = allowed ? new Set(allowed) : null;
  const visibleSections = allowSet ? SECTIONS.filter((s) => allowSet.has(s.id)) : SECTIONS;
  const groups = Array.from(new Set(visibleSections.map((s) => s.group)));
  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="h-14 flex items-center px-3 border-b border-sidebar-border">
        <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
          <Activity className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && <span className="ml-2 font-bold tracking-wider text-sm">ALLGEX</span>}
        <button onClick={onToggle} className="ml-auto p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((g) => (
          <div key={g} className="mb-3">
            {!collapsed && <div className="px-3 mb-1 text-[10px] font-bold tracking-widest text-sidebar-foreground/50">{g}</div>}
            {visibleSections.filter((s) => s.group === g).map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  title={collapsed ? s.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors relative",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />}
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{s.label}</span>}
                </button>
              );
            })}
          </div>
        ))}

        {isAdmin && (
          <div className="mb-3">
            {!collapsed && <div className="px-3 mb-1 text-[10px] font-bold tracking-widest text-sidebar-foreground/50">TOOLS</div>}
            <Link
              to="/admin"
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
              title={collapsed ? "Admin" : undefined}
            >
              <Shield className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Admin</span>}
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        {!collapsed && email && (
          <div className="px-2 py-1.5 text-xs text-sidebar-foreground/70 truncate">{email}</div>
        )}
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded"
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

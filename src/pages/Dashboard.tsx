import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSubscription } from "@/hooks/useSubscription";
import { allowedSections } from "@/lib/plans";
import { useToast } from "@/hooks/use-toast";
import {
  DEMO_TICKERS, getDemoTicker,
  computeExposures, computeKeyLevels, formatNumber,
} from "@/lib/gex";
import { useOptionsData } from "@/hooks/useOptionsData";
import { FloatingStatBar } from "@/components/terminal/FloatingStatBar";
import { Sidebar, Section } from "@/components/terminal/Sidebar";
import { Topbar } from "@/components/terminal/Topbar";
import {
  OverviewView, ChartView, GreeksView, DepthView, LevelsView,
  HedgeView, VannaCharmView, VegaThetaView, VolatilityView, RegimeView,
  OiAnalyticsView, HeatmapView, RiskView, AnomalyView,
} from "@/components/terminal/views";
import { GexDexExposure } from "@/components/terminal/GexDexExposure";
import { HorizontalGEXChart } from "@/components/terminal/HorizontalGEXChart";
import { GexDexWorkspace } from "@/components/terminal/GexDexWorkspace";
import { DepthAltaris } from "@/components/terminal/DepthAltaris";
import { DepthMultiPanel } from "@/components/terminal/DepthMultiPanel";
import { VannaCharmWorkspace } from "@/components/terminal/VannaCharmWorkspace";
import { OiAnalyticsWorkspace } from "@/components/terminal/OiAnalyticsWorkspace";
import { AiBiasView } from "@/components/terminal/AiBiasView";
import { SectionTransition } from "@/components/terminal/SectionTransition";
import { Paywall } from "@/components/Paywall";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);
  const { tier, subscribed, loading: subLoading, refresh: refreshSub } = useSubscription(user?.id);
  const nav = useNavigate();
  const { toast } = useToast();

  // Admin → acceso total. Sin plan → mostrar dashboard borroso + paywall.
  const hasAccess = isAdmin || subscribed;
  const allowed = isAdmin ? undefined : allowedSections(tier);

  const [section, setSection] = useState<Section>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [active, setActive] = useState("QQQ");
  const [expiry, setExpiry] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);

  useEffect(() => { if (!loading && !user) nav("/auth"); }, [user, loading, nav]);

  // Refresh subscription if returning from successful checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast({ title: "¡Bienvenido!", description: "Activando tu suscripción..." });
      const tries = [1500, 4000, 8000];
      tries.forEach((ms) => setTimeout(() => refreshSub(), ms));
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  // Si la sección actual no está permitida para este tier, caer a la primera permitida
  useEffect(() => {
    if (adminLoading || subLoading) return;
    if (isAdmin || !subscribed) return;
    if (!allowed || allowed.length === 0) return;
    if (!allowed.includes(section)) setSection(allowed[0]);
  }, [allowed, section, isAdmin, subscribed, adminLoading, subLoading]);

  const openManagePlan = async () => {
    if (!subscribed) { setPricingOpen(true); return; }
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!user) return;
    supabase.from("watchlist").select("ticker").order("created_at").then(({ data }) => {
      const list = data?.map((r) => r.ticker) ?? [];
      if (list.length === 0) {
        const defaults = ["QQQ", "SPY", "NQ"];
        Promise.all(defaults.map((t) =>
          supabase.from("watchlist").insert({ user_id: user.id, ticker: t })
        )).then(() => setWatchlist(defaults));
      } else {
        setWatchlist(list);
        if (!list.includes(active)) setActive(list[0]);
      }
    });
  }, [user]);

  const { ticker, contracts: liveContracts, status, source, fetchedAt, priceChangePct, reload } = useOptionsData(active);

  const filtered = expiry === "all" ? liveContracts : liveContracts.filter((c) => String(c.expiry) === expiry);
  const exposures = computeExposures(ticker.spot, filtered);
  const levels = computeKeyLevels(exposures);
  const ctx = { ticker, exposures, levels, contracts: filtered };

  // Persistent global stats (shown across every section)
  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
  const pcr = totalPutOI / Math.max(totalCallOI, 1);
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);
  const atmContracts = filtered.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
  const atmIv = atmContracts.length
    ? (atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length) * 100
    : ticker.baseIV * 100;
  const globalStats: import("@/components/terminal/FloatingStatBar").FloatingStat[] = [
    { label: "ATM IV",    value: `${atmIv.toFixed(1)}%`,           tone: "primary" },
    { label: "P/C Ratio", value: pcr.toFixed(2),                   tone: pcr > 1 ? "put" : "call" },
    { label: "Net DEX",   value: formatNumber(netDex),             tone: netDex >= 0 ? "call" : "put", sub: "dollar delta" },
    { label: "Total GEX", value: formatNumber(levels.totalGex),    tone: levels.totalGex >= 0 ? "call" : "put", sub: levels.totalGex >= 0 ? "Positive regime" : "Negative regime" },
    { label: "Call Wall", value: String(levels.callWall),          tone: "call",    sub: "resistance" },
    { label: "Put Wall",  value: String(levels.putWall),           tone: "put",     sub: "support" },
  ];

  const addTicker = async () => {
    const sym = newTicker.toUpperCase().trim();
    if (!sym || !user) return;
    if (!/^[A-Z]{1,6}$/.test(sym)) {
      toast({ title: "Invalid symbol", description: "Use 1–6 letters (e.g. QQQ, SPY, NQ).", variant: "destructive" });
      return;
    }
    if (watchlist.includes(sym)) { setAddOpen(false); setNewTicker(""); return; }
    const { error } = await supabase.from("watchlist").insert({ user_id: user.id, ticker: sym });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setWatchlist([...watchlist, sym]);
    setActive(sym);
    setNewTicker("");
    setAddOpen(false);
  };

  const removeTicker = async (sym: string) => {
    if (!user || watchlist.length <= 1) return;
    await supabase.from("watchlist").delete().eq("user_id", user.id).eq("ticker", sym);
    const next = watchlist.filter((t) => t !== sym);
    setWatchlist(next);
    if (active === sym && next[0]) setActive(next[0]);
  };

  const signOut = async () => { await supabase.auth.signOut(); nav("/"); };

  const renderView = () => {
    switch (section) {
      case "overview": return <OverviewView {...ctx} />;
      case "chart": return <ChartView {...ctx} />;
      case "oi-analytics": return <OiAnalyticsWorkspace ticker={ticker} contracts={filtered} />;
      case "gex-dex": return <GexDexWorkspace ticker={ticker} contracts={filtered} />;
      case "greeks": return <GreeksView {...ctx} />;
      case "depth": return <DepthMultiPanel ticker={ticker} contracts={filtered} />;
      case "levels": return <LevelsView {...ctx} />;
      case "hedge": return <HedgeView {...ctx} />;
      case "vanna-charm": return <VannaCharmWorkspace ticker={ticker} contracts={filtered} />;
      case "vega-theta": return <VegaThetaView {...ctx} />;
      case "volatility": return <VolatilityView {...ctx} />;
      case "heatmap": return <HeatmapView {...ctx} />;
      case "regime": return <RegimeView {...ctx} />;
      case "risk": return <RiskView {...ctx} />;
      case "anomaly": return <AnomalyView {...ctx} />;
      case "ai-bias": return <AiBiasView {...ctx} />;
      default: return null;
    }
  };

  // Mientras carga el estado de admin/sub, no decidimos nada (evita parpadeo del paywall).
  const checking = adminLoading || subLoading;
  const showPaywall = !checking && !hasAccess;

  // Si el usuario no ha pagado (y no es admin) → SOLO el paywall, sin dashboard detrás.
  if (showPaywall) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <Paywall email={user?.email ?? undefined} />
      </div>
    );
  }

  // Pantalla de carga mientras verificamos suscripción/admin (evita flash del dashboard).
  if (checking || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 transition-all duration-500">
        <Sidebar
          active={section}
          onSelect={setSection}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          isAdmin={isAdmin}
          email={user?.email ?? undefined}
          onSignOut={signOut}
          allowed={allowed}
          tier={isAdmin ? "admin" : tier}
          onUpgrade={openManagePlan}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar
            ticker={ticker}
            watchlist={watchlist}
            active={active}
            onActive={setActive}
            onAdd={() => setAddOpen(true)}
            onRemove={removeTicker}
            expiry={expiry}
            onExpiry={setExpiry}
            status={status}
            source={source}
            fetchedAt={fetchedAt}
            priceChangePct={priceChangePct}
            onReload={reload}
            levels={levels}
          />
          <main className="flex-1 overflow-hidden p-1">
            <SectionTransition sectionKey={`${section}-${active}`}>
              {renderView()}
            </SectionTransition>
          </main>
        </div>
      </div>

      {pricingOpen && (
        <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            aria-label="Close pricing"
            className="absolute top-4 right-4 z-[90] w-9 h-9 rounded-full bg-black/70 text-white text-lg flex items-center justify-center border border-white/20 hover:bg-black"
            onClick={() => setPricingOpen(false)}
          >
            ✕
          </button>
          <Paywall email={user?.email ?? undefined} />
        </div>
      )}

      
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add ticker</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Symbol</Label>
            <Input
              autoFocus
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              placeholder="QQQ, SPY, NQ..."
            />
            <p className="text-xs text-muted-foreground">Live data via CBOE for QQQ, SPY, NQ/NDX and US-listed symbols.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addTicker}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

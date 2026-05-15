import { useEffect, useState, useMemo, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSubscription } from "@/hooks/useSubscription";
import { isAdminBypass, clearAdminBypass } from "@/lib/adminBypass";
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
  HedgeView, VolDeskView, VannaCharmView, VegaThetaView, VolatilityView, RegimeView,
  OiAnalyticsView, HeatmapView, RiskView, AnomalyView,
  VolatilityRegimeIndicatorView, ExpectedMoveCalculatorView, SentimentView,
} from "@/components/terminal/views";
import { GexDexWorkspace } from "@/components/terminal/GexDexWorkspace";
import { DepthMultiPanel } from "@/components/terminal/DepthMultiPanel";
import { VannaCharmWorkspace } from "@/components/terminal/VannaCharmWorkspace";
import { OiAnalyticsWorkspace } from "@/components/terminal/OiAnalyticsWorkspace";
import { ProbabilityWorkspace } from "@/components/terminal/ProbabilityWorkspace";
import { AiBiasView } from "@/components/terminal/AiBiasView";
import { EconomyView } from "@/components/terminal/EconomyView";
import { OptionsSentimentScore } from "@/components/terminal/OptionsSentimentScore";
import { SectionTransition } from "@/components/terminal/SectionTransition";
import { Paywall } from "@/components/Paywall";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { isAdmin: isDbAdmin, loading: adminLoading } = useIsAdmin(user?.id);
  const { tier, subscribed, loading: subLoading, refresh: refreshSub } = useSubscription(user?.id);
  const nav = useNavigate();
  const { toast } = useToast();

  // Local admin bypass (master password from Plans/Paywall)
  const adminBypass = isAdminBypass();

  // Admin → acceso total. Sin plan → mostrar dashboard borroso + paywall.
  const isAdmin = isDbAdmin || adminBypass;
  const hasAccess = isAdmin || subscribed;
  const allowed = isAdmin ? undefined : allowedSections(tier);

  const [section, setSection] = useState<Section>("overview");
  const [, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [active, setActive] = useState("QQQ");
  const [expiry, setExpiry] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);

  useEffect(() => { if (!loading && !user && !adminBypass) nav("/auth"); }, [user, loading, nav, adminBypass]);

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
    if (!user) {
      // Admin bypass: no DB session — load default watchlist locally
      if (adminBypass && watchlist.length === 0) setWatchlist(["QQQ", "SPY", "NQ"]);
      return;
    }
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

  const filtered  = useMemo(
    () => expiry === "all" ? liveContracts : liveContracts.filter(c => String(c.expiry) === expiry),
    [expiry, liveContracts],
  );
  const exposures = useMemo(() => computeExposures(ticker.spot, filtered), [ticker.spot, filtered]);
  const levels    = useMemo(() => computeKeyLevels(exposures), [exposures]);
  const ctx       = useMemo(() => ({ ticker, exposures, levels, contracts: filtered }), [ticker, exposures, levels, filtered]);

  // Calculate Sentiment Score metrics
  const sentimentMetrics = useMemo(() => {
    const netGex = levels.totalGex / 1e9;
    const pcCallVol = liveContracts.filter(c => c.type === "call").reduce((s, c) => s + ((c as any).volume ?? 0), 0);
    const pcPutVol = liveContracts.filter(c => c.type === "put").reduce((s, c) => s + ((c as any).volume ?? 0), 0);
    const pcRatio = pcCallVol + pcPutVol > 0 ? pcPutVol / Math.max(pcCallVol, 1) : 0;
    const atmContacts = filtered.filter(c => Math.abs(c.strike - ticker.spot) <= ticker.strikeStep * 1.5);
    const atmIv = atmContacts.length ? atmContacts.reduce((s, c) => s + c.iv, 0) / atmContacts.length : ticker.baseIV;
    const ivRank = 34;
    const volSkew = -0.12;
    const vanna = exposures.reduce((s, p) => s + Math.abs(p.vanna), 0) / 1e6;
    const charm = exposures.reduce((s, p) => s + Math.abs(p.charm), 0) / 1e6;
    const score = Math.round(Math.max(0, Math.min(100, 50 + (netGex * 10) - (pcRatio * 20) + (50 - ivRank * 0.5))));
    const regime = score >= 70 ? "COMPRESSED" : score >= 40 ? "TRANSITIONING" : "EXPLOSIVE";
    return { netGex, pcRatio, ivRank, volSkew, vanna, charm, score, regime };
  }, [levels, liveContracts, filtered, ticker.spot, ticker.strikeStep, ticker.baseIV, exposures]);

  // Persistent global stats — memoized so they don't recompute on every render
  const { pcr, netDex, atmIv } = useMemo(() => {
    let pcCallVol = 0, pcPutVol = 0, pcCallOI = 0, pcPutOI = 0;
    for (const c of liveContracts) {
      const v = (c as any).volume ?? 0;
      if (c.type === "call") { pcCallVol += v; pcCallOI += c.oi; }
      else { pcPutVol += v; pcPutOI += c.oi; }
    }
    const pcr = pcCallVol + pcPutVol > 0
      ? pcPutVol / Math.max(pcCallVol, 1)
      : pcPutOI / Math.max(pcCallOI, 1);

    const fullExposures = computeExposures(ticker.spot, liveContracts);
    const netDex = fullExposures.reduce((s, p) => s + p.dex, 0);

    const nearestExpiry = liveContracts.reduce(
      (min, c) => (c.expiry < min ? c.expiry : min),
      Number.POSITIVE_INFINITY,
    );
    const atm = liveContracts.filter(
      c => c.expiry === nearestExpiry && Math.abs(c.strike - ticker.spot) <= ticker.strikeStep * 1.5,
    );
    const atmOiSum = atm.reduce((s, c) => s + c.oi, 0);
    const atmIv = atmOiSum > 0
      ? (atm.reduce((s, c) => s + c.iv * c.oi, 0) / atmOiSum) * 100
      : atm.length
        ? (atm.reduce((s, c) => s + c.iv, 0) / atm.length) * 100
        : ticker.baseIV * 100;
    return { pcr, netDex, atmIv };
  }, [liveContracts, ticker.spot, ticker.strikeStep, ticker.baseIV]);

  const globalStats: import("@/components/terminal/FloatingStatBar").FloatingStat[] = useMemo(() => [
    { label: "ATM IV",    value: `${atmIv.toFixed(1)}%`,           tone: "primary" },
    { label: "P/C Ratio", value: pcr.toFixed(2),                   tone: pcr > 1 ? "put" : "call" },
    { label: "Net DEX",   value: formatNumber(netDex),             tone: netDex >= 0 ? "call" : "put", sub: "dollar delta" },
    { label: "Total GEX", value: formatNumber(levels.totalGex),    tone: levels.totalGex >= 0 ? "call" : "put", sub: levels.totalGex >= 0 ? "Positive regime" : "Negative regime" },
    { label: "Call Wall", value: String(levels.callWall),          tone: "call",    sub: "resistance" },
    { label: "Put Wall",  value: String(levels.putWall),           tone: "put",     sub: "support" },
  ], [atmIv, pcr, netDex, levels]);

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

  const signOut = async () => {
    if (adminBypass) clearAdminBypass();
    if (user) await supabase.auth.signOut();
    nav("/");
  };

  const renderView = () => {
    switch (section) {
      case "overview": return <OverviewView {...ctx} />;
      case "chart": return <ChartView {...ctx} />;
      case "oi-analytics": return <OiAnalyticsWorkspace ticker={ticker} contracts={filtered} />;
      case "gex-dex": return <GexDexWorkspace ticker={ticker} contracts={filtered} />;
      case "greeks": return <GreeksView {...ctx} />;
      case "depth": return <DepthMultiPanel ticker={ticker} contracts={filtered} />;
      case "levels": return <LevelsView {...ctx} />;
      case "hedge":   return <HedgeView {...ctx} />;
      case "voldesk": return <VolDeskView />;
      case "vanna-charm": return <VannaCharmWorkspace ticker={ticker} contracts={filtered} />;
      case "vega-theta": return <VegaThetaView {...ctx} />;
      case "volatility": return <VolatilityView {...ctx} />;
      case "volatility-regime": return <VolatilityRegimeIndicatorView {...ctx} />;
      case "expected-move": return <ExpectedMoveCalculatorView {...ctx} />;
      case "sentiment": return <SentimentView {...ctx} />;
      case "heatmap": return <HeatmapView {...ctx} />;
      case "regime": return <RegimeView {...ctx} />;
      case "risk": return <RiskView {...ctx} />;
      case "anomaly": return <AnomalyView {...ctx} />;
      case "economy": return <EconomyView />;
      case "ai-bias":     return <AiBiasView {...ctx} />;
      case "probability": return <ProbabilityWorkspace ticker={ticker} contracts={filtered} />;
      default: return null;
    }
  };

  // Block UI only while we don't have any auth or access decision yet.
  // subLoading alone does NOT block — we use cached subscription state for instant render.
  const checking = adminBypass ? false : (adminLoading && subLoading);
  const showPaywall = !checking && !hasAccess && !subLoading;

  // Si no hay sesión confirmada y no es bypass, esperar un máximo de un tick.
  if (!adminBypass && !user && loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      </div>
    );
  }

  // Si el usuario no ha pagado (y no es admin) → SOLO el paywall, sin dashboard detrás.
  if (showPaywall) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <Paywall email={user?.email ?? undefined} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 transition-all duration-500">
        <Sidebar
          active={section}
          onSelect={(s) => startTransition(() => setSection(s))}
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
            atmIv={atmIv}
            pcr={pcr}
            netDex={netDex}
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

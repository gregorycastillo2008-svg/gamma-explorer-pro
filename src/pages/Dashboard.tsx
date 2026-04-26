import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, LogOut, Plus, X, TrendingUp, TrendingDown, Zap, Target, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DEMO_TICKERS, getDemoTicker, generateDemoChain,
  computeExposures, computeKeyLevels, formatNumber,
} from "@/lib/gex";
import { ExposureChart } from "@/components/ExposureChart";
import { StatCard } from "@/components/StatCard";

type Metric = "netGex" | "dex" | "vex" | "vanna" | "charm";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [active, setActive] = useState<string>("SPX");
  const [expiry, setExpiry] = useState<string>("all");
  const [metric, setMetric] = useState<Metric>("netGex");
  const [newTicker, setNewTicker] = useState("");

  useEffect(() => {
    if (!loading && !user) nav("/auth");
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("watchlist").select("ticker").order("created_at").then(({ data }) => {
      const list = data?.map((r) => r.ticker) ?? [];
      if (list.length === 0) {
        // seed defaults
        const defaults = ["SPX", "SPY", "QQQ"];
        Promise.all(defaults.map((t) =>
          supabase.from("watchlist").insert({ user_id: user.id, ticker: t })
        )).then(() => setWatchlist(defaults));
      } else {
        setWatchlist(list);
        if (!list.includes(active)) setActive(list[0]);
      }
    });
  }, [user]);

  const ticker = getDemoTicker(active);
  if (!ticker) return null;

  const allContracts = generateDemoChain(ticker);
  const filtered = expiry === "all" ? allContracts : allContracts.filter((c) => String(c.expiry) === expiry);
  const exposures = computeExposures(ticker.spot, filtered);
  const levels = computeKeyLevels(exposures);

  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
  const pcr = totalPutOI / Math.max(totalCallOI, 1);

  const addTicker = async () => {
    const sym = newTicker.toUpperCase().trim();
    if (!sym || !user) return;
    if (!getDemoTicker(sym)) {
      toast({ title: "Ticker no disponible en demo", description: `Disponibles: ${DEMO_TICKERS.map(t=>t.symbol).join(", ")}`, variant: "destructive" });
      return;
    }
    if (watchlist.includes(sym)) return;
    const { error } = await supabase.from("watchlist").insert({ user_id: user.id, ticker: sym });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setWatchlist([...watchlist, sym]);
    setNewTicker("");
  };

  const removeTicker = async (sym: string) => {
    if (!user) return;
    await supabase.from("watchlist").delete().eq("user_id", user.id).eq("ticker", sym);
    const next = watchlist.filter((t) => t !== sym);
    setWatchlist(next);
    if (active === sym && next[0]) setActive(next[0]);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    nav("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold tracking-tight leading-none">GammaScope</div>
              <div className="text-xs text-muted-foreground">Panel de análisis</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1.5" />Salir</Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Watchlist */}
        <Card className="p-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground mr-2">Watchlist:</span>
            {watchlist.map((sym) => (
              <button
                key={sym}
                onClick={() => setActive(sym)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  active === sym ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {sym}
                <X
                  className="h-3 w-3 opacity-50 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); removeTicker(sym); }}
                />
              </button>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              <Input
                placeholder="SPX, SPY, AAPL..."
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTicker()}
                className="h-9 w-40"
              />
              <Button size="sm" onClick={addTicker}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>

        {/* Header ticker */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{ticker.symbol}</h1>
              <span className="text-muted-foreground">{ticker.name}</span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl font-semibold">${ticker.spot.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">Spot · IV base {(ticker.baseIV * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los vencimientos</SelectItem>
                {ticker.expiries.map((e) => (
                  <SelectItem key={e} value={String(e)}>{e === 1 ? "0DTE / 1d" : `${e} días`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total GEX" value={levels.totalGex} formatLarge tone={levels.totalGex >= 0 ? "call" : "put"} icon={BarChart3} hint={levels.totalGex >= 0 ? "Régimen positivo" : "Régimen negativo"} />
          <StatCard label="Call Wall" value={levels.callWall} tone="call" icon={TrendingUp} hint="Resistencia" />
          <StatCard label="Put Wall" value={levels.putWall} tone="put" icon={TrendingDown} hint="Soporte" />
          <StatCard label="Gamma Flip" value={levels.gammaFlip ?? "—"} tone="warning" icon={Zap} hint="Cambio régimen" />
          <StatCard label="Put/Call OI" value={pcr.toFixed(2)} tone={pcr > 1 ? "put" : "call"} icon={Target} hint={`${formatNumber(totalCallOI, 0)}C / ${formatNumber(totalPutOI, 0)}P`} />
          <StatCard label="Strikes" value={exposures.length} icon={BarChart3} hint={`${filtered.length} contratos`} />
        </div>

        {/* Metric tabs + chart */}
        <Card className="p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList className="mb-4">
              <TabsTrigger value="netGex">GEX</TabsTrigger>
              <TabsTrigger value="dex">DEX</TabsTrigger>
              <TabsTrigger value="vex">VEX</TabsTrigger>
              <TabsTrigger value="vanna">Vanna</TabsTrigger>
              <TabsTrigger value="charm">Charm</TabsTrigger>
            </TabsList>
          </Tabs>
          <ExposureChart
            data={exposures}
            spot={ticker.spot}
            callWall={levels.callWall}
            putWall={levels.putWall}
            flip={levels.gammaFlip}
            metric={metric}
          />
        </Card>

        {/* Strike table */}
        <Card className="p-5 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <h3 className="font-semibold mb-3">Detalle por strike</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 pr-4">Strike</th>
                  <th className="py-2 pr-4 text-right">Call OI</th>
                  <th className="py-2 pr-4 text-right">Put OI</th>
                  <th className="py-2 pr-4 text-right">Call GEX</th>
                  <th className="py-2 pr-4 text-right">Put GEX</th>
                  <th className="py-2 pr-4 text-right">Net GEX</th>
                  <th className="py-2 pr-4 text-right">DEX</th>
                </tr>
              </thead>
              <tbody>
                {exposures.map((p) => {
                  const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
                  return (
                    <tr key={p.strike} className={`border-b last:border-0 ${isSpot ? "bg-accent/40" : ""}`}>
                      <td className="py-2 pr-4 font-medium">{p.strike}{isSpot && <span className="ml-2 text-xs text-primary">← spot</span>}</td>
                      <td className="py-2 pr-4 text-right">{formatNumber(p.callOI, 0)}</td>
                      <td className="py-2 pr-4 text-right">{formatNumber(p.putOI, 0)}</td>
                      <td className="py-2 pr-4 text-right text-call">{formatNumber(p.callGex)}</td>
                      <td className="py-2 pr-4 text-right text-put">{formatNumber(p.putGex)}</td>
                      <td className={`py-2 pr-4 text-right font-medium ${p.netGex >= 0 ? "text-call" : "text-put"}`}>{formatNumber(p.netGex)}</td>
                      <td className="py-2 pr-4 text-right">{formatNumber(p.dex)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}

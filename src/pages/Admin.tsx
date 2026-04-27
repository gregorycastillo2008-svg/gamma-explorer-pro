import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ArrowLeft, LogOut, Search, Shield, Users, BarChart3, AlertTriangle } from "lucide-react";
import { ExposureChart } from "@/components/ExposureChart";
import { StatCard } from "@/components/StatCard";
import {
  DEMO_TICKERS, getDemoTicker, generateDemoChain,
  computeExposures, computeKeyLevels, formatNumber,
} from "@/lib/gex";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}
interface AdminWatchlist {
  id: string;
  user_id: string;
  email: string;
  ticker: string;
  created_at: string;
}

type Metric = "netGex" | "dex" | "vex" | "vanna" | "charm";

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);
  const nav = useNavigate();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [watchlists, setWatchlists] = useState<AdminWatchlist[]>([]);
  const [search, setSearch] = useState("");
  const [ticker, setTicker] = useState("SPX");
  const [metric, setMetric] = useState<Metric>("netGex");

  useEffect(() => {
    if (!authLoading && !user) nav("/auth", { replace: true });
  }, [user, authLoading, nav]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      supabase.from("admin_users_view").select("*").order("created_at", { ascending: false }),
      supabase.from("admin_watchlists_view").select("*").order("created_at", { ascending: false }),
    ]).then(([usersResult, watchlistsResult]) => {
      if (usersResult.error) console.error("admin_users_view:", usersResult.error);
      if (watchlistsResult.error) console.error("admin_watchlists_view:", watchlistsResult.error);
      setUsers((usersResult.data as AdminUser[]) ?? []);
      setWatchlists((watchlistsResult.data as AdminWatchlist[]) ?? []);
    }).catch((error) => console.error("Admin data:", error));
  }, [isAdmin]);

  if (authLoading || (user && adminLoading)) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Cargando panel admin…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="p-8 max-w-md text-center" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <AlertTriangle className="h-10 w-10 text-flip mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">Acceso restringido</h2>
          <p className="text-muted-foreground text-sm mb-4">Solo los administradores pueden acceder a esta página.</p>
          <Link to="/dashboard"><Button>Volver al panel</Button></Link>
        </Card>
      </div>
    );
  }

  const filteredUsers = users.filter((u) =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const tk = getDemoTicker(ticker)!;
  const contracts = generateDemoChain(tk);
  const exposures = computeExposures(tk.spot, contracts);
  const levels = computeKeyLevels(exposures);

  const tickerCounts = watchlists.reduce<Record<string, number>>((acc, w) => {
    acc[w.ticker] = (acc[w.ticker] ?? 0) + 1;
    return acc;
  }, {});
  const topTickers = Object.entries(tickerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const signOut = async () => { await supabase.auth.signOut(); nav("/"); };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold tracking-tight leading-none">Panel Admin</div>
              <div className="text-xs text-muted-foreground">GEXSATELIT</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" />Panel principal</Button></Link>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1.5" />Salir</Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Usuarios" value={users.length} icon={Users} tone="primary" />
          <StatCard label="Watchlists totales" value={watchlists.length} icon={BarChart3} />
          <StatCard label="Activos hoy" value={users.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at).toDateString() === new Date().toDateString()).length} icon={Activity} tone="call" />
          <StatCard label="Sin verificar" value={users.filter(u => !u.email_confirmed_at).length} icon={AlertTriangle} tone="warning" />
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Usuarios</TabsTrigger>
            <TabsTrigger value="watchlists">Watchlists</TabsTrigger>
            <TabsTrigger value="gamma">Análisis Gamma</TabsTrigger>
          </TabsList>

          {/* USERS */}
          <TabsContent value="users" className="space-y-3">
            <Card className="p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-9" />
                <span className="text-xs text-muted-foreground ml-auto">{filteredUsers.length} resultado(s)</span>
              </div>
              <div className="rounded-md bg-accent/40 border border-accent p-3 text-xs text-muted-foreground mb-3">
                <strong className="text-foreground">Nota de seguridad:</strong> las contraseñas se guardan cifradas (hash bcrypt) y no son recuperables — ni por ti, ni por mí, ni por Supabase. Esto es intencional: si alguien filtra la base de datos, las contraseñas siguen protegidas.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Registro</th>
                      <th className="py-2 pr-4">Último acceso</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2 pr-4 text-right">Tickers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const userTickers = watchlists.filter((w) => w.user_id === u.id);
                      return (
                        <tr key={u.id} className="border-b last:border-0 hover:bg-accent/30">
                          <td className="py-2 pr-4 font-medium">{u.email}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}</td>
                          <td className="py-2 pr-4">
                            {u.email_confirmed_at
                              ? <span className="inline-flex items-center gap-1 text-call text-xs">● Verificado</span>
                              : <span className="inline-flex items-center gap-1 text-flip text-xs">● Pendiente</span>}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {userTickers.length > 0
                              ? <span className="text-xs">{userTickers.map(w => w.ticker).join(", ")}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No hay usuarios.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* WATCHLISTS */}
          <TabsContent value="watchlists" className="space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <Card className="p-4 md:col-span-1" style={{ boxShadow: "var(--shadow-card)" }}>
                <h3 className="font-semibold mb-3">Tickers más seguidos</h3>
                <div className="space-y-2">
                  {topTickers.map(([sym, count]) => (
                    <div key={sym} className="flex items-center justify-between p-2 rounded-md bg-accent/40">
                      <span className="font-medium">{sym}</span>
                      <span className="text-sm text-muted-foreground">{count} usuario(s)</span>
                    </div>
                  ))}
                  {topTickers.length === 0 && <p className="text-sm text-muted-foreground">Sin datos.</p>}
                </div>
              </Card>
              <Card className="p-4 md:col-span-2" style={{ boxShadow: "var(--shadow-card)" }}>
                <h3 className="font-semibold mb-3">Todas las watchlists</h3>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-4">Usuario</th>
                        <th className="py-2 pr-4">Ticker</th>
                        <th className="py-2 pr-4">Añadido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchlists.map((w) => (
                        <tr key={w.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{w.email}</td>
                          <td className="py-2 pr-4 font-medium">{w.ticker}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {watchlists.length === 0 && (
                        <tr><td colSpan={3} className="py-8 text-center text-muted-foreground">Sin watchlists.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* GAMMA ANALYSIS — same as main panel */}
          <TabsContent value="gamma" className="space-y-4">
            <Card className="p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">Ticker:</span>
                <Select value={ticker} onValueChange={setTicker}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEMO_TICKERS.map((t) => (
                      <SelectItem key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="ml-auto text-right">
                  <div className="text-2xl font-bold">${tk.spot.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Spot · IV {(tk.baseIV * 100).toFixed(1)}%</div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total GEX" value={levels.totalGex} formatLarge tone={levels.totalGex >= 0 ? "call" : "put"} />
              <StatCard label="Call Wall" value={levels.callWall} tone="call" />
              <StatCard label="Put Wall" value={levels.putWall} tone="put" />
              <StatCard label="Gamma Flip" value={levels.gammaFlip ?? "—"} tone="warning" />
            </div>

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
              <ExposureChart data={exposures} spot={tk.spot} callWall={levels.callWall} putWall={levels.putWall} flip={levels.gammaFlip} metric={metric} />
            </Card>

            <Card className="p-5 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
              <h3 className="font-semibold mb-3">Detalle por strike</h3>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2 pr-4">Strike</th>
                      <th className="py-2 pr-4 text-right">Call OI</th>
                      <th className="py-2 pr-4 text-right">Put OI</th>
                      <th className="py-2 pr-4 text-right">Net GEX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exposures.map((p) => (
                      <tr key={p.strike} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{p.strike}</td>
                        <td className="py-2 pr-4 text-right">{formatNumber(p.callOI, 0)}</td>
                        <td className="py-2 pr-4 text-right">{formatNumber(p.putOI, 0)}</td>
                        <td className={`py-2 pr-4 text-right font-medium ${p.netGex >= 0 ? "text-call" : "text-put"}`}>{formatNumber(p.netGex)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

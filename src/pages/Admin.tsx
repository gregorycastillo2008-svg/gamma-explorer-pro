import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExposureChart } from "@/components/ExposureChart";
import { StatCard } from "@/components/StatCard";
import {
  DEMO_TICKERS, getDemoTicker, generateDemoChain,
  computeExposures, computeKeyLevels, formatNumber,
} from "@/lib/gex";
import { tryAdminLogin, clearAdminBypass, isAdminBypass } from "@/lib/adminBypass";
import {
  Activity, AlertTriangle, ArrowLeft, BarChart3,
  Eye, LogOut, RefreshCw, Search, Shield, Users, Wifi, WifiOff,
} from "lucide-react";

/* ─────────────────────────────────── Types ─────────────────────────── */
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

/* ─────────────────────────────────── Helpers ───────────────────────── */
const FONT = "'JetBrains Mono', 'Courier New', monospace";
const REFRESH_SEC = 30;

function userStatus(last: string | null): { label: string; color: string; bg: string; pulse: boolean } {
  if (!last) return { label: "NUNCA", color: "#555", bg: "rgba(80,80,80,0.12)", pulse: false };
  const diff = Date.now() - new Date(last).getTime();
  const min  = diff / 60000;
  const hrs  = diff / 3600000;
  const days = diff / 86400000;
  if (min  < 30)  return { label: "ACTIVO AHORA", color: "#22c55e", bg: "rgba(34,197,94,0.12)",  pulse: true  };
  if (hrs  < 4)   return { label: "HOY ACTIVO",   color: "#84cc16", bg: "rgba(132,204,22,0.1)",  pulse: false };
  if (days < 1)   return { label: "HOY",           color: "#eab308", bg: "rgba(234,179,8,0.10)", pulse: false };
  if (days < 7)   return { label: `HACE ${Math.round(days)}d`, color: "#f97316", bg: "rgba(249,115,22,0.1)", pulse: false };
  return { label: `INACTIVO (${Math.round(days)}d)`, color: "#6b7280", bg: "rgba(107,114,128,0.08)", pulse: false };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1)   return "ahora mismo";
  if (min < 60)  return `hace ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24)   return `hace ${hr}h`;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/* ─────────────────────────────────── Login Screen ──────────────────── */
function AdminLogin({ onBypass }: { onBypass: () => void }) {
  const [id, setId]         = useState("");
  const [pass, setPass]     = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [showPass, setShow] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    // Local bypass (id = "gexsatelit2008" / password = master key)
    if (tryAdminLogin(id.trim(), pass)) {
      setBusy(false);
      onBypass();
      return;
    }

    // Supabase email+password fallback
    const email = id.includes("@") ? id.trim() : `${id.trim()}@gexsatelit.com`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) setErr("Credenciales incorrectas — verifica tu acceso.");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050610",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        fontFamily: FONT,
      }}
    >
      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "linear-gradient(rgba(0,230,118,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,230,118,0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 420,
        background: "rgba(9,11,26,0.95)",
        border: "1px solid rgba(0,230,118,0.18)",
        borderRadius: 12,
        padding: "36px 32px 28px",
        boxShadow: "0 0 60px rgba(0,230,118,0.06), 0 24px 60px rgba(0,0,0,0.7)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(0,230,118,0.08)",
            border: "1px solid rgba(0,230,118,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
          }}>
            <Shield style={{ width: 24, height: 24, color: "#00e676" }} />
          </div>
          <div style={{ color: "#00e676", fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 4 }}>
            GEXSATELIT
          </div>
          <div style={{ color: "#c9d1f5", fontSize: 18, fontWeight: 800, letterSpacing: "0.05em" }}>
            Acceso Administrador
          </div>
          <div style={{ color: "#4a5080", fontSize: 11, marginTop: 4 }}>
            Solo personal autorizado
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Admin ID */}
          <div>
            <label style={{ color: "#4a5080", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 6 }}>
              ID de Administrador
            </label>
            <div style={{ position: "relative" }}>
              <Shield style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#4a5080" }} />
              <input
                type="text"
                autoFocus
                required
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder="gexsatelit2008"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(0,230,118,0.15)",
                  borderRadius: 6, color: "#e5e7eb",
                  padding: "10px 12px 10px 32px",
                  fontFamily: FONT, fontSize: 13,
                  outline: "none",
                }}
                onFocus={e => (e.target.style.borderColor = "rgba(0,230,118,0.4)")}
                onBlur={e => (e.target.style.borderColor  = "rgba(0,230,118,0.15)")}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ color: "#4a5080", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 6 }}>
              Contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                required
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="••••••••••••••"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(0,230,118,0.15)",
                  borderRadius: 6, color: "#e5e7eb",
                  padding: "10px 36px 10px 12px",
                  fontFamily: FONT, fontSize: 13,
                  outline: "none",
                }}
                onFocus={e => (e.target.style.borderColor = "rgba(0,230,118,0.4)")}
                onBlur={e => (e.target.style.borderColor  = "rgba(0,230,118,0.15)")}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "#4a5080", padding: 0,
                }}
              >
                <Eye style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Error */}
          {err && (
            <div style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6, padding: "10px 12px",
              display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <AlertTriangle style={{ width: 14, height: 14, color: "#fca5a5", marginTop: 1, flexShrink: 0 }} />
              <span style={{ color: "#fca5a5", fontSize: 12 }}>{err}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              background: busy ? "rgba(0,230,118,0.15)" : "rgba(0,230,118,0.18)",
              border: "1px solid rgba(0,230,118,0.35)",
              borderRadius: 6, color: "#00e676",
              padding: "12px", fontFamily: FONT,
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: busy ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {busy ? "Verificando…" : "Entrar al Panel"}
          </button>

          <div style={{ textAlign: "center" }}>
            <Link to="/" style={{ color: "#4a5080", fontSize: 11, textDecoration: "none" }}>
              ← Volver al inicio
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────── Stat Card ─────────────────────── */
function Kpi({ label, value, color, icon: Icon, pulse }: {
  label: string; value: number | string; color: string; icon: any; pulse?: boolean;
}) {
  return (
    <div style={{
      background: "rgba(9,11,26,0.8)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 8, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {pulse && (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block",
            boxShadow: `0 0 8px ${color}`,
            animation: "pulse 1.5s infinite",
          }} />
        )}
        <Icon style={{ width: 14, height: 14, color }} />
        <span style={{ color: "#4a5080", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: FONT }}>{label}</span>
      </div>
      <div style={{ color, fontSize: 22, fontWeight: 800, fontFamily: FONT }}>{value}</div>
    </div>
  );
}

/* ─────────────────────────────────── User Row ───────────────────────── */
function UserRow({ u, wl }: { u: AdminUser; wl: AdminWatchlist[] }) {
  const st = userStatus(u.last_sign_in_at);
  const tickers = wl.filter(w => w.user_id === u.id).map(w => w.ticker);
  const regDate = new Date(u.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });

  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {/* Status dot */}
      <td style={{ padding: "10px 12px", width: 28 }}>
        <span style={{
          display: "inline-block", width: 9, height: 9, borderRadius: "50%",
          background: st.color,
          boxShadow: st.pulse ? `0 0 8px ${st.color}` : "none",
        }} />
      </td>
      {/* Email */}
      <td style={{ padding: "10px 12px", fontFamily: FONT, fontSize: 11, color: "#c9d1f5", fontWeight: 600 }}>
        {u.email}
        {!u.email_confirmed_at && (
          <span style={{ marginLeft: 6, fontSize: 8, color: "#f97316", border: "1px solid #f9731640", borderRadius: 3, padding: "1px 4px" }}>
            NO VERIFICADO
          </span>
        )}
      </td>
      {/* Status badge */}
      <td style={{ padding: "10px 12px" }}>
        <span style={{
          background: st.bg, border: `1px solid ${st.color}44`,
          color: st.color, borderRadius: 4, padding: "2px 7px",
          fontSize: 9, fontFamily: FONT, fontWeight: 700, letterSpacing: "0.08em",
          whiteSpace: "nowrap",
        }}>
          {st.label}
        </span>
      </td>
      {/* Last seen */}
      <td style={{ padding: "10px 12px", fontFamily: FONT, fontSize: 10, color: "#4a5080", whiteSpace: "nowrap" }}>
        {timeAgo(u.last_sign_in_at)}
      </td>
      {/* Registered */}
      <td style={{ padding: "10px 12px", fontFamily: FONT, fontSize: 10, color: "#4a5080" }}>
        {regDate}
      </td>
      {/* Tickers */}
      <td style={{ padding: "10px 12px" }}>
        {tickers.length > 0 ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {tickers.map(t => (
              <span key={t} style={{
                background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)",
                color: "#00e676", borderRadius: 3, padding: "1px 5px",
                fontSize: 9, fontFamily: FONT,
              }}>{t}</span>
            ))}
          </div>
        ) : (
          <span style={{ color: "#2a3050", fontSize: 10, fontFamily: FONT }}>—</span>
        )}
      </td>
    </tr>
  );
}

/* ─────────────────────────────────── Main Panel ────────────────────── */
function AdminPanel({
  users, watchlists, lastRefresh, refreshing, onRefresh, onSignOut,
}: {
  users: AdminUser[];
  watchlists: AdminWatchlist[];
  lastRefresh: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<"all" | "active" | "inactive">("all");
  const [ticker, setTicker]   = useState("SPX");
  const [metric, setMetric]   = useState<Metric>("netGex");

  const [countdown, setCountdown] = useState(REFRESH_SEC);
  useEffect(() => {
    if (!lastRefresh) return;
    setCountdown(REFRESH_SEC);
    const id = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [lastRefresh]);

  const activeNow  = users.filter(u => u.last_sign_in_at && (Date.now() - new Date(u.last_sign_in_at).getTime()) < 30 * 60000);
  const activeToday = users.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at).toDateString() === new Date().toDateString());
  const unverified = users.filter(u => !u.email_confirmed_at);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all"      ? true :
      filter === "active"   ? (u.last_sign_in_at && (Date.now() - new Date(u.last_sign_in_at).getTime()) < 24 * 3600000) :
      /* inactive */         (!u.last_sign_in_at || (Date.now() - new Date(u.last_sign_in_at).getTime()) >= 24 * 3600000);
    return matchSearch && matchFilter;
  });

  const tk = getDemoTicker(ticker)!;
  const contracts = generateDemoChain(tk);
  const exposures = computeExposures(tk.spot, contracts);
  const levels    = computeKeyLevels(exposures);

  const tickerCounts = watchlists.reduce<Record<string, number>>((acc, w) => {
    acc[w.ticker] = (acc[w.ticker] ?? 0) + 1; return acc;
  }, {});
  const topTickers = Object.entries(tickerCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div style={{ minHeight: "100vh", background: "#05060f", fontFamily: FONT, color: "#e5e7eb" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .admin-row:hover { background: rgba(0,230,118,0.03); }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #05060f; }
        ::-webkit-scrollbar-thumb { background: #1e2140; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(9,11,26,0.95)", backdropFilter: "blur(10px)",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield style={{ width: 18, height: 18, color: "#00e676" }} />
          </div>
          <div>
            <div style={{ color: "#c9d1f5", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em" }}>PANEL ADMIN</div>
            <div style={{ color: "#4a5080", fontSize: 9, letterSpacing: "0.15em" }}>GEXSATELIT · ACCESO RESTRINGIDO</div>
          </div>
          {/* Live indicator */}
          <div style={{ marginLeft: 12, display: "flex", alignItems: "center", gap: 6,
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 20, padding: "3px 10px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e",
              boxShadow: "0 0 6px #22c55e", animation: "pulse 1.5s infinite", display: "inline-block" }} />
            <span style={{ color: "#22c55e", fontSize: 9, letterSpacing: "0.12em" }}>
              {activeNow.length} ACTIVOS AHORA
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Refresh counter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#4a5080", fontSize: 9 }}>
            <button onClick={onRefresh} disabled={refreshing} style={{
              background: "none", border: "none", cursor: "pointer", color: "#4a5080", padding: 0,
            }}>
              <RefreshCw style={{ width: 12, height: 12, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
            {lastRefresh ? `Actualizado ${timeAgo(lastRefresh.toISOString())}` : "—"}
            {" · "}
            <span style={{ color: countdown < 10 ? "#f97316" : "#4a5080" }}>
              próximo en {countdown}s
            </span>
          </div>

          <Link to="/dashboard" style={{ textDecoration: "none" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6, padding: "7px 12px", color: "#9ca3af", cursor: "pointer", fontSize: 10,
            }}>
              <ArrowLeft style={{ width: 12, height: 12 }} />Panel principal
            </button>
          </Link>
          <button onClick={onSignOut} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6, padding: "7px 12px", color: "#f87171", cursor: "pointer", fontSize: 10,
          }}>
            <LogOut style={{ width: 12, height: 12 }} />Salir
          </button>
        </div>
      </header>

      <main style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 }}>
          <Kpi label="Total Usuarios" value={users.length}         color="#00e676" icon={Users}         />
          <Kpi label="Activos Ahora"  value={activeNow.length}     color="#22c55e" icon={Wifi}    pulse  />
          <Kpi label="Activos Hoy"    value={activeToday.length}   color="#84cc16" icon={Activity}       />
          <Kpi label="Sin Verificar"  value={unverified.length}    color="#f97316" icon={AlertTriangle}  />
          <Kpi label="Watchlists"     value={watchlists.length}    color="#00bcd4" icon={BarChart3}       />
          <Kpi label="Tickers Únicos" value={Object.keys(tickerCounts).length} color="#aa77ff" icon={Eye} />
        </div>

        {/* Main tabs */}
        <div style={{
          background: "rgba(9,11,26,0.6)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 4px" }}>
            <Tabs defaultValue="users">
              <TabsList style={{ background: "transparent", gap: 2, padding: "8px 6px 0" }}>
                <TabsTrigger value="users"      style={{ fontFamily: FONT, fontSize: 10 }}>👥 Usuarios ({users.length})</TabsTrigger>
                <TabsTrigger value="active"     style={{ fontFamily: FONT, fontSize: 10 }}>🟢 Activos ({activeNow.length})</TabsTrigger>
                <TabsTrigger value="watchlists" style={{ fontFamily: FONT, fontSize: 10 }}>📊 Watchlists</TabsTrigger>
                <TabsTrigger value="gamma"      style={{ fontFamily: FONT, fontSize: 10 }}>⚡ Análisis Gamma</TabsTrigger>
              </TabsList>

              {/* ── ALL USERS tab ── */}
              <TabsContent value="users" style={{ padding: "14px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", flex: "1 1 220px" }}>
                    <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#4a5080" }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar por email…"
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 6, color: "#e5e7eb",
                        padding: "8px 12px 8px 30px",
                        fontFamily: FONT, fontSize: 11, outline: "none",
                      }}
                    />
                  </div>
                  {(["all","active","inactive"] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                      background: filter === f ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${filter === f ? "rgba(0,230,118,0.35)" : "rgba(255,255,255,0.08)"}`,
                      color: filter === f ? "#00e676" : "#4a5080",
                      borderRadius: 6, padding: "8px 14px", fontSize: 10,
                      fontFamily: FONT, cursor: "pointer", letterSpacing: "0.1em",
                    }}>
                      {f === "all" ? "TODOS" : f === "active" ? "ACTIVOS HOY" : "INACTIVOS"}
                    </button>
                  ))}
                  <span style={{ color: "#4a5080", fontSize: 10, marginLeft: "auto" }}>
                    {filtered.length} resultado(s)
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {["", "Email", "Estado", "Último acceso", "Registro", "Tickers"].map(h => (
                          <th key={h} style={{
                            padding: "8px 12px", textAlign: "left",
                            color: "#4a5080", fontSize: 9,
                            textTransform: "uppercase", letterSpacing: "0.15em",
                            fontFamily: FONT, fontWeight: 600,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => (
                        <UserRow key={u.id} u={u} wl={watchlists} />
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#4a5080", fontSize: 12, fontFamily: FONT }}>
                            No hay usuarios en esta vista.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* ── ACTIVE NOW tab ── */}
              <TabsContent value="active" style={{ padding: "14px 12px" }}>
                <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e",
                    boxShadow: "0 0 8px #22c55e", animation: "pulse 1.5s infinite", display: "inline-block" }} />
                  <span style={{ color: "#22c55e", fontSize: 10, letterSpacing: "0.12em" }}>
                    USUARIOS ACTIVOS EN ESTE MOMENTO (últimos 30 min)
                  </span>
                </div>
                {activeNow.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <WifiOff style={{ width: 32, height: 32, color: "#2a3050", margin: "0 auto 12px" }} />
                    <div style={{ color: "#4a5080", fontSize: 12, fontFamily: FONT }}>Ningún usuario activo en este momento</div>
                    <div style={{ color: "#2a3050", fontSize: 10, marginTop: 4 }}>El panel se actualiza automáticamente cada {REFRESH_SEC}s</div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {activeNow.map(u => {
                      const tks = watchlists.filter(w => w.user_id === u.id).map(w => w.ticker);
                      return (
                        <div key={u.id} style={{
                          background: "rgba(34,197,94,0.05)",
                          border: "1px solid rgba(34,197,94,0.2)",
                          borderRadius: 8, padding: "12px 16px",
                          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                        }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: "50%", background: "#22c55e",
                            boxShadow: "0 0 10px #22c55e", animation: "pulse 1.5s infinite",
                            display: "inline-block", flexShrink: 0,
                          }} />
                          <span style={{ color: "#c9d1f5", fontSize: 12, fontWeight: 700, flex: 1 }}>{u.email}</span>
                          <span style={{ color: "#22c55e", fontSize: 10 }}>
                            Último acceso: {timeAgo(u.last_sign_in_at)}
                          </span>
                          {tks.length > 0 && (
                            <div style={{ display: "flex", gap: 4 }}>
                              {tks.map(t => (
                                <span key={t} style={{
                                  background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)",
                                  color: "#00e676", borderRadius: 3, padding: "1px 6px", fontSize: 9,
                                }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── WATCHLISTS tab ── */}
              <TabsContent value="watchlists" style={{ padding: "14px 12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
                  {/* Top tickers */}
                  <div style={{
                    background: "rgba(9,11,26,0.6)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8, padding: "12px 14px",
                  }}>
                    <div style={{ color: "#7a82b0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>
                      Top Tickers
                    </div>
                    {topTickers.map(([sym, count], i) => (
                      <div key={sym} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 0", borderBottom: i < topTickers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#4a5080", fontSize: 9 }}>#{i + 1}</span>
                          <span style={{ color: "#00e676", fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>{sym}</span>
                        </div>
                        <span style={{
                          background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)",
                          color: "#00e676", borderRadius: 4, padding: "2px 8px", fontSize: 10,
                        }}>{count}</span>
                      </div>
                    ))}
                    {topTickers.length === 0 && <div style={{ color: "#4a5080", fontSize: 11 }}>Sin datos</div>}
                  </div>

                  {/* All watchlists */}
                  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 380 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead style={{ position: "sticky", top: 0, background: "#05060f" }}>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                          {["Usuario", "Ticker", "Añadido"].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#4a5080", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {watchlists.map(w => (
                          <tr key={w.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "8px 12px", fontFamily: FONT, fontSize: 11, color: "#9ca3af" }}>{w.email}</td>
                            <td style={{ padding: "8px 12px", fontFamily: FONT, fontSize: 11, color: "#00e676", fontWeight: 700 }}>{w.ticker}</td>
                            <td style={{ padding: "8px 12px", fontFamily: FONT, fontSize: 10, color: "#4a5080" }}>{new Date(w.created_at).toLocaleDateString("es-ES")}</td>
                          </tr>
                        ))}
                        {watchlists.length === 0 && (
                          <tr><td colSpan={3} style={{ padding: "32px", textAlign: "center", color: "#4a5080", fontSize: 12, fontFamily: FONT }}>Sin watchlists registradas.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* ── GAMMA tab ── */}
              <TabsContent value="gamma" style={{ padding: "14px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <span style={{ color: "#4a5080", fontSize: 11 }}>Ticker:</span>
                  <Select value={ticker} onValueChange={setTicker}>
                    <SelectTrigger style={{ width: 220, fontFamily: FONT, fontSize: 11 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEMO_TICKERS.map(t => (
                        <SelectItem key={t.symbol} value={t.symbol} style={{ fontFamily: FONT, fontSize: 11 }}>
                          {t.symbol} — {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div style={{ marginLeft: "auto" }}>
                    <span style={{ color: "#c9d1f5", fontSize: 22, fontWeight: 800 }}>${tk.spot.toLocaleString()}</span>
                    <span style={{ color: "#4a5080", fontSize: 10, marginLeft: 8 }}>Spot · IV {(tk.baseIV * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                  <StatCard label="Total GEX"  value={levels.totalGex} formatLarge tone={levels.totalGex >= 0 ? "call" : "put"} />
                  <StatCard label="Call Wall"  value={levels.callWall}  tone="call" />
                  <StatCard label="Put Wall"   value={levels.putWall}   tone="put" />
                  <StatCard label="Gamma Flip" value={levels.gammaFlip ?? "—"} tone="warning" />
                </div>

                <div style={{ background: "rgba(9,11,26,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "14px" }}>
                  <Tabs value={metric} onValueChange={v => setMetric(v as Metric)}>
                    <TabsList style={{ marginBottom: 12 }}>
                      {(["netGex","dex","vex","vanna","charm"] as Metric[]).map(m => (
                        <TabsTrigger key={m} value={m} style={{ fontFamily: FONT, fontSize: 10, textTransform: "uppercase" }}>{m}</TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <ExposureChart data={exposures} spot={tk.spot} callWall={levels.callWall} putWall={levels.putWall} flip={levels.gammaFlip} metric={metric} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────────────── Root ───────────────────────────── */
export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);
  const nav = useNavigate();

  const [bypass,     setBypass]     = useState(isAdminBypass());
  const [users,      setUsers]      = useState<AdminUser[]>([]);
  const [watchlists, setWatchlists] = useState<AdminWatchlist[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);

  const authed = bypass || (user && isAdmin);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [ur, wr] = await Promise.all([
        supabase.from("admin_users_view").select("*").order("last_sign_in_at", { ascending: false }),
        supabase.from("admin_watchlists_view").select("*").order("created_at", { ascending: false }),
      ]);
      setUsers((ur.data as AdminUser[]) ?? []);
      setWatchlists((wr.data as AdminWatchlist[]) ?? []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Admin fetch:", e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Load data once admin is confirmed
  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

  // Auto-refresh every REFRESH_SEC seconds
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(fetchData, REFRESH_SEC * 1000);
    return () => clearInterval(id);
  }, [authed, fetchData]);

  // Kick non-admin logged-in users
  useEffect(() => {
    if (!authLoading && !adminLoading && user && !isAdmin && !bypass) {
      void supabase.auth.signOut();
    }
  }, [authLoading, adminLoading, user, isAdmin, bypass]);

  const handleSignOut = async () => {
    clearAdminBypass();
    setBypass(false);
    await supabase.auth.signOut();
    nav("/");
  };

  if (authLoading || (user && adminLoading)) {
    return (
      <div style={{ minHeight: "100vh", background: "#05060f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono',monospace", color: "#4a5080" }}>
        Cargando panel…
      </div>
    );
  }

  if (!authed) {
    return <AdminLogin onBypass={() => { setBypass(true); fetchData(); }} />;
  }

  return (
    <AdminPanel
      users={users}
      watchlists={watchlists}
      lastRefresh={lastRefresh}
      refreshing={refreshing}
      onRefresh={fetchData}
      onSignOut={handleSignOut}
    />
  );
}

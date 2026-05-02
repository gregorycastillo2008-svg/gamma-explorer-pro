import { useEffect, useRef, useMemo } from "react";
import type { DemoTicker, ExposurePoint, KeyLevels } from "@/lib/gex";

interface Props { ticker: DemoTicker; exposures: ExposurePoint[]; levels: KeyLevels; }

// ── Physics quantities derived from options data ──────────────────────────
function computePhysics(exp: ExposurePoint[], lv: KeyLevels, tk: DemoTicker) {
  const spot = tk.spot;
  const nearby = exp.filter(e => Math.abs(e.strike - spot) / spot < 0.06);
  const totalCallGex = exp.reduce((s, e) => s + e.callGex, 0);
  const totalPutGex  = exp.reduce((s, e) => s + Math.abs(e.putGex), 0);
  const totalNetGex  = exp.reduce((s, e) => s + e.netGex, 0);
  const totalDex     = exp.reduce((s, e) => s + e.dex, 0);
  const totalVex     = exp.reduce((s, e) => s + e.vex, 0);
  const totalVanna   = exp.reduce((s, e) => s + e.vanna, 0);
  const totalCharm   = exp.reduce((s, e) => s + e.charm, 0);

  // Gamma gravity force at spot = Σ netGex_i / |spot - strike_i| (sign-preserving)
  let forceAtSpot = 0;
  for (const e of nearby) {
    const d = spot - e.strike;
    if (Math.abs(d) < 1) continue;
    forceAtSpot += e.netGex / (d * Math.abs(d));
  }

  // Max gamma strike (strongest attractor)
  const maxGexStrike = exp.reduce((b, e) => Math.abs(e.netGex) > Math.abs(b.netGex) ? e : b, exp[0] ?? { strike: spot, netGex: 0 });

  // Gamma pin risk (0–100): how close spot is to max gamma strike
  const pinDist = Math.abs(spot - maxGexStrike.strike);
  const pinRisk = Math.max(0, 100 - (pinDist / (tk.strikeStep || 5)) * 20);

  // Call/put imbalance (-1 = full put, +1 = full call)
  const totalAbs = totalCallGex + totalPutGex;
  const imbalance = totalAbs > 0 ? (totalCallGex - totalPutGex) / totalAbs : 0;

  // Gamma squeeze proximity: |spot - gammaFlip| / range
  const flip = lv.gammaFlip ?? lv.volTrigger ?? spot;
  const flipDist = Math.abs(spot - flip);
  const squeezeRisk = Math.max(0, 100 - (flipDist / (tk.strikeStep * 5)) * 100);

  // Velocity (delta-weighted): net DEX / (spot * total OI)
  const totalOI = exp.reduce((s, e) => s + e.callOI + e.putOI, 0);
  const velocity = totalOI > 0 ? (totalDex / (spot * Math.max(totalOI, 1))) * 1e4 : 0;

  return {
    forceAtSpot, forceDir: forceAtSpot > 0 ? "BULL" : forceAtSpot < 0 ? "BEAR" : "NEUTRAL",
    totalNetGex, totalCallGex, totalPutGex, totalDex, totalVex, totalVanna, totalCharm,
    maxGexStrike, pinRisk, imbalance, squeezeRisk, velocity, flip,
    nearSpot: nearby,
  };
}

// ── Circular SVG gauge ────────────────────────────────────────────────────
function Gauge({ value, min, max, label, sublabel, color, fmt }: {
  value: number; min: number; max: number; label: string; sublabel?: string;
  color: string; fmt?: (v: number) => string;
}) {
  const pct  = Math.max(0, Math.min(1, (value - min) / (Math.max(max - min, 1e-9))));
  const R = 38, cx = 50, cy = 52, span = 260;
  const startDeg = -130, deg = startDeg + pct * span;
  const toXY = (d: number) => {
    const r = (d - 90) * Math.PI / 180;
    return { x: cx + R * Math.cos(r), y: cy + R * Math.sin(r) };
  };
  const s = toXY(startDeg), e = toXY(startDeg + span), c = toXY(deg);
  const bigArc = span > 180 ? 1 : 0;
  const dispVal = fmt ? fmt(value) : (Math.abs(value) >= 1e9 ? (value/1e9).toFixed(1)+"B" : Math.abs(value) >= 1e6 ? (value/1e6).toFixed(1)+"M" : value.toFixed(1));

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
      <svg viewBox="0 0 100 78" width={110} height={86}>
        <defs>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <path d={`M${s.x},${s.y} A${R},${R} 0 ${bigArc},1 ${e.x},${e.y}`}
          fill="none" stroke="#0e1420" strokeWidth={7} strokeLinecap="round"/>
        {/* Fill */}
        {pct > 0.005 && (
          <path d={`M${s.x},${s.y} A${R},${R} 0 ${pct*span>180?1:0},1 ${c.x},${c.y}`}
            fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
            filter={`url(#glow-${label})`}/>
        )}
        {/* Needle dot */}
        <circle cx={c.x} cy={c.y} r={4} fill={color} filter={`url(#glow-${label})`}/>
        {/* Value */}
        <text x={cx} y={cy+4} textAnchor="middle" fontSize={10} fontWeight={700}
          fontFamily="'Courier New',monospace" fill={color}>{dispVal}</text>
        {/* Label */}
        <text x={cx} y={cy+15} textAnchor="middle" fontSize={7}
          fontFamily="'Courier New',monospace" fill="#2a3848">{label}</text>
      </svg>
      {sublabel && <div style={{ fontSize:9, color:"#1e2535", fontFamily:"'Courier New',monospace" }}>{sublabel}</div>}
    </div>
  );
}

// ── Animated force-field canvas ───────────────────────────────────────────
function ForceCanvas({ exposures, ticker, levels }: Omit<Props,"levels"> & { levels: KeyLevels }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const tRef      = useRef(0);

  const field = useMemo(() => {
    if (!exposures.length) return null;
    const spot  = ticker.spot;
    const range = (ticker.strikeStep || 5) * 28;
    const bot   = spot - range / 2;
    const steps = 300;
    const forces: { price: number; bull: number; bear: number; net: number }[] = [];
    let maxF = 0;
    for (let i = 0; i <= steps; i++) {
      const p = bot + (i / steps) * range;
      let bull = 0, bear = 0;
      for (const e of exposures) {
        const d = p - e.strike;
        if (Math.abs(d) < 0.5) continue;
        const f = e.netGex / (d * d) * (d > 0 ? 1 : -1);
        if (f > 0) bull += f; else bear += Math.abs(f);
      }
      maxF = Math.max(maxF, bull, bear);
      forces.push({ price: p, bull, bear, net: bull - bear });
    }
    if (maxF > 0) forces.forEach(f => { f.bull /= maxF; f.bear /= maxF; f.net /= maxF; });
    return { forces, bot, range, spot };
  }, [exposures, ticker]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx  = canvas.getContext("2d")!;

    const resize = () => {
      const { offsetWidth: w, offsetHeight: h } = canvas.parentElement!;
      canvas.width  = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const draw = () => {
      if (!field) return;
      tRef.current += 0.012;
      const t  = tRef.current;
      const W  = canvas.width, H = canvas.height;
      const dW = W / dpr, dH = H / dpr;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

      const { forces, bot, range } = field;
      const pY = (p: number) => H * (1 - (p - bot) / range);

      // ── Draw force field heatmap (vertical strips) ──
      const steps = forces.length;
      for (let i = 0; i < steps; i++) {
        const f = forces[i];
        const y0 = pY(f.price);
        const y1 = pY(forces[i + 1]?.price ?? f.price + range / steps);
        const h  = Math.abs(y1 - y0) + 1;

        // Pulse animation
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.5 + i * 0.04);

        if (f.bull > 0.05) {
          const a = Math.min(f.bull * pulse * 0.35, 0.35);
          ctx.fillStyle = `rgba(34,197,140,${a.toFixed(3)})`;
          ctx.fillRect(0, Math.min(y0, y1), W * 0.5, h);
        }
        if (f.bear > 0.05) {
          const a = Math.min(f.bear * pulse * 0.35, 0.35);
          ctx.fillStyle = `rgba(220,60,60,${a.toFixed(3)})`;
          ctx.fillRect(W * 0.5, Math.min(y0, y1), W * 0.5, h);
        }
      }

      // Scanlines
      ctx.strokeStyle = "rgba(0,212,255,0.03)"; ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 4 * dpr) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // ── Key level lines ──
      const drawLevel = (p: number | null | undefined, col: string, lbl: string) => {
        if (!p) return;
        const y = pY(p);
        if (y < 0 || y > H) return;
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = 8 * dpr;
        ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([8*dpr, 5*dpr]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.fillStyle = col; ctx.font = `bold ${8*dpr}px 'Courier New'`;
        ctx.textAlign = "right";
        ctx.fillText(lbl + " " + p.toFixed(0), W - 6*dpr, y - 3*dpr);
      };
      drawLevel(levels.callWall,                       "#a3e635", "CALL WALL");
      drawLevel(levels.putWall,                        "#f87171", "PUT WALL");
      drawLevel(levels.gammaFlip ?? levels.volTrigger, "#facc15", "ZERO Γ");
      drawLevel(levels.majorWall,                      "#c084fc", "MAJOR");
      drawLevel(levels.maxPain,                        "#fb923c", "MAX PAIN");

      // ── Net force vector arrows (at each major strike) ──
      for (const e of exposures) {
        if (Math.abs(e.strike - field.spot) / field.spot > 0.06) continue;
        const y  = pY(e.strike);
        if (y < 10*dpr || y > H - 10*dpr) continue;
        const maxGex = Math.max(...exposures.map(x => Math.abs(x.netGex)), 1);
        const strength = e.netGex / maxGex;
        const arrLen = Math.abs(strength) * 40 * dpr;
        if (arrLen < 3) continue;
        const dir = e.netGex > 0 ? -1 : 1; // positive gex = upward force (negative y)
        const col = e.netGex > 0 ? "#2dd4a0" : "#f05050";
        const cx2 = W / 2;
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = 6 * dpr;
        ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(cx2, y); ctx.lineTo(cx2, y + dir * arrLen); ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(cx2, y + dir * arrLen);
        ctx.lineTo(cx2 - 5*dpr, y + dir * arrLen - dir * 8*dpr);
        ctx.lineTo(cx2 + 5*dpr, y + dir * arrLen - dir * 8*dpr);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        ctx.restore();
      }

      // ── GEX bars (behind center line) ──
      const maxGex2 = Math.max(...exposures.map(e => Math.max(e.callGex, Math.abs(e.putGex))), 1);
      const sorted = [...exposures].sort((a, b) => a.strike - b.strike);
      for (let i = 0; i < sorted.length; i++) {
        const e = sorted[i];
        if (Math.abs(e.strike - field.spot) / field.spot > 0.08) continue;
        const y0 = pY(e.strike);
        const nextStrike = sorted[i + 1]?.strike ?? e.strike + (ticker.strikeStep || 5);
        const slotH = Math.abs(pY(nextStrike) - y0);
        const bH = Math.max(2, slotH * 0.85);
        const bT = y0 - bH / 2;
        const BAR = W * 0.38;
        const cW = (e.callGex / maxGex2) * BAR;
        const pW = (Math.abs(e.putGex) / maxGex2) * BAR;
        const isMaxCall = e.callGex === Math.max(...exposures.map(x => x.callGex));
        const isMaxPut  = Math.abs(e.putGex) === Math.max(...exposures.map(x => Math.abs(x.putGex)));

        if (cW > 1) {
          ctx.fillStyle = isMaxCall ? "rgba(40,255,170,0.9)" : "rgba(34,197,140,0.55)";
          if (isMaxCall) { ctx.save(); ctx.shadowColor="#00ffaa"; ctx.shadowBlur=14*dpr; }
          ctx.fillRect(W/2 + 1, bT, cW, bH);
          if (isMaxCall) ctx.restore();
        }
        if (pW > 1) {
          ctx.fillStyle = isMaxPut ? "rgba(255,50,50,0.9)" : "rgba(220,60,60,0.55)";
          if (isMaxPut) { ctx.save(); ctx.shadowColor="#ff3030"; ctx.shadowBlur=14*dpr; }
          ctx.fillRect(W/2 - pW - 1, bT, pW, bH);
          if (isMaxPut) ctx.restore();
        }
      }

      // ── Center divider ──
      ctx.strokeStyle = "#1a2535"; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();

      // ── SPOT price line + glow ──
      const sy = pY(field.spot);
      ctx.save();
      ctx.shadowColor = "#e8963a"; ctx.shadowBlur = 16 * dpr;
      ctx.strokeStyle = "#e8963a"; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      // Spot label
      const lw = 80*dpr, lh = 16*dpr;
      ctx.fillStyle = "#130a00"; ctx.lineWidth = 1;
      ctx.strokeStyle = "#e8963a";
      ctx.beginPath(); ctx.roundRect?.(8*dpr, sy-lh/2, lw, lh, 3*dpr) ?? ctx.rect(8*dpr, sy-lh/2, lw, lh);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e8963a"; ctx.font = `bold ${9*dpr}px 'Courier New'`;
      ctx.textAlign = "left";
      ctx.fillText("▶ SPOT  " + field.spot.toFixed(2), 12*dpr, sy + 3*dpr);
      ctx.restore();

      // ── Particle effect at spot ──
      const pulse2 = 1 + 0.3 * Math.sin(t * 3);
      ctx.save();
      ctx.shadowColor = "#e8963a"; ctx.shadowBlur = 20 * dpr * pulse2;
      ctx.beginPath(); ctx.arc(W/2, sy, 6*dpr*pulse2, 0, Math.PI*2);
      ctx.fillStyle = "#e8963a"; ctx.fill();
      ctx.restore();

      // ── Headers ──
      ctx.font = `bold ${10*dpr}px 'Courier New'`;
      ctx.fillStyle = "#f05050"; ctx.textAlign = "right";
      ctx.fillText("← PUT FORCE", W/2 - 8*dpr, 14*dpr);
      ctx.fillStyle = "#2dd4a0"; ctx.textAlign = "left";
      ctx.fillText("CALL FORCE →", W/2 + 8*dpr, 14*dpr);

      // ── Price axis labels (right side) ──
      ctx.fillStyle = "#1a2535"; ctx.font = `${8*dpr}px 'Courier New'`; ctx.textAlign = "right";
      const pStep = range > 200 ? 10 : 5;
      for (let p = Math.ceil(bot / pStep) * pStep; p <= bot + range; p += pStep) {
        const y = pY(p);
        if (y > 8*dpr && y < H - 4*dpr) ctx.fillText(p.toFixed(0), W - 3*dpr, y + 3*dpr);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, [field, exposures, ticker, levels]);

  return (
    <div style={{ position:"relative", flex:1, minWidth:0, minHeight:0 }}>
      <canvas ref={canvasRef} style={{ display:"block", width:"100%", height:"100%" }} />
    </div>
  );
}

// ── Neon metric card ──────────────────────────────────────────────────────
function NCard({ label, value, sub, col, glow }: { label:string; value:string; sub?:string; col:string; glow?:boolean }) {
  return (
    <div style={{
      background:"#03050a", border:`1px solid ${col}33`,
      borderRadius:8, padding:"10px 14px", flex:1, minWidth:120,
      boxShadow: glow ? `0 0 18px ${col}44` : "none",
    }}>
      <div style={{ color:"#1a2535", fontSize:8, letterSpacing:".15em", fontFamily:"'Courier New',monospace", marginBottom:4 }}>{label}</div>
      <div style={{ color:col, fontSize:18, fontWeight:700, fontFamily:"'Courier New',monospace", letterSpacing:".06em",
        textShadow: glow ? `0 0 12px ${col}` : "none" }}>{value}</div>
      {sub && <div style={{ color:"#2a3545", fontSize:9, fontFamily:"'Courier New',monospace", marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────
function SecHead({ title, sub, col = "#a3e635" }: { title:string; sub?:string; col?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:12 }}>
      <span style={{ color:col, fontWeight:700, fontSize:11, letterSpacing:".15em", fontFamily:"'Courier New',monospace" }}>{title}</span>
      {sub && <span style={{ color:"#1a2535", fontSize:9, fontFamily:"'Courier New',monospace" }}>{sub}</span>}
      <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${col}44,transparent)` }} />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────
export function PhysicsView({ ticker, exposures, levels }: Props) {
  const ph = useMemo(() => computePhysics(exposures, levels, ticker), [exposures, levels, ticker]);

  const fmtB = (v: number) => (v / 1e9).toFixed(2) + "B";
  const fmtM = (v: number) => (v / 1e6).toFixed(1) + "M";

  // Gauge ranges (based on typical magnitudes)
  const gexRange   = Math.max(Math.abs(ph.totalNetGex), 1e9);
  const dexRange   = Math.max(Math.abs(ph.totalDex),    1e9);
  const vexRange   = Math.max(Math.abs(ph.totalVex),    1e8);
  const vannaRange = Math.max(Math.abs(ph.totalVanna),  1e8);

  const forceCol = ph.forceDir === "BULL" ? "#22c55e" : ph.forceDir === "BEAR" ? "#ef4444" : "#facc15";

  const isRealData = exposures.length >= 3;

  return (
    <div style={{ background:"#000", height:"100%", display:"flex", flexDirection:"column", fontFamily:"'Courier New',monospace", overflowY:"auto", scrollbarWidth:"thin", scrollbarColor:"#1a2030 transparent" }}>

      {/* ── TOP BAR ── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 16px", borderBottom:"1px solid #0e1420", background:"#030508", flexWrap:"wrap", flexShrink:0 }}>
        <span style={{ color:"#a3e635", fontWeight:700, fontSize:16, letterSpacing:".1em" }}>⚡ FÍSICA</span>
        <span style={{ color:"#0e1420" }}>│</span>
        <span style={{ color:"#e8963a", fontWeight:700, fontSize:13 }}>{ticker.symbol}</span>
        <span style={{ color:"#f0fafe", fontWeight:700, fontSize:14 }}>{ticker.spot.toFixed(2)}</span>
        <span style={{ padding:"1px 8px", borderRadius:3, fontSize:9, fontWeight:700, letterSpacing:".1em",
          background: forceCol + "22", border:`1px solid ${forceCol}66`, color: forceCol }}>
          {ph.forceDir === "BULL" ? "↑ FUERZA ALCISTA" : ph.forceDir === "BEAR" ? "↓ FUERZA BAJISTA" : "→ NEUTRO"}
        </span>
        {ph.pinRisk > 70 && (
          <span style={{ padding:"1px 8px", borderRadius:3, fontSize:9, fontWeight:700, letterSpacing:".1em",
            background:"#facc1522", border:"1px solid #facc1566", color:"#facc15",
            animation:"none" }}>
            ⚠ GAMMA PIN RISK {ph.pinRisk.toFixed(0)}%
          </span>
        )}
        <div style={{ marginLeft:"auto", display:"flex", gap:14, color:"#1a2535", fontSize:9 }}>
          <span>Γ TOTAL <span style={{ color:"#777" }}>{fmtB(ph.totalNetGex)}</span></span>
          <span style={{ color: isRealData ? "#4ade80" : "#facc15", fontSize:9, border:`1px solid ${isRealData?"#4ade80":"#facc15"}44`, borderRadius:3, padding:"1px 5px" }}>
            {isRealData ? "CBOE 15m" : "DEMO"}
          </span>
        </div>
      </div>

      {/* ── FORCE FIELD CANVAS + GAUGES ── */}
      <div style={{ display:"flex", height:440, flexShrink:0 }}>
        <ForceCanvas exposures={exposures} ticker={ticker} levels={levels} />

        {/* Gauges column */}
        <div style={{ width:200, background:"#020406", borderLeft:"1px solid #0e1420", padding:"12px 8px", display:"flex", flexDirection:"column", gap:6, flexShrink:0, overflowY:"auto" }}>
          <div style={{ color:"#a3e635", fontSize:9, letterSpacing:".15em", fontWeight:700, marginBottom:4 }}>MÉTRICAS FÍSICAS</div>
          <Gauge value={ph.totalNetGex} min={-gexRange}  max={gexRange}  label="Γ NET FORCE"  sublabel="gamma neta total" color={ph.totalNetGex>=0?"#22c55e":"#ef4444"} fmt={fmtB} />
          <Gauge value={ph.totalDex}    min={-dexRange}  max={dexRange}  label="Δ VELOCIDAD"  sublabel="delta exposure"   color="#e8963a" fmt={fmtB} />
          <Gauge value={ph.totalVex}    min={-vexRange}  max={vexRange}  label="ν FUERZA VOL" sublabel="vega exposure"    color="#7dd3fc" fmt={fmtM} />
          <Gauge value={ph.totalVanna}  min={-vannaRange} max={vannaRange} label="∂Δ/∂σ VANNA" sublabel="cross-force"    color="#c084fc" fmt={fmtM} />
          <div style={{ background:"#03050a", border:"1px solid #0e1420", borderRadius:6, padding:"8px 10px", marginTop:4 }}>
            <div style={{ color:"#1a2535", fontSize:8, letterSpacing:".12em", marginBottom:4 }}>PIN RISK</div>
            <div style={{ background:"#0a0f18", borderRadius:4, height:6, overflow:"hidden" }}>
              <div style={{ width:`${ph.pinRisk}%`, height:"100%", background: ph.pinRisk>70?"#facc15":ph.pinRisk>40?"#fb923c":"#22c55e",
                boxShadow: ph.pinRisk>70?"0 0 8px #facc15":"none", transition:"width .3s" }} />
            </div>
            <div style={{ color: ph.pinRisk>70?"#facc15":"#2a3545", fontSize:10, fontWeight:700, marginTop:4, textAlign:"right" }}>{ph.pinRisk.toFixed(0)}%</div>
          </div>
          <div style={{ background:"#03050a", border:"1px solid #0e1420", borderRadius:6, padding:"8px 10px" }}>
            <div style={{ color:"#1a2535", fontSize:8, letterSpacing:".12em", marginBottom:4 }}>ΓSQUEEZE</div>
            <div style={{ background:"#0a0f18", borderRadius:4, height:6, overflow:"hidden" }}>
              <div style={{ width:`${Math.min(ph.squeezeRisk,100)}%`, height:"100%",
                background: ph.squeezeRisk>75?"#ef4444":ph.squeezeRisk>40?"#fb923c":"#a3e635",
                boxShadow: ph.squeezeRisk>75?"0 0 8px #ef4444":"none", transition:"width .3s" }} />
            </div>
            <div style={{ color: ph.squeezeRisk>75?"#ef4444":"#2a3545", fontSize:10, fontWeight:700, marginTop:4, textAlign:"right" }}>{Math.min(ph.squeezeRisk,100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* ── KEY METRICS CARDS ── */}
      <div style={{ padding:"14px 16px", borderTop:"1px solid #0e1420", flexShrink:0 }}>
        <SecHead title="CAMPO DE FUERZAS" sub="análisis físico de exposición gamma" col="#a3e635" />
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <NCard label="FUERZA NETA EN SPOT" value={(ph.forceAtSpot >= 0 ? "+" : "") + (ph.forceAtSpot/1e6).toFixed(2) + "M"} sub={ph.forceDir} col={forceCol} glow />
          <NCard label="CALL WALL" value={"$" + levels.callWall.toFixed(0)} sub={"+" + ((levels.callWall/ticker.spot-1)*100).toFixed(1) + "% del spot"} col="#22c55e" />
          <NCard label="PUT WALL" value={"$" + levels.putWall.toFixed(0)} sub={(((levels.putWall/ticker.spot)-1)*100).toFixed(1) + "% del spot"} col="#ef4444" />
          <NCard label="ZERO GAMMA Δ0" value={"$" + (levels.gammaFlip ?? levels.volTrigger ?? 0).toFixed(0)} sub={ticker.spot > (levels.gammaFlip ?? 0) ? "precio SOBRE flip" : "precio BAJO flip"} col="#facc15" glow={Math.abs(ticker.spot - (levels.gammaFlip ?? ticker.spot)) < (ticker.strikeStep * 2)} />
          <NCard label="MAX GAMMA STRIKE" value={"$" + ph.maxGexStrike.strike.toFixed(0)} sub={"Γ " + fmtB(ph.maxGexStrike.netGex)} col="#c084fc" />
          <NCard label="C/P IMBALANCE" value={(ph.imbalance * 100).toFixed(1) + "%"} sub={ph.imbalance > 0 ? "sesgo CALL (dealer long)" : "sesgo PUT (presión bear)"} col={ph.imbalance > 0 ? "#22c55e" : "#ef4444"} />
        </div>
      </div>

      {/* ── LEYES DE NEWTON APLICADAS ── */}
      <div style={{ padding:"14px 16px", borderTop:"1px solid #0e1420", flexShrink:0 }}>
        <SecHead title="LEYES DE NEWTON — OPCIONES" sub="física cuántica del mercado" col="#7dd3fc" />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:8 }}>
          {[
            { law:"1ª LEY — INERCIA",     col:"#7dd3fc", eq:"F_net = 0  ⟹  ΔSpot ≈ 0", desc:`Con Γ=${fmtB(ph.totalNetGex)} en zona de alto gamma, el precio tiende a quedar ANCLADO al strike de mayor exposición ($${ph.maxGexStrike.strike}).`, icon:"⚖" },
            { law:"2ª LEY — ACELERACIÓN", col:"#a78bfa", eq:"a = F/m  ≡  dΔ/dt = Γ × dS", desc:`Gamma (aceleración): ${fmtB(ph.totalNetGex)}. Delta actual (velocidad): ${fmtB(ph.totalDex)}. ${ph.totalNetGex>0?"Dealers COMPRAN en caídas → amortigua movimientos":"Dealers VENDEN en caídas → AMPLIFICA movimientos"}.`, icon:"⚡" },
            { law:"3ª LEY — ACCIÓN/REACCIÓN", col:"#22c55e", eq:"F_call + F_put = F_net", desc:`Call GEX: ${fmtB(ph.totalCallGex)} ↑   Put GEX: ${fmtB(ph.totalPutGex)} ↓   Net: ${fmtB(ph.totalNetGex)}. ${ph.imbalance>0?"Presión alcista dominante — dealers absorben ventas":"Presión bajista — gamma amplifica caídas"}.`, icon:"🔄" },
          ].map(item => (
            <div key={item.law} style={{ background:"#020406", border:`1px solid ${item.col}22`, borderRadius:8, padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <span style={{ fontSize:18 }}>{item.icon}</span>
                <span style={{ color:item.col, fontSize:9, fontWeight:700, letterSpacing:".12em" }}>{item.law}</span>
              </div>
              <div style={{ color:"#0e1420", background:"#03050a", borderRadius:4, padding:"4px 8px", marginBottom:8, fontFamily:"monospace", fontSize:10, letterSpacing:".08em" }}>
                <span style={{ color:item.col }}>{item.eq}</span>
              </div>
              <div style={{ color:"#2a3848", fontSize:9.5, lineHeight:1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── GREEK LADDER FÍSICA ── */}
      {ph.nearSpot.length > 0 && (
        <div style={{ padding:"14px 16px", borderTop:"1px solid #0e1420", flexShrink:0 }}>
          <SecHead title="TABLA DE FUERZAS POR STRIKE" sub="±6% del spot" col="#facc15" />
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9.5 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #0e1420" }}>
                  {["Strike","Γ Net Force","Δ Velocidad","ν Vol Force","∂Δ/∂σ Vanna","∂Δ/∂t Charm","Dir"].map(h => (
                    <th key={h} style={{ padding:"4px 10px", color:"#1a2535", fontWeight:700, textAlign:"right", letterSpacing:".08em", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ph.nearSpot.sort((a,b)=>b.strike-a.strike).map(e => {
                  const isAtm = Math.abs(e.strike - ticker.spot) < (ticker.strikeStep||5)*0.7;
                  const dir = e.netGex > 0 ? "↑ BULL" : e.netGex < 0 ? "↓ BEAR" : "→";
                  const dirCol = e.netGex > 0 ? "#22c55e" : "#ef4444";
                  return (
                    <tr key={e.strike} style={{ borderBottom:"1px solid #070a10", background: isAtm ? "#0a0f00" : "transparent" }}>
                      <td style={{ padding:"3px 10px", color: isAtm?"#e8963a":"#2a3545", fontWeight: isAtm?700:400, textAlign:"right" }}>{isAtm?"▶ ":""}{e.strike}</td>
                      <td style={{ padding:"3px 10px", color: e.netGex>=0?"#22c55e":"#ef4444", textAlign:"right", fontWeight:700 }}>{fmtB(e.netGex)}</td>
                      <td style={{ padding:"3px 10px", color:"#e8963a", textAlign:"right" }}>{fmtB(e.dex)}</td>
                      <td style={{ padding:"3px 10px", color:"#7dd3fc", textAlign:"right" }}>{fmtM(e.vex)}</td>
                      <td style={{ padding:"3px 10px", color:"#c084fc", textAlign:"right" }}>{fmtM(e.vanna)}</td>
                      <td style={{ padding:"3px 10px", color:"#fb923c", textAlign:"right" }}>{fmtM(e.charm)}</td>
                      <td style={{ padding:"3px 10px", color:dirCol, textAlign:"right", fontWeight:700, fontSize:9 }}>{dir}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ padding:"6px 16px", borderTop:"1px solid #0e1420", fontSize:8, color:"#0e1420", textAlign:"right", flexShrink:0 }}>
        F(p) = Σ netGex_i / |p - K_i|² · sign  ·  Leyes de Newton aplicadas a opciones  ·  γ physics engine
      </div>
    </div>
  );
}

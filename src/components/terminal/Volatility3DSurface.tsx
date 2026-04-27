import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { IvPoint } from "@/lib/volatilityCalculations";

interface Props {
  surface?: IvPoint[];
  spot?: number;
  symbol?: string;
}

const SX = 4.4;
const SZ = 4.0;
const SY = 2.4;

// Rainbow colormap (full saturated)
function rainbow(t: number): THREE.Color {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.0, 0.0, 1.0]],
    [0.15, [0.0, 0.5, 1.0]],
    [0.3, [0.0, 1.0, 1.0]],
    [0.45, [0.0, 1.0, 0.4]],
    [0.58, [0.7, 1.0, 0.0]],
    [0.7, [1.0, 1.0, 0.0]],
    [0.82, [1.0, 0.5, 0.0]],
    [0.92, [1.0, 0.0, 0.0]],
    [1.0, [1.0, 0.0, 1.0]],
  ];
  for (let k = 0; k < stops.length - 1; k++) {
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return new THREE.Color(c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2]));
    }
  }
  return new THREE.Color(1, 0, 1);
}

/**
 * Build (strikes × expiries) IV grid from real IvPoint surface.
 * Returns the unique sorted axes plus the IV matrix [iStrike][jExpiry].
 */
function buildGrid(surface: IvPoint[]) {
  const strikes = Array.from(new Set(surface.map((p) => p.strike))).sort((a, b) => a - b);
  const expiries = Array.from(new Set(surface.map((p) => p.expiry))).sort((a, b) => a - b);
  const idxS = new Map(strikes.map((s, i) => [s, i] as const));
  const idxE = new Map(expiries.map((e, j) => [e, j] as const));
  const grid: number[][] = strikes.map(() => expiries.map(() => NaN));
  for (const p of surface) {
    const i = idxS.get(p.strike)!;
    const j = idxE.get(p.expiry)!;
    grid[i][j] = p.iv;
  }
  // Forward-fill NaN gaps along each row (rare, just safety)
  for (let i = 0; i < grid.length; i++) {
    let last = NaN;
    for (let j = 0; j < grid[i].length; j++) {
      if (Number.isFinite(grid[i][j])) last = grid[i][j];
      else if (Number.isFinite(last)) grid[i][j] = last;
    }
    let last2 = NaN;
    for (let j = grid[i].length - 1; j >= 0; j--) {
      if (Number.isFinite(grid[i][j])) last2 = grid[i][j];
      else if (Number.isFinite(last2)) grid[i][j] = last2;
    }
  }
  return { strikes, expiries, grid };
}

export function Volatility3DSurface({ surface, spot, symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elev, setElev] = useState(32);
  const [azim, setAzim] = useState(220);

  const elevRef = useRef(elev);
  const azimRef = useRef(azim);
  const distRef = useRef(7.5);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Build grid (real or synthetic peak/drop fallback)
  const { strikes, expiries, grid, ivMin, ivMax, atmIv, skew, peakStrike } = useMemo(() => {
    if (surface && surface.length > 0) {
      const g = buildGrid(surface);
      let mn = Infinity, mx = -Infinity;
      for (const row of g.grid) for (const v of row) { if (v < mn) mn = v; if (v > mx) mx = v; }
      const sp = spot ?? g.strikes[Math.floor(g.strikes.length / 2)];
      // ATM IV = average across expiries of the strike closest to spot
      const atmI = g.strikes.reduce((best, s, i) => Math.abs(s - sp) < Math.abs(g.strikes[best] - sp) ? i : best, 0);
      const atmRow = g.grid[atmI];
      const atm = atmRow.reduce((s, v) => s + v, 0) / atmRow.length;
      // Skew = avg IV at moneyness 0.90 minus avg IV at 1.10 (puts > calls → positive skew)
      const idxLow = g.strikes.reduce((best, s, i) => Math.abs(s - sp * 0.9) < Math.abs(g.strikes[best] - sp * 0.9) ? i : best, 0);
      const idxHi = g.strikes.reduce((best, s, i) => Math.abs(s - sp * 1.1) < Math.abs(g.strikes[best] - sp * 1.1) ? i : best, 0);
      const avg = (row: number[]) => row.reduce((s, v) => s + v, 0) / row.length;
      const sk = avg(g.grid[idxLow]) - avg(g.grid[idxHi]);
      // Peak strike
      let pk = g.strikes[0];
      let pkVal = -Infinity;
      for (let i = 0; i < g.grid.length; i++) {
        const m = Math.max(...g.grid[i]);
        if (m > pkVal) { pkVal = m; pk = g.strikes[i]; }
      }
      return { strikes: g.strikes, expiries: g.expiries, grid: g.grid, ivMin: mn, ivMax: mx, atmIv: atm, skew: sk, peakStrike: pk };
    }
    // Fallback synthetic surface (peak + drop) for when no data
    const N = 30;
    const strikes = Array.from({ length: N }, (_, i) => 100 + i * 5);
    const expiries = [1, 7, 14, 30, 60, 90];
    const grid: number[][] = strikes.map((_, i) => expiries.map((_, j) => {
      const u = i / (N - 1), v = j / (expiries.length - 1);
      const peak = 1.8 * Math.exp(-Math.pow((u - 0.85) * 3.5, 2) - Math.pow((v - 0.80) * 3.5, 2));
      const drop = -0.9 * Math.exp(-Math.pow((u - 0.05) * 4, 2)) * (1 - v * 0.5);
      const base = 0.25 + 0.3 * u + 0.2 * v - 0.15 * Math.pow(u - 0.5, 2);
      const wave = 0.06 * Math.sin(u * Math.PI * 2.5) * Math.cos(v * Math.PI * 1.8);
      return base + peak + drop + wave;
    }));
    let mn = Infinity, mx = -Infinity;
    for (const row of grid) for (const v of row) { if (v < mn) mn = v; if (v > mx) mx = v; }
    return { strikes, expiries, grid, ivMin: mn, ivMax: mx, atmIv: 0.18, skew: 0.04, peakStrike: strikes[Math.floor(N * 0.85)] };
  }, [surface, spot]);

  useEffect(() => { elevRef.current = elev; updateCam(); }, [elev]);
  useEffect(() => { azimRef.current = azim; updateCam(); }, [azim]);

  function updateCam() {
    const cam = cameraRef.current;
    if (!cam) return;
    const el = elevRef.current * Math.PI / 180;
    const az = azimRef.current * Math.PI / 180;
    const d = distRef.current;
    cam.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    cam.lookAt(0, 0.3, 0);
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    const W = container.clientWidth;
    const H = 460;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0a, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055);

    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 1000);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.1); dir1.position.set(6, 14, 6); scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x4488ff, 0.5); dir2.position.set(-6, 4, -4); scene.add(dir2);
    const dir3 = new THREE.DirectionalLight(0xff4400, 0.3); dir3.position.set(8, 2, 0); scene.add(dir3);

    const NX = strikes.length;
    const NZ = expiries.length;
    const verts: number[] = [], cols: number[] = [], idxs: number[] = [];
    const range = Math.max(1e-6, ivMax - ivMin);

    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) {
        const x = (i / Math.max(1, NX - 1) - 0.5) * SX;
        const z = (j / Math.max(1, NZ - 1) - 0.5) * SZ;
        const norm = (grid[i][j] - ivMin) / range;
        const y = norm * SY - 0.6;
        verts.push(x, y, z);
        const c = rainbow(norm);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NX - 1; i++) {
      for (let j = 0; j < NZ - 1; j++) {
        const a = i * NZ + j, b = i * NZ + j + 1, c = (i + 1) * NZ + j, d = (i + 1) * NZ + j + 1;
        idxs.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idxs);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true, side: THREE.DoubleSide,
      shininess: 80, specular: new THREE.Color(0.5, 0.5, 0.5),
    });
    scene.add(new THREE.Mesh(geo, mat));

    // White grid lines on top of mesh
    const lmat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.22, transparent: true });
    const stepI = Math.max(1, Math.floor(NX / 12));
    const stepJ = Math.max(1, Math.floor(NZ / 6));
    for (let j = 0; j < NZ; j += stepJ) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < NX; i++) {
        const idx = (i * NZ + j) * 3;
        pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2]));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lmat));
    }
    for (let i = 0; i < NX; i += stepI) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < NZ; j++) {
        const idx = (i * NZ + j) * 3;
        pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2]));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lmat));
    }

    // Floor grid + axes
    const grid3 = new THREE.GridHelper(5, 12, 0x222222, 0x1a1a1a);
    grid3.position.y = -0.65;
    scene.add(grid3);

    const axLine = (a: [number, number, number], b: [number, number, number], col: number, op = 0.6) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, opacity: op, transparent: true })));
    };
    axLine([-2.2, -0.65, -2.0], [2.4, -0.65, -2.0], 0x444444);
    axLine([-2.2, -0.65, -2.0], [-2.2, 2.0, -2.0], 0x444444);
    axLine([-2.2, -0.65, -2.0], [-2.2, -0.65, 2.2], 0x444444);

    updateCam();

    let drag = false, lx = 0, ly = 0;
    const onDown = (e: MouseEvent) => { drag = true; lx = e.clientX; ly = e.clientY; };
    const onUp = () => { drag = false; };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      azimRef.current -= (e.clientX - lx) * 0.45;
      elevRef.current = Math.max(5, Math.min(80, elevRef.current + (e.clientY - ly) * 0.35));
      lx = e.clientX; ly = e.clientY;
      setElev(Math.round(elevRef.current));
      setAzim(((Math.round(azimRef.current) % 360) + 360) % 360);
      updateCam();
    };
    const onWheel = (e: WheelEvent) => {
      distRef.current = Math.max(3.5, Math.min(15, distRef.current + e.deltaY * 0.012));
      e.preventDefault();
      updateCam();
    };

    let lt: Touch | null = null;
    const onTouchStart = (e: TouchEvent) => { lt = e.touches[0]; e.preventDefault(); };
    const onTouchMove = (e: TouchEvent) => {
      if (!lt) return;
      const t = e.touches[0];
      azimRef.current -= (t.clientX - lt.clientX) * 0.45;
      elevRef.current = Math.max(5, Math.min(80, elevRef.current + (t.clientY - lt.clientY) * 0.35));
      lt = t;
      setElev(Math.round(elevRef.current));
      setAzim(((Math.round(azimRef.current) % 360) + 360) % 360);
      updateCam();
      e.preventDefault();
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    const onResize = () => {
      const w = container.clientWidth;
      renderer.setSize(w, H);
      camera.aspect = w / H;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const animate = () => { raf = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strikes, expiries, grid, ivMin, ivMax]);

  const lowStrike = strikes[0];
  const highStrike = strikes[strikes.length - 1];
  const lowExp = expiries[0];
  const highExp = expiries[expiries.length - 1];

  return (
    <div ref={containerRef} className="w-full rounded-xl p-3 box-border" style={{ background: "#111" }}>
      {/* Header with live IV stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-widest text-primary">🛰️ GEXSATELIT · IV SURFACE</span>
          {symbol && <span className="text-[11px] font-mono text-foreground/70">{symbol}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px]">
          <Stat label="ATM IV" value={`${(atmIv * 100).toFixed(1)}%`} tone="primary" />
          <Stat label="IV MIN" value={`${(ivMin * 100).toFixed(1)}%`} />
          <Stat label="IV MAX" value={`${(ivMax * 100).toFixed(1)}%`} tone="warn" />
          <Stat label="SKEW" value={`${(skew * 100).toFixed(2)}%`} tone={skew >= 0 ? "put" : "call"} />
          <Stat label="PEAK K" value={`$${peakStrike}`} tone="call" />
        </div>
      </div>

      <canvas ref={canvasRef} style={{ width: "100%", height: 460, display: "block", borderRadius: 8 }} />

      <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
        <span className="text-[11px] font-mono text-muted-foreground">🖱 drag: rotar | scroll: zoom</span>
        <label className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
          Elev
          <input type="range" min={5} max={80} value={elev} onChange={(e) => setElev(+e.target.value)} className="w-20" />
          <span className="text-foreground/70">{elev}°</span>
        </label>
        <label className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
          Az
          <input type="range" min={0} max={360} value={azim} onChange={(e) => setAzim(+e.target.value)} className="w-20" />
          <span className="text-foreground/70">{azim}°</span>
        </label>
      </div>

      {/* Colormap legend */}
      <div className="flex justify-center mt-2 gap-0 items-center">
        <div
          style={{
            width: 220, height: 14,
            background: "linear-gradient(to right, #0000ff, #0088ff, #00ffff, #00ff88, #aaff00, #ffff00, #ff8800, #ff0000, #ff00ff)",
            borderRadius: 4, border: "1px solid #333",
          }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] mx-auto mt-0.5" style={{ width: 220, color: "#555" }}>
        <span>Low</span>
        <span style={{ marginLeft: 60 }}>Mid</span>
        <span>High Vol</span>
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-2 px-2">
        <span>Strike: ${lowStrike} → ${highStrike}</span>
        <span>Expiry: {lowExp}d → {highExp}d</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "primary" | "call" | "put" | "warn" }) {
  const c =
    tone === "primary" ? "text-primary"
    : tone === "call" ? "text-call"
    : tone === "put" ? "text-put"
    : tone === "warn" ? "text-warning"
    : "text-foreground/80";
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${c}`}>{value}</span>
    </span>
  );
}

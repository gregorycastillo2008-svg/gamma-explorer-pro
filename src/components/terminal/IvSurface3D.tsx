import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { IvCell } from "@/lib/gex";

interface Props {
  cells: IvCell[];
  spot?: number;
}

interface HoverInfo {
  x: number; y: number;
  strike: number;
  expiryDays: number;
  iv: number;
  delta: number;
  gamma: number;
}

// Approximation of the standard normal CDF (Abramowitz & Stegun)
function normCdf(x: number): number {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function bsGreeks(S: number, K: number, T: number, sigma: number) {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return { delta: 0, gamma: 0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const delta = normCdf(d1);
  const gamma = normPdf(d1) / (S * sigma * sqrtT);
  return { delta, gamma };
}

const rainbow = (t: number) => {
  const tt = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0.00, [0.00, 0.00, 1.00]],
    [0.15, [0.00, 0.50, 1.00]],
    [0.30, [0.00, 1.00, 1.00]],
    [0.45, [0.00, 1.00, 0.40]],
    [0.58, [0.70, 1.00, 0.00]],
    [0.70, [1.00, 1.00, 0.00]],
    [0.82, [1.00, 0.50, 0.00]],
    [0.92, [1.00, 0.00, 0.00]],
    [1.00, [1.00, 0.00, 1.00]],
  ];
  for (let k = 0; k < stops.length - 1; k++) {
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    if (tt >= t0 && tt <= t1) {
      const f = (tt - t0) / (t1 - t0);
      return new THREE.Color(c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2]));
    }
  }
  return new THREE.Color(1, 0, 1);
};

export function IvSurface3D({ cells, spot }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elevRef = useRef<HTMLInputElement>(null);
  const azimRef = useRef<HTMLInputElement>(null);
  const elevLblRef = useRef<HTMLSpanElement>(null);
  const azimLblRef = useRef<HTMLSpanElement>(null);

  const [showDataPts, setShowDataPts] = useState(true);
  const [showRefPlane, setShowRefPlane] = useState(true);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const { sortedStrikes, sortedExpiries, cellMap, ivMin, ivMax } = useMemo(() => {
    const strikesSet = new Set(cells.map((c) => c.strike));
    const expiriesSet = new Set(cells.map((c) => c.expiry));
    const sortedStrikes = Array.from(strikesSet).sort((a, b) => a - b);
    const sortedExpiries = Array.from(expiriesSet).sort((a, b) => a - b);
    const cellMap = new Map<string, number>();
    for (const c of cells) cellMap.set(`${c.strike}|${c.expiry}`, c.iv);
    const ivs = cells.map((c) => c.iv);
    const ivMin = ivs.length ? Math.min(...ivs) : 0.05;
    const ivMax = ivs.length ? Math.max(...ivs) : 0.8;
    return { sortedStrikes, sortedExpiries, cellMap, ivMin, ivMax };
  }, [cells]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const W = wrap.clientWidth - 24;
    const H = 420;
    canvas.width = W;
    canvas.height = H;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x060a10, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060a10, 0.048);

    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 1000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dir1.position.set(6, 14, 6);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x4488ff, 0.45);
    dir2.position.set(-6, 4, -4);
    scene.add(dir2);
    const dir3 = new THREE.DirectionalLight(0xff6600, 0.25);
    dir3.position.set(8, 2, 0);
    scene.add(dir3);

    const NX = sortedExpiries.length;
    const NZ = sortedStrikes.length;
    const SX = 4.4, SZ = 4.0, SY = 2.4;
    const range = ivMax - ivMin || 1;

    // Build normalised IV matrix with neighbour fill for gaps
    const norm: number[][] = [];
    for (let i = 0; i < NX; i++) {
      const row: number[] = [];
      for (let j = 0; j < NZ; j++) {
        const iv = cellMap.get(`${sortedStrikes[j]}|${sortedExpiries[i]}`);
        row.push(iv != null ? (iv - ivMin) / range : -1);
      }
      norm.push(row);
    }
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) {
        if (norm[i][j] < 0) {
          let s = 0, c = 0;
          for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
            const ni = i + di, nj = j + dj;
            if (ni >= 0 && ni < NX && nj >= 0 && nj < NZ && norm[ni][nj] >= 0) { s += norm[ni][nj]; c++; }
          }
          norm[i][j] = c > 0 ? s / c : 0.3;
        }
      }
    }

    // Surface geometry
    const geo = new THREE.BufferGeometry();
    const verts: number[] = [];
    const cols: number[] = [];
    const idxs: number[] = [];
    const Nu = Math.max(2, NX);
    const Nv = Math.max(2, NZ);

    for (let i = 0; i < Nu; i++) {
      for (let j = 0; j < Nv; j++) {
        const x = (i / (Nu - 1) - 0.5) * SX;
        const z = (j / (Nv - 1) - 0.5) * SZ;
        const n = norm[i][j];
        const y = n * SY - 0.6;
        verts.push(x, y, z);
        const c = rainbow(n);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < Nu - 1; i++) {
      for (let j = 0; j < Nv - 1; j++) {
        const a = i * Nv + j, b = i * Nv + j + 1;
        const c = (i + 1) * Nv + j, d = (i + 1) * Nv + j + 1;
        idxs.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idxs);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true, side: THREE.DoubleSide, shininess: 80,
      specular: new THREE.Color(0.5, 0.5, 0.5),
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Wireframe lines
    const lmat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.2, transparent: true });
    const wireStep = Math.max(1, Math.floor(Math.max(Nu, Nv) / 14));
    for (let j = 0; j < Nv; j += wireStep) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < Nu; i++) {
        const idx = (i * Nv + j) * 3;
        pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2]));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lmat));
    }
    for (let i = 0; i < Nu; i += wireStep) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < Nv; j++) {
        const idx = (i * Nv + j) * 3;
        pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2]));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lmat));
    }

    // Reference plane at mid IV
    let refPlane: THREE.Mesh | null = null;
    if (showRefPlane) {
      const planeGeo = new THREE.PlaneGeometry(SX * 1.05, SZ * 1.05);
      const planeMat = new THREE.MeshBasicMaterial({
        color: 0x6688ff, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
      });
      refPlane = new THREE.Mesh(planeGeo, planeMat);
      refPlane.rotation.x = -Math.PI / 2;
      refPlane.position.y = 0.5 * SY - 0.6;
      scene.add(refPlane);
    }

    // Data point spheres
    if (showDataPts) {
      const sphereGeo = new THREE.SphereGeometry(0.05, 10, 10);
      const sphereMat = new THREE.MeshPhongMaterial({ color: 0xff2222, emissive: 0x550000 });
      const step = Math.max(1, Math.floor(Math.max(Nu, Nv) / 8));
      for (let i = 0; i < Nu; i += step) {
        for (let j = 0; j < Nv; j += step) {
          const idx = (i * Nv + j) * 3;
          const m = new THREE.Mesh(sphereGeo, sphereMat);
          m.position.set(verts[idx], verts[idx + 1] + 0.04, verts[idx + 2]);
          scene.add(m);
        }
      }
    }

    // Floor grid
    const grid = new THREE.GridHelper(5, 12, 0x1a2a3a, 0x111f2a);
    grid.position.y = -0.65;
    scene.add(grid);

    // Axis lines
    const axLine = (a: [number, number, number], b: [number, number, number], col: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, opacity: 0.55, transparent: true })));
    };
    axLine([-2.2, -0.65, -2.0], [2.4, -0.65, -2.0], 0x334455);
    axLine([-2.2, -0.65, -2.0], [-2.2, 2.0, -2.0], 0x334455);
    axLine([-2.2, -0.65, -2.0], [-2.2, -0.65, 2.2], 0x334455);

    // Orbital camera state
    let elev = 32, azim = 220, dist = 7.5;
    let drag = false, lx = 0, ly = 0;

    const updateCam = () => {
      const el = (elev * Math.PI) / 180;
      const az = (azim * Math.PI) / 180;
      camera.position.set(
        dist * Math.cos(el) * Math.sin(az),
        dist * Math.sin(el),
        dist * Math.cos(el) * Math.cos(az),
      );
      camera.lookAt(0, 0.3, 0);
    };
    updateCam();

    const sync = () => {
      const e = Math.round(elev);
      const a = ((Math.round(azim) % 360) + 360) % 360;
      if (elevRef.current) elevRef.current.value = String(e);
      if (azimRef.current) azimRef.current.value = String(a);
      if (elevLblRef.current) elevLblRef.current.textContent = e + "°";
      if (azimLblRef.current) azimLblRef.current.textContent = a + "°";
    };
    sync();

    const onMouseDown = (e: MouseEvent) => { drag = true; lx = e.clientX; ly = e.clientY; };
    const onMouseUp = () => { drag = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (drag) {
        azim -= (e.clientX - lx) * 0.45;
        elev = Math.max(5, Math.min(80, elev + (e.clientY - ly) * 0.35));
        lx = e.clientX; ly = e.clientY;
        sync(); updateCam();
      }
    };
    const onWheel = (e: WheelEvent) => {
      dist = Math.max(3.5, Math.min(16, dist + e.deltaY * 0.012));
      e.preventDefault();
      updateCam();
    };
    let lt: Touch | null = null;
    const onTouchStart = (e: TouchEvent) => { lt = e.touches[0]; e.preventDefault(); };
    const onTouchMove = (e: TouchEvent) => {
      if (!lt) return;
      const t = e.touches[0];
      azim -= (t.clientX - lt.clientX) * 0.45;
      elev = Math.max(5, Math.min(80, elev + (t.clientY - lt.clientY) * 0.35));
      lt = t; sync(); updateCam();
      e.preventDefault();
    };

    // Raycaster hover — shows IV, Delta, Gamma
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onCanvasMove = (e: MouseEvent) => {
      if (drag) { setHover(null); return; }
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      ndc.x = (px / rect.width) * 2 - 1;
      ndc.y = -(py / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(mesh, false);
      if (!hits.length) { setHover(null); return; }
      const p = hits[0].point;
      const i = Math.round(((p.x / SX) + 0.5) * (Nu - 1));
      const j = Math.round(((p.z / SZ) + 0.5) * (Nv - 1));
      const ii = Math.max(0, Math.min(Nu - 1, i));
      const jj = Math.max(0, Math.min(Nv - 1, j));
      const strike = sortedStrikes[jj];
      const expiryDays = sortedExpiries[ii];
      const ivRaw = cellMap.get(`${strike}|${expiryDays}`);
      const iv = ivRaw != null ? ivRaw : norm[ii][jj] * range + ivMin;
      const T = Math.max(1 / 365, expiryDays / 365);
      const S = spot ?? strike;
      const { delta, gamma } = bsGreeks(S, strike, T, iv);
      setHover({ x: px, y: py, strike, expiryDays, iv, delta, gamma });
    };
    const onCanvasLeave = () => setHover(null);

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousemove", onCanvasMove);
    canvas.addEventListener("mouseleave", onCanvasLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    const onElevInput = () => {
      elev = +(elevRef.current?.value ?? "32");
      if (elevLblRef.current) elevLblRef.current.textContent = Math.round(elev) + "°";
      updateCam();
    };
    const onAzimInput = () => {
      azim = +(azimRef.current?.value ?? "220");
      if (azimLblRef.current) azimLblRef.current.textContent = Math.round(azim) + "°";
      updateCam();
    };
    elevRef.current?.addEventListener("input", onElevInput);
    azimRef.current?.addEventListener("input", onAzimInput);

    const onResize = () => {
      const w = wrap.clientWidth - 24;
      renderer.setSize(w, H);
      camera.aspect = w / H;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    let raf = 0;
    const animate = () => { raf = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel as EventListener);
      canvas.removeEventListener("touchstart", onTouchStart as EventListener);
      canvas.removeEventListener("touchmove", onTouchMove as EventListener);
      canvas.removeEventListener("mousemove", onCanvasMove);
      canvas.removeEventListener("mouseleave", onCanvasLeave);
      elevRef.current?.removeEventListener("input", onElevInput);
      azimRef.current?.removeEventListener("input", onAzimInput);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry?.dispose?.();
        const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm?.dispose?.();
      });
    };
  }, [sortedStrikes, sortedExpiries, cellMap, ivMin, ivMax, showDataPts, showRefPlane, spot]);

  if (cells.length < 4) {
    return (
      <div
        style={{ height: 420, background: "#060a10", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
        className="text-slate-500 text-sm font-mono"
      >
        Insufficient data — waiting for options chain
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", background: "#0a0e18", borderRadius: 12, padding: 12, boxSizing: "border-box", position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 420, display: "block", borderRadius: 8, cursor: "grab" }}
      />

      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(hover.x + 24, (wrapRef.current?.clientWidth ?? 600) - 210),
            top: Math.max(hover.y + 12, 12),
            background: "rgba(6,10,16,0.94)",
            border: "1px solid #1a2a3a",
            borderRadius: 8,
            padding: "8px 10px",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 11,
            color: "#e5e7eb",
            pointerEvents: "none",
            boxShadow: "0 6px 24px rgba(0,0,0,0.7)",
            zIndex: 20,
            minWidth: 175,
          }}
        >
          <div style={{ color: "#9ca3af", fontSize: 10, marginBottom: 4 }}>
            Strike <span style={{ color: "#fff", fontWeight: 700 }}>${hover.strike.toLocaleString()}</span>
            <span style={{ marginLeft: 8, color: "#9ca3af" }}>· {hover.expiryDays}d</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 2 }}>
            <span style={{ color: "#fbbf24" }}>IV</span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 700 }}>{(hover.iv * 100).toFixed(2)}%</span>
            <span style={{ color: "#22d3ee" }}>Δ Delta</span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 700 }}>{hover.delta.toFixed(4)}</span>
            <span style={{ color: "#a78bfa" }}>Γ Gamma</span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 700 }}>{hover.gamma.toFixed(6)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#6ecfdb", fontSize: 11, fontFamily: "monospace" }}>
          🖱 drag: rotar &nbsp;|&nbsp; scroll: zoom
        </span>
        <label style={{ color: "#6ecfdb", fontSize: 11, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 4 }}>
          Elev
          <input ref={elevRef} type="range" min={5} max={80} defaultValue={32} style={{ width: 80, verticalAlign: "middle", accentColor: "#22d3ee" }} />
          <span ref={elevLblRef} style={{ color: "#a0d8e8", minWidth: 28 }}>32°</span>
        </label>
        <label style={{ color: "#6ecfdb", fontSize: 11, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 4 }}>
          Az
          <input ref={azimRef} type="range" min={0} max={360} defaultValue={220} style={{ width: 80, verticalAlign: "middle", accentColor: "#22d3ee" }} />
          <span ref={azimLblRef} style={{ color: "#a0d8e8", minWidth: 28 }}>220°</span>
        </label>
        <label style={{ color: "#a0d8e8", fontSize: 11, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showDataPts} onChange={(e) => setShowDataPts(e.target.checked)} style={{ accentColor: "#22d3ee" }} />
          Data pts
        </label>
        <label style={{ color: "#a0d8e8", fontSize: 11, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showRefPlane} onChange={(e) => setShowRefPlane(e.target.checked)} style={{ accentColor: "#22d3ee" }} />
          Ref plane
        </label>
      </div>

      {/* Color bar */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 6, gap: 0, alignItems: "center" }}>
        <div style={{
          width: 240, height: 12,
          background: "linear-gradient(to right,#0000ff,#0088ff,#00ffff,#00ff88,#aaff00,#ffff00,#ff8800,#ff0000,#ff00ff)",
          borderRadius: 4, border: "1px solid #1a2a3a",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: 240, margin: "2px auto 0", fontSize: 10, color: "#4a7a8a", fontFamily: "monospace" }}>
        <span>Low IV</span>
        <span>Mid</span>
        <span>High IV</span>
      </div>
    </div>
  );
}

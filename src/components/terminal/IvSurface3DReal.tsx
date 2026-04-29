import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  strikes: number[];   // ordenados (cualquier dirección)
  expiries: number[];  // ordenados ascendente (en días)
  cellMap: Map<string, number>; // key: `${strike}|${expiry}` -> iv (0..1)
  min: number;
  max: number;
  spot?: number;       // precio spot para calcular griegos
}

interface HoverInfo {
  x: number; y: number;
  strike: number;
  expiryDays: number;
  iv: number;     // 0..1
  delta: number;  // call delta
  gamma: number;
}

// Aproximación de la CDF normal estándar (Abramowitz & Stegun)
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
// Black-Scholes call delta & gamma (r=0, q=0)
function bsGreeks(S: number, K: number, T: number, sigma: number) {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return { delta: 0, gamma: 0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const delta = normCdf(d1);
  const gamma = normPdf(d1) / (S * sigma * sqrtT);
  return { delta, gamma };
}

/**
 * 3D Surface real con three.js: rotar (drag), zoom (scroll),
 * sliders Elev/Az, malla wireframe, ejes y barra de color rainbow.
 * Usa los datos de IV reales (cellMap) en lugar de una superficie sintética.
 */
export function IvSurface3DReal({ strikes, expiries, cellMap, min, max, spot }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elevRef = useRef<HTMLInputElement>(null);
  const azimRef = useRef<HTMLInputElement>(null);
  const elevLblRef = useRef<HTMLSpanElement>(null);
  const azimLblRef = useRef<HTMLSpanElement>(null);

  const [showDataPts, setShowDataPts] = useState(true);
  const [showRefPlane, setShowRefPlane] = useState(true);

  // Aseguramos strikes ascendentes para construir la grilla
  const sortedStrikes = useMemo(() => strikes.slice().sort((a, b) => a - b), [strikes]);
  const sortedExpiries = useMemo(() => expiries.slice().sort((a, b) => a - b), [expiries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const W = wrap.clientWidth - 24;
    const H = 500;
    canvas.width = W;
    canvas.height = H;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0a, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055);

    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 1000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dir1.position.set(6, 14, 6);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x4488ff, 0.5);
    dir2.position.set(-6, 4, -4);
    scene.add(dir2);
    const dir3 = new THREE.DirectionalLight(0xff4400, 0.3);
    dir3.position.set(8, 2, 0);
    scene.add(dir3);

    const NX = sortedExpiries.length;
    const NZ = sortedStrikes.length;
    const SX = 4.4, SZ = 4.0, SY = 2.4;
    const range = max - min || 1;

    // Construimos la matriz de IV normalizada: usamos vecinos para huecos
    const norm: number[][] = [];
    for (let i = 0; i < NX; i++) {
      const row: number[] = [];
      for (let j = 0; j < NZ; j++) {
        const iv = cellMap.get(`${sortedStrikes[j]}|${sortedExpiries[i]}`);
        row.push(iv != null ? (iv - min) / range : -1);
      }
      norm.push(row);
    }
    // Rellenar huecos con promedio de vecinos
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

    // Geometría de la superficie
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
        const a = i * Nv + j;
        const b = i * Nv + j + 1;
        const c = (i + 1) * Nv + j;
        const d = (i + 1) * Nv + j + 1;
        idxs.push(a, c, b, b, c, d);
      }
    }

    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idxs);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 80,
      specular: new THREE.Color(0.5, 0.5, 0.5),
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Wireframe
    const lmat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.22, transparent: true });
    const wireStep = Math.max(1, Math.floor(Math.max(Nu, Nv) / 12));
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

    // Plano de referencia (z = mid)
    let refPlane: THREE.Mesh | null = null;
    if (showRefPlane) {
      const planeGeo = new THREE.PlaneGeometry(SX * 1.05, SZ * 1.05);
      const planeMat = new THREE.MeshBasicMaterial({
        color: 0x6688ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
      });
      refPlane = new THREE.Mesh(planeGeo, planeMat);
      refPlane.rotation.x = -Math.PI / 2;
      refPlane.position.y = 0.5 * SY - 0.6;
      scene.add(refPlane);
    }

    // Data points (esferas rojas) muestreados
    const dotsGroup = new THREE.Group();
    if (showDataPts) {
      const sphereGeo = new THREE.SphereGeometry(0.05, 10, 10);
      const sphereMat = new THREE.MeshPhongMaterial({ color: 0xff2222, emissive: 0x550000 });
      const step = Math.max(1, Math.floor(Math.max(Nu, Nv) / 8));
      for (let i = 0; i < Nu; i += step) {
        for (let j = 0; j < Nv; j += step) {
          const idx = (i * Nv + j) * 3;
          const m = new THREE.Mesh(sphereGeo, sphereMat);
          m.position.set(verts[idx], verts[idx + 1] + 0.04, verts[idx + 2]);
          dotsGroup.add(m);
        }
      }
      scene.add(dotsGroup);
    }

    // Suelo
    const grid = new THREE.GridHelper(5, 12, 0x222222, 0x1a1a1a);
    grid.position.y = -0.65;
    scene.add(grid);

    // Ejes
    const axLine = (a: [number, number, number], b: [number, number, number], col: number, op = 0.6) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, opacity: op, transparent: true })));
    };
    axLine([-2.2, -0.65, -2.0], [2.4, -0.65, -2.0], 0x444444);
    axLine([-2.2, -0.65, -2.0], [-2.2, 2.0, -2.0], 0x444444);
    axLine([-2.2, -0.65, -2.0], [-2.2, -0.65, 2.2], 0x444444);

    // Cámara orbital
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
      if (!drag) return;
      azim -= (e.clientX - lx) * 0.45;
      elev = Math.max(5, Math.min(80, elev + (e.clientY - ly) * 0.35));
      lx = e.clientX; ly = e.clientY;
      sync(); updateCam();
    };
    const onWheel = (e: WheelEvent) => {
      dist = Math.max(3.5, Math.min(15, dist + e.deltaY * 0.012));
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

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    const onElevInput = () => {
      const v = +(elevRef.current?.value ?? "32");
      elev = v;
      if (elevLblRef.current) elevLblRef.current.textContent = v + "°";
      updateCam();
    };
    const onAzimInput = () => {
      const v = +(azimRef.current?.value ?? "220");
      azim = v;
      if (azimLblRef.current) azimLblRef.current.textContent = v + "°";
      updateCam();
    };
    elevRef.current?.addEventListener("input", onElevInput);
    azimRef.current?.addEventListener("input", onAzimInput);

    // Resize
    const onResize = () => {
      const w = wrap.clientWidth - 24;
      renderer.setSize(w, H);
      camera.aspect = w / H;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
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
  }, [sortedStrikes, sortedExpiries, cellMap, min, max, showDataPts, showRefPlane]);

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", background: "#111", borderRadius: 12, padding: 12, boxSizing: "border-box" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 500, display: "block", borderRadius: 8 }}
      />
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#666", fontSize: 11, fontFamily: "monospace" }}>
          🖱 drag: rotar &nbsp;|&nbsp; scroll: zoom
        </span>
        <label style={{ color: "#777", fontSize: 11, fontFamily: "monospace" }}>
          Elev{" "}
          <input ref={elevRef} type="range" min={5} max={80} defaultValue={32} style={{ width: 80, verticalAlign: "middle" }} />{" "}
          <span ref={elevLblRef} style={{ color: "#aaa" }}>32°</span>
        </label>
        <label style={{ color: "#777", fontSize: 11, fontFamily: "monospace" }}>
          Az{" "}
          <input ref={azimRef} type="range" min={0} max={360} defaultValue={220} style={{ width: 80, verticalAlign: "middle" }} />{" "}
          <span ref={azimLblRef} style={{ color: "#aaa" }}>220°</span>
        </label>
        <label style={{ color: "#aaa", fontSize: 11, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showDataPts} onChange={(e) => setShowDataPts(e.target.checked)} />
          Data pts
        </label>
        <label style={{ color: "#aaa", fontSize: 11, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showRefPlane} onChange={(e) => setShowRefPlane(e.target.checked)} />
          Ref plane
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 8, gap: 0, alignItems: "center" }}>
        <div
          style={{
            width: 220, height: 14,
            background: "linear-gradient(to right, #0000ff, #0088ff, #00ffff, #00ff88, #aaff00, #ffff00, #ff8800, #ff0000, #ff00ff)",
            borderRadius: 4, border: "1px solid #333",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: 220, margin: "2px auto 0", fontSize: 10, color: "#555", fontFamily: "monospace" }}>
        <span>Low</span>
        <span style={{ marginLeft: 60 }}>Mid</span>
        <span>High Vol</span>
      </div>
    </div>
  );
}

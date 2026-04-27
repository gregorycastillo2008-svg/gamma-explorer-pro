import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { IvPoint } from "@/lib/volatilityCalculations";
import { Surface3DTooltip, type TooltipData } from "./Surface3DTooltip";

interface Props {
  surface?: IvPoint[];
  spot?: number;
  symbol?: string;
}

const SX = 4.4;
const SZ = 4.0;
const SY = 2.4;
const N = 50;

// Synthetic surface domain for tooltip back-mapping
const STRIKE_LO = 0.85; // moneyness
const STRIKE_HI = 1.15;
const DTE_LO = 1;
const DTE_HI = 60;

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

function surfaceFn(u: number, v: number) {
  const peak = 1.8 * Math.exp(-Math.pow((u - 0.85) * 3.5, 2) - Math.pow((v - 0.80) * 3.5, 2));
  const drop = -0.9 * Math.exp(-Math.pow((u - 0.05) * 4, 2)) * (1 - v * 0.5);
  const base = 0.25 + 0.3 * u + 0.2 * v - 0.15 * Math.pow(u - 0.5, 2);
  const wave = 0.06 * Math.sin(u * Math.PI * 2.5) * Math.cos(v * Math.PI * 1.8);
  return base + peak + drop + wave;
}

export function Volatility3DSurface({ spot = 100, symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elev, setElev] = useState(32);
  const [azim, setAzim] = useState(220);
  const [tip, setTip] = useState<TooltipData | null>(null);

  const elevRef = useRef(32);
  const azimRef = useRef(220);
  const distRef = useRef(7.5);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  function updateCam() {
    const cam = cameraRef.current;
    if (!cam) return;
    const el = elevRef.current * Math.PI / 180;
    const az = azimRef.current * Math.PI / 180;
    const d = distRef.current;
    cam.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    cam.lookAt(0, 0.3, 0);
  }

  useEffect(() => { elevRef.current = elev; updateCam(); }, [elev]);
  useEffect(() => { azimRef.current = azim; updateCam(); }, [azim]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    const W = container.clientWidth - 24;
    const H = 500;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0a, 1);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055);

    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 1000);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.1); dir1.position.set(6, 14, 6); scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x4488ff, 0.5); dir2.position.set(-6, 4, -4); scene.add(dir2);
    const dir3 = new THREE.DirectionalLight(0xff4400, 0.3); dir3.position.set(8, 2, 0); scene.add(dir3);

    let mn = Infinity, mx = -Infinity;
    const raw: number[][] = [];
    for (let i = 0; i < N; i++) {
      raw.push([]);
      for (let j = 0; j < N; j++) {
        const v = surfaceFn(i / (N - 1), j / (N - 1));
        raw[i].push(v);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }

    const verts: number[] = [], cols: number[] = [], idxs: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = (i / (N - 1) - 0.5) * SX;
        const z = (j / (N - 1) - 0.5) * SZ;
        const norm = (raw[i][j] - mn) / (mx - mn);
        const y = norm * SY - 0.6;
        verts.push(x, y, z);
        const c = rainbow(norm);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const a = i * N + j, b = i * N + j + 1, c = (i + 1) * N + j, d = (i + 1) * N + j + 1;
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
    const surfaceMesh = new THREE.Mesh(geo, mat);
    scene.add(surfaceMesh);
    meshRef.current = surfaceMesh;

    // Hover marker (glowing sphere)
    const markerGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.95 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.visible = false;
    scene.add(marker);
    const glowGeo = new THREE.SphereGeometry(0.13, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.25 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    marker.add(glow);
    markerRef.current = marker;

    const lmat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.22, transparent: true });
    for (let j = 0; j < N; j += 4) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i++) { const idx = (i * N + j) * 3; pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2])); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lmat));
    }
    for (let i = 0; i < N; i += 4) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < N; j++) { const idx = (i * N + j) * 3; pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2])); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lmat));
    }

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
      elevRef.current = Math.max(-89, Math.min(89, elevRef.current + (e.clientY - ly) * 0.35));
      lx = e.clientX; ly = e.clientY;
      setElev(Math.round(elevRef.current));
      setAzim(((Math.round(azimRef.current) % 360) + 360) % 360);
      updateCam();
    };
    const onWheel = (e: WheelEvent) => {
      distRef.current = Math.max(0.5, Math.min(80, distRef.current + e.deltaY * 0.02));
      e.preventDefault();
      updateCam();
    };

    let lt: Touch | null = null;
    const onTouchStart = (e: TouchEvent) => { lt = e.touches[0]; e.preventDefault(); };
    const onTouchMove = (e: TouchEvent) => {
      if (!lt) return;
      const t = e.touches[0];
      azimRef.current -= (t.clientX - lt.clientX) * 0.45;
      elevRef.current = Math.max(-89, Math.min(89, elevRef.current + (t.clientY - lt.clientY) * 0.35));
      lt = t;
      setElev(Math.round(elevRef.current));
      setAzim(((Math.round(azimRef.current) % 360) + 360) % 360);
      updateCam();
      e.preventDefault();
    };

    // Raycaster hover for tooltip
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let lastHover = 0;
    const onHover = (e: MouseEvent) => {
      if (drag) return;
      const now = performance.now();
      if (now - lastHover < 16) return;
      lastHover = now;
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(surfaceMesh);
      if (hits.length > 0) {
        const pt = hits[0].point;
        marker.visible = true;
        marker.position.copy(pt);
        // Map x∈[-SX/2,SX/2] → moneyness, z∈[-SZ/2,SZ/2] → DTE
        const u = (pt.x / SX) + 0.5;
        const v = (pt.z / SZ) + 0.5;
        const moneyness = STRIKE_LO + u * (STRIKE_HI - STRIKE_LO);
        const dte = Math.round(DTE_LO + v * (DTE_HI - DTE_LO));
        const strike = Math.round(spot * moneyness);
        // Recover IV from y: y = norm*SY - 0.6, norm∈[0,1] mapped to actual IV range
        const norm = Math.max(0, Math.min(1, (pt.y + 0.6) / SY));
        const iv = 0.10 + norm * 0.40; // synthetic 10%-50%
        setTip({
          strike,
          moneyness: moneyness * 100,
          dte,
          value: iv,
          iv,
          position: { x: e.clientX, y: e.clientY },
        });
      } else {
        marker.visible = false;
        setTip(null);
      }
    };
    const onLeave = () => { marker.visible = false; setTip(null); };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousemove", onHover);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    const onResize = () => {
      const w = container.clientWidth - 24;
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
      canvas.removeEventListener("mousemove", onHover);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", background: "#111", borderRadius: 12, padding: 12, boxSizing: "border-box" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: 500, display: "block", borderRadius: 8 }} />

      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#666", fontSize: 11, fontFamily: "monospace" }}>🖱 drag: rotar &nbsp;|&nbsp; scroll: zoom</span>
        <label style={{ color: "#777", fontSize: 11, fontFamily: "monospace" }}>
          Elev <input type="range" min={-89} max={89} value={elev} onChange={(e) => setElev(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} /> <span style={{ color: "#aaa" }}>{elev}°</span>
        </label>
        <label style={{ color: "#777", fontSize: 11, fontFamily: "monospace" }}>
          Az <input type="range" min={0} max={360} value={azim} onChange={(e) => setAzim(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} /> <span style={{ color: "#aaa" }}>{azim}°</span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 8, gap: 0, alignItems: "center" }}>
        <div style={{ width: 220, height: 14, background: "linear-gradient(to right, #0000ff, #0088ff, #00ffff, #00ff88, #aaff00, #ffff00, #ff8800, #ff0000, #ff00ff)", borderRadius: 4, border: "1px solid #333" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: 220, margin: "2px auto 0", fontSize: 10, color: "#555", fontFamily: "monospace" }}>
        <span>Low</span><span style={{ marginLeft: 60 }}>Mid</span><span>High Vol</span>
      </div>
    </div>
  );
}

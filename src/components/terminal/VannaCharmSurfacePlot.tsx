import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const N = 60;
const RANGE = 70;
const SX = 5.0;
const SZ = 5.0;
const SY = 3.2;

function zFn(x: number, y: number) {
  const peak = 90 * Math.exp(-(Math.pow(x - 18, 2) + Math.pow(y - 10, 2)) / 320);
  const hill2 = 18 * Math.exp(-(Math.pow(x + 30, 2) + Math.pow(y + 25, 2)) / 600);
  const base = 3 * Math.sin(x * 0.04) * Math.cos(y * 0.035) + 1.5;
  const slope = 0.02 * (x + RANGE) * 0.3;
  return peak + hill2 + base + slope;
}

function matlabColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.18, 0.0, 0.42]],
    [0.08, [0.1, 0.05, 0.65]],
    [0.18, [0.08, 0.25, 0.85]],
    [0.3, [0.05, 0.55, 0.9]],
    [0.42, [0.1, 0.78, 0.82]],
    [0.55, [0.2, 0.85, 0.65]],
    [0.65, [0.45, 0.9, 0.45]],
    [0.75, [0.78, 0.95, 0.2]],
    [0.85, [1.0, 0.95, 0.1]],
    [0.93, [1.0, 0.72, 0.05]],
    [1.0, [1.0, 0.55, 0.0]],
  ];
  for (let k = 0; k < stops.length - 1; k++) {
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2])];
    }
  }
  return [1, 0.55, 0];
}

export function VannaCharmSurfacePlot() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elev, setElev] = useState(28);
  const [azim, setAzim] = useState(215);
  const [showPts, setShowPts] = useState(true);
  const [showPlane, setShowPlane] = useState(true);

  const elevRef = useRef(28);
  const azimRef = useRef(215);
  const distRef = useRef(8.0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const dotsGroupRef = useRef<THREE.Group | null>(null);
  const planeGroupRef = useRef<THREE.Group | null>(null);

  function updateCam() {
    const cam = cameraRef.current;
    if (!cam) return;
    const el = elevRef.current * Math.PI / 180;
    const az = azimRef.current * Math.PI / 180;
    const d = distRef.current;
    cam.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    cam.lookAt(0, 0.6, 0);
  }

  useEffect(() => { elevRef.current = elev; updateCam(); }, [elev]);
  useEffect(() => { azimRef.current = azim; updateCam(); }, [azim]);
  useEffect(() => { if (dotsGroupRef.current) dotsGroupRef.current.visible = showPts; }, [showPts]);
  useEffect(() => { if (planeGroupRef.current) planeGroupRef.current.visible = showPlane; }, [showPlane]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    const W = container.clientWidth - 2;
    const H = 520;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 1000);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(8, 16, 10); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.45); fill.position.set(-8, 6, -6); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffeedd, 0.35); rim.position.set(0, -4, 12); scene.add(rim);

    let mn = Infinity, mx = -Infinity;
    const raw: number[][] = [];
    for (let i = 0; i < N; i++) {
      raw.push([]);
      for (let j = 0; j < N; j++) {
        const x = -RANGE + i * (2 * RANGE / (N - 1));
        const y = -RANGE + j * (2 * RANGE / (N - 1));
        const v = zFn(x, y);
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
        const y = norm * SY - 0.3;
        verts.push(x, y, z);
        const [r, g, b] = matlabColor(norm);
        cols.push(r, g, b);
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
      shininess: 120, specular: new THREE.Color(0.6, 0.6, 0.6),
    });
    scene.add(new THREE.Mesh(geo, mat));

    // Mesh grid lines (lighter color over black bg)
    const glmat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.18, transparent: true });
    const step = 3;
    for (let j = 0; j < N; j += step) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i++) { const k = (i * N + j) * 3; pts.push(new THREE.Vector3(verts[k], verts[k + 1], verts[k + 2])); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), glmat));
    }
    for (let i = 0; i < N; i += step) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < N; j++) { const k = (i * N + j) * 3; pts.push(new THREE.Vector3(verts[k], verts[k + 1], verts[k + 2])); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), glmat));
    }

    // Floor plane
    const floorGeo = new THREE.PlaneGeometry(SX, SZ, 12, 12);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshPhongMaterial({
      color: 0x22115a, side: THREE.DoubleSide, shininess: 10, transparent: true, opacity: 0.92,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.31;
    scene.add(floor);

    const fgmat = new THREE.LineBasicMaterial({ color: 0x4433aa, opacity: 0.5, transparent: true });
    for (let k = -5; k <= 5; k++) {
      const f = k / 10;
      const p1 = [new THREE.Vector3(f * SX, -0.30, -SZ / 2), new THREE.Vector3(f * SX, -0.30, SZ / 2)];
      const p2 = [new THREE.Vector3(-SX / 2, -0.30, f * SZ), new THREE.Vector3(SX / 2, -0.30, f * SZ)];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p1), fgmat));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p2), fgmat));
    }

    const axLine = (a: [number, number, number], b: [number, number, number]) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xaaaaaa, opacity: 0.7, transparent: true })));
    };
    const bY = -0.30;
    axLine([-2.6, bY, -2.5], [2.7, bY, -2.5]);
    axLine([-2.6, bY, -2.5], [-2.6, 3.2, -2.5]);
    axLine([-2.6, bY, -2.5], [-2.6, bY, 2.6]);
    for (let t = -2; t <= 2; t += 1) {
      axLine([t * 1.1, bY, -2.5], [t * 1.1, bY - 0.05, -2.5]);
      axLine([-2.6, bY, t * 1.1], [-2.65, bY, t * 1.1]);
      if (t >= 0) axLine([-2.6, t * 0.8, -2.5], [-2.65, t * 0.8, -2.5]);
    }

    const makeLabel = (text: string, color = "#cccccc", sz = 24) => {
      const cv = document.createElement("canvas");
      cv.width = 200; cv.height = 56;
      const ctx = cv.getContext("2d")!;
      ctx.font = `bold ${sz}px Arial`;
      ctx.fillStyle = color;
      ctx.fillText(text, 4, 40);
      const tex = new THREE.CanvasTexture(cv);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      return sp;
    };

    const lx = makeLabel("X-axis", "#cccccc"); lx.position.set(2.9, bY - 0.18, -2.5); lx.scale.set(1.1, 0.3, 1); scene.add(lx);
    const ly = makeLabel("Y-axis", "#cccccc"); ly.position.set(-2.6, bY - 0.18, 2.8); ly.scale.set(1.1, 0.3, 1); scene.add(ly);
    const lz = makeLabel("Z-axis", "#cccccc"); lz.position.set(-3.1, 1.6, -2.5); lz.scale.set(1.0, 0.28, 1); scene.add(lz);

    [0, 20, 40, 60, 80].forEach((v) => {
      const t = (v - mn) / (mx - mn);
      const yp = t * SY - 0.3;
      const lbl = makeLabel(`${v}`, "#aaaaaa", 20);
      lbl.position.set(-3.0, yp, -2.5); lbl.scale.set(0.55, 0.22, 1); scene.add(lbl);
    });
    [-50, 0, 50].forEach((v) => {
      const t = (v + RANGE) / (2 * RANGE);
      const lbl1 = makeLabel(`${v}`, "#aaaaaa", 20); lbl1.position.set(t * SX - SX / 2, bY - 0.14, -2.7); lbl1.scale.set(0.5, 0.2, 1); scene.add(lbl1);
      const lbl2 = makeLabel(`${v}`, "#aaaaaa", 20); lbl2.position.set(-2.8, bY - 0.14, t * SZ - SZ / 2); lbl2.scale.set(0.5, 0.2, 1); scene.add(lbl2);
    });

    // Red dots
    const dotGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const dotMat = new THREE.MeshPhongMaterial({ color: 0xff2200, shininess: 80, specular: new THREE.Color(1, 0.6, 0.6) });
    const dotsGroup = new THREE.Group();
    dotsGroupRef.current = dotsGroup;
    const rng = (a: number, b: number) => a + Math.random() * (b - a);
    for (let d = 0; d < 52; d++) {
      const rx = rng(-RANGE, RANGE), ry = rng(-RANGE, RANGE);
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set((rx / RANGE) * SX / 2, bY + 0.045, (ry / RANGE) * SZ / 2);
      dotsGroup.add(dot);
    }
    for (let d = 0; d < 10; d++) {
      const rx = rng(-RANGE + 10, RANGE - 10), ry = rng(-RANGE + 10, RANGE - 10);
      const zv = zFn(rx, ry);
      const norm = (zv - mn) / (mx - mn);
      const yTop = norm * SY - 0.3;
      const xp = (rx / RANGE) * SX / 2, zp = (ry / RANGE) * SZ / 2;
      const dg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xp, bY + 0.04, zp), new THREE.Vector3(xp, yTop, zp)]);
      dotsGroup.add(new THREE.Line(dg, new THREE.LineBasicMaterial({ color: 0xdd1100, opacity: 0.4, transparent: true })));
      const dot2 = new THREE.Mesh(dotGeo, dotMat);
      dot2.position.set(xp, yTop, zp);
      dotsGroup.add(dot2);
    }
    scene.add(dotsGroup);

    updateCam();

    let drag = false, lx2 = 0, ly2 = 0;
    const onDown = (e: MouseEvent) => { drag = true; lx2 = e.clientX; ly2 = e.clientY; };
    const onUp = () => { drag = false; };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      azimRef.current -= (e.clientX - lx2) * 0.42;
      elevRef.current = Math.max(-89, Math.min(89, elevRef.current + (e.clientY - ly2) * 0.32));
      lx2 = e.clientX; ly2 = e.clientY;
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
      azimRef.current -= (t.clientX - lt.clientX) * 0.42;
      elevRef.current = Math.max(-89, Math.min(89, elevRef.current + (t.clientY - lt.clientY) * 0.32));
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
      const w = container.clientWidth - 2;
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
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", background: "#000000", borderRadius: 10, padding: 10, boxSizing: "border-box", fontFamily: "Arial, sans-serif" }}>
      <div style={{ textAlign: "center", fontSize: 14, fontWeight: "bold", color: "#ffffff", marginBottom: 4, letterSpacing: 0.5 }}>
        Vanna-Charm Surface Plot
      </div>
      <div style={{ position: "relative", width: "100%", height: 520 }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: 520, display: "block", borderRadius: 6, border: "1px solid #222" }} />
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "center", marginTop: 8 }}>
        <span style={{ color: "#888", fontSize: 11 }}>🖱 drag: rotar &nbsp;|&nbsp; scroll: zoom</span>
        <label style={{ color: "#aaa", fontSize: 11 }}>
          Elev <input type="range" min={-89} max={89} value={elev} onChange={(e) => setElev(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} /> <span style={{ color: "#ddd" }}>{elev}°</span>
        </label>
        <label style={{ color: "#aaa", fontSize: 11 }}>
          Az <input type="range" min={0} max={360} value={azim} onChange={(e) => setAzim(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} /> <span style={{ color: "#ddd" }}>{azim}°</span>
        </label>
        <label style={{ color: "#aaa", fontSize: 11 }}>
          <input type="checkbox" checked={showPts} onChange={(e) => setShowPts(e.target.checked)} style={{ verticalAlign: "middle" }} /> Data pts
        </label>
      </div>
    </div>
  );
}

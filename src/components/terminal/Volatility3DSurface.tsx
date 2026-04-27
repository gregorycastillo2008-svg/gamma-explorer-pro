import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Volatility 3D Surface — peak/drop colored mesh.
 * Adaptado del HTML provisto por el usuario (GEXSATELIT).
 */
export function Volatility3DSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [elev, setElev] = useState(32);
  const [azim, setAzim] = useState(220);

  // refs internos para no recrear escena
  const stateRef = useRef<{
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    elev: number;
    azim: number;
    dist: number;
  }>({ elev: 32, azim: 220, dist: 7.5 });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    let W = wrap.clientWidth - 24;
    const H = 500;
    canvas.width = W; canvas.height = H;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0a, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055);
    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 1000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.1); dir1.position.set(6, 14, 6); scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x4488ff, 0.5); dir2.position.set(-6, 4, -4); scene.add(dir2);
    const dir3 = new THREE.DirectionalLight(0xff4400, 0.3); dir3.position.set(8, 2, 0); scene.add(dir3);

    const N = 50, SX = 4.4, SZ = 4.0, SY = 2.4;

    const surface = (u: number, v: number) => {
      const peak = 1.8 * Math.exp(-Math.pow((u - 0.85) * 3.5, 2) - Math.pow((v - 0.80) * 3.5, 2));
      const drop = -0.9 * Math.exp(-Math.pow((u - 0.05) * 4, 2)) * (1 - v * 0.5);
      const base = 0.25 + 0.3 * u + 0.2 * v - 0.15 * Math.pow(u - 0.5, 2);
      const wave = 0.06 * Math.sin(u * Math.PI * 2.5) * Math.cos(v * Math.PI * 1.8);
      return base + peak + drop + wave;
    };

    let mn = Infinity, mx = -Infinity;
    const raw: number[][] = [];
    for (let i = 0; i < N; i++) {
      raw.push([]);
      for (let j = 0; j < N; j++) {
        const v = surface(i / (N - 1), j / (N - 1));
        raw[i].push(v);
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
    }

    const rainbow = (t: number) => {
      t = Math.max(0, Math.min(1, t));
      const stops: Array<[number, [number, number, number]]> = [
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
        const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
        if (t >= t0 && t <= t1) {
          const f = (t - t0) / (t1 - t0);
          return new THREE.Color(c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2]));
        }
      }
      return new THREE.Color(1, 0, 1);
    };

    const geo = new THREE.BufferGeometry();
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
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) {
      const a = i * N + j, b = i * N + j + 1, c = (i + 1) * N + j, d = (i + 1) * N + j + 1;
      idxs.push(a, c, b, b, c, d);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idxs);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true, side: THREE.DoubleSide,
      shininess: 80,
      specular: new THREE.Color(0.5, 0.5, 0.5),
    });
    scene.add(new THREE.Mesh(geo, mat));

    // Grid overlay
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

    const grid = new THREE.GridHelper(5, 12, 0x222222, 0x1a1a1a);
    grid.position.y = -0.65;
    scene.add(grid);

    const axLine = (a: number[], b: number[], col: number, op = 0.6) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...(a as [number, number, number])), new THREE.Vector3(...(b as [number, number, number]))]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, opacity: op, transparent: true })));
    };
    axLine([-2.2, -0.65, -2.0], [2.4, -0.65, -2.0], 0x444444);
    axLine([-2.2, -0.65, -2.0], [-2.2, 2.0, -2.0], 0x444444);
    axLine([-2.2, -0.65, -2.0], [-2.2, -0.65, 2.2], 0x444444);

    const st = stateRef.current;
    st.camera = camera;
    st.renderer = renderer;

    const updateCam = () => {
      const el = st.elev * Math.PI / 180, az = st.azim * Math.PI / 180;
      camera.position.set(
        st.dist * Math.cos(el) * Math.sin(az),
        st.dist * Math.sin(el),
        st.dist * Math.cos(el) * Math.cos(az),
      );
      camera.lookAt(0, 0.3, 0);
    };
    updateCam();

    let drag = false, lx = 0, ly = 0;
    const onDown = (e: MouseEvent) => { drag = true; lx = e.clientX; ly = e.clientY; };
    const onUp = () => { drag = false; };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      st.azim -= (e.clientX - lx) * 0.45;
      st.elev = Math.max(5, Math.min(80, st.elev + (e.clientY - ly) * 0.35));
      lx = e.clientX; ly = e.clientY;
      setElev(Math.round(st.elev));
      setAzim(((Math.round(st.azim) % 360) + 360) % 360);
      updateCam();
    };
    const onWheel = (e: WheelEvent) => {
      st.dist = Math.max(3.5, Math.min(15, st.dist + e.deltaY * 0.012));
      e.preventDefault();
      updateCam();
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    const animate = () => { raf = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    const onResize = () => {
      W = wrap.clientWidth - 24;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("wheel", onWheel as any);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
    };
  }, []);

  // sliders externos → mover cámara
  useEffect(() => {
    const st = stateRef.current;
    st.elev = elev; st.azim = azim;
    if (st.camera) {
      const el = elev * Math.PI / 180, az = azim * Math.PI / 180;
      st.camera.position.set(
        st.dist * Math.cos(el) * Math.sin(az),
        st.dist * Math.sin(el),
        st.dist * Math.cos(el) * Math.cos(az),
      );
      st.camera.lookAt(0, 0.3, 0);
    }
  }, [elev, azim]);

  return (
    <div ref={wrapRef} style={{ width: "100%", background: "#111", borderRadius: 12, padding: 12, boxSizing: "border-box" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: 500, display: "block", borderRadius: 8 }} />
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#666", fontSize: 11, fontFamily: "monospace" }}>🛰️ GEXSATELIT · drag: rotar | scroll: zoom</span>
        <label style={{ color: "#777", fontSize: 11, fontFamily: "monospace" }}>
          Elev <input type="range" min={5} max={80} value={elev} onChange={(e) => setElev(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} />
          <span style={{ color: "#aaa" }}> {elev}°</span>
        </label>
        <label style={{ color: "#777", fontSize: 11, fontFamily: "monospace" }}>
          Az <input type="range" min={0} max={360} value={azim} onChange={(e) => setAzim(+e.target.value)} style={{ width: 80, verticalAlign: "middle" }} />
          <span style={{ color: "#aaa" }}> {azim}°</span>
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <div style={{ width: 220, height: 14, background: "linear-gradient(to right, #0000ff, #0088ff, #00ffff, #00ff88, #aaff00, #ffff00, #ff8800, #ff0000, #ff00ff)", borderRadius: 4, border: "1px solid #333" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: 220, margin: "2px auto 0", fontSize: 10, color: "#555", fontFamily: "monospace" }}>
        <span>Low</span><span style={{ marginLeft: 60 }}>Mid</span><span>High Vol</span>
      </div>
    </div>
  );
}

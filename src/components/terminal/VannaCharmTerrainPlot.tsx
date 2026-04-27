import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const N = 90;
const SX = 5.6;
const SZ = 5.6;
const SY = 3.4;

// Perlin noise
const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,
  23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,
  174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,
  133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,
  89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,
  202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,
  248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,
  178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,
  14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,
  93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
const perm = new Uint8Array(512);
for (let i = 0; i < 256; i++) { perm[i] = p[i]; perm[i + 256] = p[i]; }

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + t * (b - a);
const grad = (h: number, x: number, y: number) => {
  const v = h & 3;
  const u = v < 2 ? x : y;
  const w = v < 2 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -w : w);
};
function noise2d(x: number, y: number) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const a = perm[X] + Y, b = perm[X + 1] + Y;
  return lerp(
    lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
    lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
    v,
  );
}
function fbm(x: number, y: number, oct: number, lac: number, gain: number) {
  let v = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < oct; i++) { v += noise2d(x * freq, y * freq) * amp; max += amp; amp *= gain; freq *= lac; }
  return v / max;
}

function terrain(u: number, v: number) {
  const x = u * 7.0 + 1.3;
  const y = v * 7.0 + 1.3;
  const base = fbm(x * 0.28, y * 0.28, 5, 2.1, 0.52) * 0.55 + 0.5;
  const rough = fbm(x * 1.1, y * 1.1, 4, 2.0, 0.45) * 0.12;
  const pit1 = -0.55 * Math.pow(Math.max(0, 1 - Math.sqrt(Math.pow((u - 0.35) * 6, 2) + Math.pow((v - 0.22) * 6, 2))), 2.5);
  const pit2 = -0.72 * Math.pow(Math.max(0, 1 - Math.sqrt(Math.pow((u - 0.62) * 5.5, 2) + Math.pow((v - 0.75) * 5.5, 2))), 2.5);
  const pit3 = -0.42 * Math.pow(Math.max(0, 1 - Math.sqrt(Math.pow((u - 0.80) * 7, 2) + Math.pow((v - 0.55) * 7, 2))), 2.5);
  const spike = 0.38 * Math.pow(Math.max(0, 1 - Math.sqrt(Math.pow((u - 0.22) * 30, 2) + Math.pow((v - 0.14) * 30, 2))), 3.0);
  return base + rough + pit1 + pit2 + pit3 + spike;
}

function topoColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.28, 0.0, 0.5]],
    [0.08, [0.05, 0.05, 0.72]],
    [0.18, [0.0, 0.2, 0.85]],
    [0.3, [0.0, 0.55, 0.7]],
    [0.42, [0.05, 0.72, 0.35]],
    [0.54, [0.3, 0.8, 0.1]],
    [0.65, [0.65, 0.85, 0.05]],
    [0.75, [0.92, 0.88, 0.0]],
    [0.85, [1.0, 0.62, 0.0]],
    [0.93, [1.0, 0.25, 0.05]],
    [1.0, [0.9, 0.05, 0.05]],
  ];
  for (let k = 0; k < stops.length - 1; k++) {
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2])];
    }
  }
  return [0.9, 0.05, 0.05];
}

export function VannaCharmTerrainPlot() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elev, setElev] = useState(26);
  const [azim, setAzim] = useState(200);
  const [showPlane, setShowPlane] = useState(true);

  const elevRef = useRef(26);
  const azimRef = useRef(200);
  const distRef = useRef(9.0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const planeRef = useRef<THREE.Mesh | null>(null);

  function updateCam() {
    const cam = cameraRef.current;
    if (!cam) return;
    const el = elevRef.current * Math.PI / 180;
    const az = azimRef.current * Math.PI / 180;
    const d = distRef.current;
    cam.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    cam.lookAt(0, 0.5, 0);
  }

  useEffect(() => { elevRef.current = elev; updateCam(); }, [elev]);
  useEffect(() => { azimRef.current = azim; updateCam(); }, [azim]);
  useEffect(() => { if (planeRef.current) planeRef.current.visible = showPlane; }, [showPlane]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    const W = container.clientWidth - 2;
    const H = 530;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.52));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.1); sun.position.set(6, 18, 8); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc0d8ff, 0.5); fill.position.set(-8, 4, -6); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffeecc, 0.28); rim.position.set(0, -6, 10); scene.add(rim);

    let mn = Infinity, mx = -Infinity;
    const raw: number[][] = [];
    for (let i = 0; i < N; i++) {
      raw.push([]);
      for (let j = 0; j < N; j++) {
        const v = terrain(i / (N - 1), j / (N - 1));
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
        const y = norm * SY - 0.4;
        verts.push(x, y, z);
        const [r, g, b] = topoColor(norm);
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
      shininess: 55, specular: new THREE.Color(0.35, 0.35, 0.25),
    });
    scene.add(new THREE.Mesh(geo, mat));

    // Mesh lines (light over black)
    const lm = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.12, transparent: true });
    const step = 6;
    for (let j = 0; j < N; j += step) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i++) { const k = (i * N + j) * 3; pts.push(new THREE.Vector3(verts[k], verts[k + 1], verts[k + 2])); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
    }
    for (let i = 0; i < N; i += step) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < N; j++) { const k = (i * N + j) * 3; pts.push(new THREE.Vector3(verts[k], verts[k + 1], verts[k + 2])); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
    }

    // Reference plane
    const refY = (0.52 - mn) / (mx - mn) * SY - 0.4;
    const planeGeo = new THREE.PlaneGeometry(SX, SZ, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshPhongMaterial({
      color: 0x8899cc, transparent: true, opacity: 0.38, side: THREE.DoubleSide, shininess: 5,
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.position.y = refY;
    planeRef.current = planeMesh;
    scene.add(planeMesh);
    const pBorder = new THREE.EdgesGeometry(planeGeo);
    scene.add(new THREE.LineSegments(pBorder, new THREE.LineBasicMaterial({ color: 0x5577bb, opacity: 0.6, transparent: true })));

    // Wall grids
    const wallGrid = (pts: THREE.Vector3[], col = 0x556677, op = 0.35) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, opacity: op, transparent: true })));
    };
    const bY2 = -0.42, tY = SY - 0.4, bX = -SX / 2, eX = SX / 2, bZ = -SZ / 2, eZ = SZ / 2;
    for (let k = 0; k <= 8; k++) {
      const x = bX + k * (SX / 8);
      wallGrid([new THREE.Vector3(x, bY2, bZ), new THREE.Vector3(x, tY, bZ)]);
    }
    for (let k = 0; k <= 6; k++) {
      const y = bY2 + k * ((tY - bY2) / 6);
      wallGrid([new THREE.Vector3(bX, y, bZ), new THREE.Vector3(eX, y, bZ)]);
      wallGrid([new THREE.Vector3(bX, y, bZ), new THREE.Vector3(bX, y, eZ)]);
    }
    for (let k = 0; k <= 8; k++) {
      const x = bX + k * (SX / 8);
      wallGrid([new THREE.Vector3(x, bY2, bZ), new THREE.Vector3(x, bY2, eZ)]);
    }
    for (let k = 0; k <= 8; k++) {
      const z = bZ + k * (SZ / 8);
      wallGrid([new THREE.Vector3(bX, bY2, z), new THREE.Vector3(eX, bY2, z)]);
    }

    // Labels
    const makeLabel = (txt: string, color = "#cccccc", sz = 22) => {
      const cv = document.createElement("canvas");
      cv.width = 220; cv.height = 58;
      const ctx = cv.getContext("2d")!;
      ctx.font = `bold ${sz}px Arial`;
      ctx.fillStyle = color;
      ctx.fillText(txt, 4, 42);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
      return sp;
    };
    const lX = makeLabel("X (mm)"); lX.position.set(0, bY2 - 0.22, eZ + 0.28); lX.scale.set(1.1, 0.28, 1); scene.add(lX);
    const lY = makeLabel("Y (mm)"); lY.position.set(eX + 0.3, bY2 - 0.22, 0); lY.scale.set(1.1, 0.28, 1); scene.add(lY);
    const lZ = makeLabel("Z (μm)"); lZ.position.set(bX - 0.55, 0.8, bZ); lZ.scale.set(1.0, 0.26, 1); scene.add(lZ);

    [10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14].forEach((v, i) => {
      const norm2 = i / 7;
      const yp = norm2 * SY + bY2;
      const lbl = makeLabel(`${v}`, "#aaaaaa", 18);
      lbl.position.set(bX - 0.45, yp, bZ); lbl.scale.set(0.55, 0.2, 1); scene.add(lbl);
    });
    [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08].forEach((v, i) => {
      const xp = bX + i * (SX / 8);
      const lbl = makeLabel(`${v}`, "#aaaaaa", 16);
      lbl.position.set(xp, bY2 - 0.14, eZ + 0.12); lbl.scale.set(0.52, 0.18, 1); scene.add(lbl);
    });
    [0, 0.02, 0.04, 0.06, 0.08].forEach((v, i) => {
      const zp = eZ - i * (SZ / 4);
      const lbl = makeLabel(`${v}`, "#aaaaaa", 16);
      lbl.position.set(eX + 0.14, bY2 - 0.14, zp); lbl.scale.set(0.48, 0.18, 1); scene.add(lbl);
    });

    updateCam();

    let drag = false, lx = 0, ly = 0;
    const onDown = (e: MouseEvent) => { drag = true; lx = e.clientX; ly = e.clientY; };
    const onUp = () => { drag = false; };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      azimRef.current -= (e.clientX - lx) * 0.42;
      elevRef.current = Math.max(-89, Math.min(89, elevRef.current + (e.clientY - ly) * 0.32));
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
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: "bold", color: "#ffffff", marginBottom: 4, letterSpacing: 0.5 }}>
        Vanna-Charm Surface &nbsp;|&nbsp; <span style={{ fontWeight: "normal", color: "#aaa" }}>Z (μm) vs X·Y (mm)</span>
      </div>
      <div style={{ position: "relative", width: "100%", height: 530 }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: 530, display: "block", borderRadius: 6, border: "1px solid #222" }} />
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
          <input type="checkbox" checked={showPlane} onChange={(e) => setShowPlane(e.target.checked)} style={{ verticalAlign: "middle" }} /> Ref plane
        </label>
      </div>
    </div>
  );
}

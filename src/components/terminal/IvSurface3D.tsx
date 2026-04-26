import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { IvCell } from "@/lib/gex";

interface Props {
  cells: IvCell[];
  spot?: number;
}

// Classic MATLAB "jet" colormap: dark blue → cyan → green → yellow → red
function jetColor(t: number): THREE.Color {
  t = Math.max(0, Math.min(1, t));
  const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
  return new THREE.Color(r, g, b);
}

const SIZE_X = 10;   // moneyness axis
const SIZE_Y = 6;    // time-to-maturity axis
const SIZE_Z = 4.5;  // IV height

function Surface({ cells }: { cells: IvCell[] }) {
  const { surfaceGeo, wireGeo, ivMin, ivMax, strikes, expiries } = useMemo(() => {
    const strikes = Array.from(new Set(cells.map((c) => c.strike))).sort((a, b) => a - b);
    const expiries = Array.from(new Set(cells.map((c) => c.expiry))).sort((a, b) => a - b);
    const grid = new Map<string, number>();
    for (const c of cells) grid.set(`${c.strike}|${c.expiry}`, c.iv);

    const ivs = cells.map((c) => c.iv);
    const ivMin = Math.min(...ivs);
    const ivMax = Math.max(...ivs);

    const w = strikes.length;
    const h = expiries.length;

    const surfaceGeo = new THREE.PlaneGeometry(SIZE_X, SIZE_Y, w - 1, h - 1);
    const colors: number[] = [];

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        const iv = grid.get(`${strikes[i]}|${expiries[j]}`) ?? ivMin;
        const norm = (iv - ivMin) / Math.max(1e-6, ivMax - ivMin);
        surfaceGeo.attributes.position.setZ(idx, norm * SIZE_Z);
        const c = jetColor(norm);
        colors.push(c.r, c.g, c.b);
      }
    }
    surfaceGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    surfaceGeo.computeVertexNormals();
    surfaceGeo.rotateX(-Math.PI / 2);

    const wireGeo = new THREE.WireframeGeometry(surfaceGeo);

    return { surfaceGeo, wireGeo, ivMin, ivMax, strikes, expiries };
  }, [cells]);

  const wallLines = useMemo(() => {
    const lines: { points: [number, number, number][] }[] = [];
    const half = SIZE_X / 2;
    const halfY = SIZE_Y / 2;
    for (let i = 0; i <= 6; i++) {
      const x = -half + (SIZE_X * i) / 6;
      lines.push({ points: [[x, 0, -halfY], [x, SIZE_Z, -halfY]] });
    }
    for (let j = 0; j <= 6; j++) {
      const y = (SIZE_Z * j) / 6;
      lines.push({ points: [[-half, y, -halfY], [half, y, -halfY]] });
      lines.push({ points: [[half, y, -halfY], [half, y, halfY]] });
    }
    return lines;
  }, []);

  const xTicks = useMemo(() => {
    const out: { pos: [number, number, number]; text: string }[] = [];
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -SIZE_X / 2 + t * SIZE_X;
      const strike = strikes[Math.round(t * (strikes.length - 1))];
      out.push({ pos: [x, -0.05, SIZE_Y / 2 + 0.4], text: String(strike) });
    }
    return out;
  }, [strikes]);

  const yTicks = useMemo(() => {
    const out: { pos: [number, number, number]; text: string }[] = [];
    const n = Math.min(5, expiries.length - 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const z = -SIZE_Y / 2 + t * SIZE_Y;
      const exp = expiries[Math.round(t * (expiries.length - 1))];
      out.push({ pos: [-SIZE_X / 2 - 0.4, -0.05, z], text: `${exp}d` });
    }
    return out;
  }, [expiries]);

  const zTicks = useMemo(() => {
    const out: { pos: [number, number, number]; text: string }[] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = t * SIZE_Z;
      const iv = ivMin + t * (ivMax - ivMin);
      out.push({ pos: [-SIZE_X / 2 - 0.4, y, SIZE_Y / 2], text: iv.toFixed(2) });
    }
    return out;
  }, [ivMin, ivMax]);

  return (
    <group>
      <mesh geometry={surfaceGeo}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={wireGeo}>
        <lineBasicMaterial color="#000000" transparent opacity={0.55} />
      </lineSegments>

      {wallLines.map((l, i) => (
        <Line key={i} points={l.points} color="#888" lineWidth={0.6} dashed dashSize={0.08} gapSize={0.08} />
      ))}

      <Text position={[0, -0.7, SIZE_Y / 2 + 1.4]} fontSize={0.32} color="#000">
        Moneyness M = S/K
      </Text>
      <Text position={[-SIZE_X / 2 - 1.6, -0.7, 0]} fontSize={0.32} color="#000" rotation={[0, Math.PI / 2, 0]}>
        Time to Maturity T
      </Text>
      <Text
        position={[-SIZE_X / 2 - 1.4, SIZE_Z / 2, SIZE_Y / 2 + 0.2]}
        fontSize={0.3}
        color="#000"
        rotation={[0, 0, Math.PI / 2]}
      >
        Implied Volatility σ(T, M)
      </Text>

      <Text position={[0, SIZE_Z + 0.9, 0]} fontSize={0.42} color="#000">
        Implied Volatility Surface
      </Text>

      {xTicks.map((t, i) => (
        <Text key={`x${i}`} position={t.pos} fontSize={0.22} color="#222">{t.text}</Text>
      ))}
      {yTicks.map((t, i) => (
        <Text key={`y${i}`} position={t.pos} fontSize={0.22} color="#222">{t.text}</Text>
      ))}
      {zTicks.map((t, i) => (
        <Text key={`z${i}`} position={t.pos} fontSize={0.2} color="#222" anchorX="right">{t.text}</Text>
      ))}
    </group>
  );
}

export function IvSurface3D({ cells }: Props) {
  if (cells.length < 4) {
    return (
      <div className="h-[520px] flex items-center justify-center text-muted-foreground text-sm">
        Datos insuficientes
      </div>
    );
  }
  return (
    <div className="h-[520px] w-full rounded-md overflow-hidden bg-white">
      <Canvas camera={{ position: [11, 8, 12], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={1} />
        <Surface cells={cells} />
        <OrbitControls
          enablePan={false}
          minDistance={10}
          maxDistance={24}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, SIZE_Z / 2, 0]}
        />
      </Canvas>
    </div>
  );
}

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { IvCell } from "@/lib/gex";

interface Props {
  cells: IvCell[];
  spot: number;
}

function Surface({ cells, spot }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, ivMin, ivMax } = useMemo(() => {
    const strikes = Array.from(new Set(cells.map((c) => c.strike))).sort((a, b) => a - b);
    const expiries = Array.from(new Set(cells.map((c) => c.expiry))).sort((a, b) => a - b);
    const grid = new Map<string, number>();
    for (const c of cells) grid.set(`${c.strike}|${c.expiry}`, c.iv);

    const ivs = cells.map((c) => c.iv);
    const ivMin = Math.min(...ivs);
    const ivMax = Math.max(...ivs);

    const w = strikes.length;
    const h = expiries.length;
    const sizeX = 10;
    const sizeY = 6;
    const sizeZ = 3;

    const geo = new THREE.PlaneGeometry(sizeX, sizeY, w - 1, h - 1);
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        const iv = grid.get(`${strikes[i]}|${expiries[j]}`) ?? ivMin;
        const norm = (iv - ivMin) / Math.max(1e-6, ivMax - ivMin);
        // height
        geo.attributes.position.setZ(idx, norm * sizeZ);
        // color: green (low) -> cyan (mid) -> magenta/red (high panic)
        color.setHSL(0.45 - norm * 0.45, 1, 0.5);
        colors.push(color.r, color.g, color.b);
      }
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.rotateX(-Math.PI / 2);
    return { geometry: geo, ivMin, ivMax, strikes, expiries };
  }, [cells]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.1) * 0.1;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading metalness={0.2} roughness={0.6} />
      </mesh>
      {/* axis labels */}
      <Text position={[0, -0.5, 3.5]} fontSize={0.35} color="#94a3b8">Strike →</Text>
      <Text position={[-5.8, -0.5, 0]} fontSize={0.35} color="#94a3b8" rotation={[0, Math.PI / 2, 0]}>DTE →</Text>
      <Text position={[-5.8, 1.5, -3.5]} fontSize={0.3} color="#00ffff">IV {(ivMax * 100).toFixed(0)}%</Text>
      <Text position={[-5.8, 0, -3.5]} fontSize={0.3} color="#00ff88">IV {(ivMin * 100).toFixed(0)}%</Text>
      {/* grid floor */}
      <gridHelper args={[12, 12, "#1e293b", "#0f172a"]} position={[0, -0.01, 0]} />
    </group>
  );
}

export function IvSurface3D({ cells, spot }: Props) {
  if (cells.length < 4) {
    return <div className="h-[420px] flex items-center justify-center text-muted-foreground text-sm">Datos insuficientes</div>;
  }
  return (
    <div className="h-[420px] w-full rounded-md overflow-hidden bg-gradient-to-b from-background to-card">
      <Canvas camera={{ position: [8, 7, 10], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <pointLight position={[-5, 5, -5]} intensity={0.4} color="#00ffff" />
        <Surface cells={cells} spot={spot} />
        <OrbitControls enablePan={false} minDistance={8} maxDistance={20} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}

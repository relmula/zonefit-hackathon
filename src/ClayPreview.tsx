import { useLayoutEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { definitionOf, type FurnitureInstance, type RectMm, type RoomSettings } from './model'

type Layout = {
  room: RoomSettings
  zone: RectMm
  instances: readonly FurnitureInstance[]
}

function mm(value: number): number {
  return value / 1000
}

function ProxyItem({ item }: { item: FurnitureInstance }) {
  const def = definitionOf(item.typeId)
  const w = mm(def.widthMm)
  const d = mm(def.depthMm)
  const h = mm(def.heightMm)
  const rotY = -(item.rotationDeg * Math.PI) / 180
  const clay = '#cbb79a'

  return (
    <group position={[mm(item.xMm), 0, mm(item.yMm)]} rotation={[0, rotY, 0]}>
      {item.typeId === 'sofa' && (
        <>
          <mesh position={[0, h * 0.21, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h * 0.42, d]} />
            <meshStandardMaterial color={clay} roughness={0.9} metalness={0.02} />
          </mesh>
          <mesh position={[0, h * 0.52, -d * 0.36]} castShadow>
            <boxGeometry args={[w, h * 0.72, d * 0.18]} />
            <meshStandardMaterial color={clay} roughness={0.9} metalness={0.02} />
          </mesh>
        </>
      )}
      {item.typeId === 'chair' && (
        <>
          <mesh position={[0, h * 0.2, 0.02]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.86, h * 0.38, d * 0.86]} />
            <meshStandardMaterial color={clay} roughness={0.9} metalness={0.02} />
          </mesh>
          <mesh position={[0, h * 0.52, -d * 0.32]} castShadow>
            <boxGeometry args={[w * 0.86, h * 0.7, d * 0.16]} />
            <meshStandardMaterial color={clay} roughness={0.9} metalness={0.02} />
          </mesh>
        </>
      )}
      {(item.typeId === 'coffee' || item.typeId === 'side') && (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={clay} roughness={0.9} metalness={0.02} />
        </mesh>
      )}
    </group>
  )
}

function CameraAimer({ target }: { target: [number, number, number] }) {
  const { camera } = useThree()
  useLayoutEffect(() => {
    camera.lookAt(target[0], target[1], target[2])
    camera.updateProjectionMatrix()
  }, [camera, target])
  return null
}

export function ClayPreview({
  layout,
  corner,
  label,
}: {
  layout: Layout
  corner: 'a' | 'b'
  label: string
}) {
  const width = mm(layout.room.widthMm)
  const depth = mm(layout.room.depthMm)
  const height = mm(layout.room.heightMm)
  const eye = Math.min(1.6, height * 0.62)
  const inset = 0.42
  const position: [number, number, number] =
    corner === 'a' ? [inset, eye, inset] : [width - inset, eye, depth - inset]
  const target: [number, number, number] = [width / 2, Math.min(1.05, height * 0.4), depth / 2]
  const wallT = 0.08

  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-stone">
      <div className="h-[180px] w-full">
        <Canvas shadows gl={{ antialias: true }} camera={{ fov: 46, position, near: 0.05, far: 40 }}>
          <color attach="background" args={['#f2ece3']} />
          <hemisphereLight args={['#fff4e5', '#8a7a68', 0.9]} />
          <directionalLight position={[width * 0.15, height * 1.2, depth * 0.1]} intensity={1.15} castShadow />
          <directionalLight position={[width * 0.9, height * 0.8, depth * 0.85]} intensity={0.4} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, depth / 2]} receiveShadow>
            <planeGeometry args={[width, depth]} />
            <meshStandardMaterial color="#ece4d8" roughness={0.96} />
          </mesh>
          <mesh position={[width / 2, height / 2, -wallT / 2]}>
            <boxGeometry args={[width + wallT * 2, height, wallT]} />
            <meshStandardMaterial color="#e7d9c6" roughness={0.94} />
          </mesh>
          <mesh position={[width / 2, height / 2, depth + wallT / 2]}>
            <boxGeometry args={[width + wallT * 2, height, wallT]} />
            <meshStandardMaterial color="#e7d9c6" roughness={0.94} />
          </mesh>
          <mesh position={[-wallT / 2, height / 2, depth / 2]}>
            <boxGeometry args={[wallT, height, depth]} />
            <meshStandardMaterial color="#e7d9c6" roughness={0.94} />
          </mesh>
          <mesh position={[width + wallT / 2, height / 2, depth / 2]}>
            <boxGeometry args={[wallT, height, depth]} />
            <meshStandardMaterial color="#e7d9c6" roughness={0.94} />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[mm(layout.zone.x + layout.zone.w / 2), 0.004, mm(layout.zone.y + layout.zone.h / 2)]}
          >
            <planeGeometry args={[mm(layout.zone.w), mm(layout.zone.h)]} />
            <meshStandardMaterial color="#d6ba96" transparent opacity={0.28} />
          </mesh>
          {layout.instances.map((item) => (
            <ProxyItem key={item.id} item={item} />
          ))}
          <ContactShadows
            position={[width / 2, 0.01, depth / 2]}
            opacity={0.28}
            scale={Math.max(width, depth) * 1.2}
            blur={2.2}
            far={2.5}
          />
          <CameraAimer target={target} />
        </Canvas>
      </div>
      <p className="px-2 py-1.5 text-center text-[11px] font-medium text-muted">{label}</p>
    </div>
  )
}

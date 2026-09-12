import * as THREE from 'three'
import { definitionOf, type FurnitureInstance, type RectMm, type RoomSettings } from './model'

const GUIDE_PX = 1024
const CLAY = 0xcbb79a
const FLOOR = 0xece4d8
const WALL = 0xe7d9c6
const ZONE = 0xd6ba96

export type ClayLayout = {
  room: RoomSettings
  zone: RectMm
  instances: readonly FurnitureInstance[]
}

function mmToM(mm: number): number {
  return mm / 1000
}

function clayMaterial(color: number, roughness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
  })
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function furnitureProxy(item: FurnitureInstance, material: THREE.Material): THREE.Group {
  const def = definitionOf(item.typeId)
  const w = mmToM(def.widthMm)
  const d = mmToM(def.depthMm)
  const h = mmToM(def.heightMm)
  const group = new THREE.Group()
  group.position.set(mmToM(item.xMm), 0, mmToM(item.yMm))
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotationDeg)

  if (item.typeId === 'sofa') {
    addBox(group, w, h * 0.42, d, 0, h * 0.21, 0, material)
    addBox(group, w, h * 0.72, d * 0.18, 0, h * 0.52, -d * 0.36, material)
    addBox(group, w * 0.06, h * 0.38, d * 0.78, -w * 0.44, h * 0.32, d * 0.04, material)
    addBox(group, w * 0.06, h * 0.38, d * 0.78, w * 0.44, h * 0.32, d * 0.04, material)
  } else if (item.typeId === 'chair') {
    addBox(group, w * 0.86, h * 0.38, d * 0.86, 0, h * 0.2, 0.02, material)
    addBox(group, w * 0.86, h * 0.7, d * 0.16, 0, h * 0.52, -d * 0.32, material)
  } else if (item.typeId === 'coffee') {
    addBox(group, w, h, d, 0, h / 2, 0, material)
  } else {
    addBox(group, w, h, d, 0, h / 2, 0, material)
  }

  return group
}

export function buildClayScene(layout: ClayLayout): {
  scene: THREE.Scene
  cameraA: THREE.PerspectiveCamera
  cameraB: THREE.PerspectiveCamera
  dispose: () => void
} {
  const { room, zone, instances } = layout
  const width = mmToM(room.widthMm)
  const depth = mmToM(room.depthMm)
  const height = mmToM(room.heightMm)
  const materials: THREE.Material[] = []
  const geometries: THREE.BufferGeometry[] = []
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf2ece3)

  const floorMat = clayMaterial(FLOOR, 0.96)
  const wallMat = clayMaterial(WALL, 0.94)
  const clayMat = clayMaterial(CLAY, 0.9)
  const zoneMat = new THREE.MeshStandardMaterial({
    color: ZONE,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
  })
  materials.push(floorMat, wallMat, clayMat, zoneMat)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(width / 2, 0, depth / 2)
  floor.receiveShadow = true
  scene.add(floor)
  geometries.push(floor.geometry)

  const wallT = 0.08
  const walls = [
    { w: width + wallT * 2, h: height, d: wallT, x: width / 2, y: height / 2, z: -wallT / 2 },
    { w: width + wallT * 2, h: height, d: wallT, x: width / 2, y: height / 2, z: depth + wallT / 2 },
    { w: wallT, h: height, d: depth, x: -wallT / 2, y: height / 2, z: depth / 2 },
    { w: wallT, h: height, d: depth, x: width + wallT / 2, y: height / 2, z: depth / 2 },
  ]
  for (const wall of walls) {
    addBox(scene, wall.w, wall.h, wall.d, wall.x, wall.y, wall.z, wallMat)
  }

  const zoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(mmToM(zone.w), mmToM(zone.h)), zoneMat)
  zoneMesh.rotation.x = -Math.PI / 2
  zoneMesh.position.set(mmToM(zone.x + zone.w / 2), 0.004, mmToM(zone.y + zone.h / 2))
  scene.add(zoneMesh)
  geometries.push(zoneMesh.geometry)

  for (const item of instances) {
    scene.add(furnitureProxy(item, clayMat))
  }

  const hemi = new THREE.HemisphereLight(0xfff4e5, 0x8a7a68, 0.9)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xffe1b5, 1.15)
  key.position.set(width * 0.15, height * 1.2, depth * 0.1)
  key.castShadow = true
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xf7efe4, 0.45)
  fill.position.set(width * 0.9, height * 0.8, depth * 0.85)
  scene.add(fill)

  const look = new THREE.Vector3(width / 2, Math.min(1.05, height * 0.4), depth / 2)
  const eye = Math.min(1.6, height * 0.62)
  const inset = 0.42

  const cameraA = new THREE.PerspectiveCamera(46, 1, 0.05, 40)
  cameraA.position.set(inset, eye, inset)
  cameraA.lookAt(look)

  const cameraB = new THREE.PerspectiveCamera(46, 1, 0.05, 40)
  cameraB.position.set(width - inset, eye, depth - inset)
  cameraB.lookAt(look)

  return {
    scene,
    cameraA,
    cameraB,
    dispose: () => {
      materials.forEach((material) => material.dispose())
      geometries.forEach((geometry) => geometry.dispose())
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
        }
      })
    },
  }
}

export function captureClayViews(layout: ClayLayout): { viewA: string; viewB: string } {
  const canvas = document.createElement('canvas')
  canvas.width = GUIDE_PX
  canvas.height = GUIDE_PX
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
  })
  renderer.setSize(GUIDE_PX, GUIDE_PX, false)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const world = buildClayScene(layout)
  try {
    renderer.render(world.scene, world.cameraA)
    const viewA = renderer.domElement.toDataURL('image/png')
    renderer.render(world.scene, world.cameraB)
    const viewB = renderer.domElement.toDataURL('image/png')
    return { viewA, viewB }
  } finally {
    world.dispose()
    renderer.dispose()
  }
}

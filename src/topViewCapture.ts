import { definitionOf, footprintPolygon, type FurnitureInstance, type RectMm, type RoomSettings } from './model'

const SIZE = 1024

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  scaleX: number,
  scaleY: number,
  fill: string,
  stroke: string,
) {
  if (points.length < 3) return
  ctx.beginPath()
  ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY)
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x * scaleX, points[index].y * scaleY)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
}

export function captureTopView(
  room: RoomSettings,
  zone: RectMm,
  instances: readonly FurnitureInstance[],
): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not capture the 2D top view.')

  const scale = Math.min(SIZE / room.widthMm, SIZE / room.depthMm)
  const ox = (SIZE - room.widthMm * scale) / 2
  const oy = (SIZE - room.depthMm * scale) / 2

  ctx.fillStyle = '#f2ece3'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.save()
  ctx.translate(ox, oy)

  ctx.fillStyle = '#f4efe6'
  ctx.fillRect(0, 0, room.widthMm * scale, room.depthMm * scale)

  ctx.strokeStyle = 'rgba(212, 198, 180, 0.55)'
  ctx.lineWidth = 1
  for (let x = 0; x <= room.widthMm + 0.01; x += 300) {
    ctx.beginPath()
    ctx.moveTo(x * scale, 0)
    ctx.lineTo(x * scale, room.depthMm * scale)
    ctx.stroke()
  }
  for (let y = 0; y <= room.depthMm + 0.01; y += 300) {
    ctx.beginPath()
    ctx.moveTo(0, y * scale)
    ctx.lineTo(room.widthMm * scale, y * scale)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(214, 186, 150, 0.28)'
  ctx.fillRect(zone.x * scale, zone.y * scale, zone.w * scale, zone.h * scale)
  ctx.strokeStyle = 'rgba(139, 112, 84, 0.45)'
  ctx.strokeRect(zone.x * scale, zone.y * scale, zone.w * scale, zone.h * scale)

  for (const item of instances) {
    drawPolygon(ctx, footprintPolygon(item), scale, scale, '#ddcbb6', '#8a6a4a')
    const def = definitionOf(item.typeId)
    ctx.fillStyle = '#2a241e'
    ctx.font = `${Math.max(11, 13)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(def.name, item.xMm * scale, item.yMm * scale)
  }

  ctx.restore()
  ctx.strokeStyle = '#d4c6b4'
  ctx.lineWidth = 3
  ctx.strokeRect(ox, oy, room.widthMm * scale, room.depthMm * scale)

  return canvas.toDataURL('image/png')
}

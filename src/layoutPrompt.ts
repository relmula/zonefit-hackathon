import { definitionOf, instanceLabel, type FurnitureInstance, type RectMm, type RoomSettings } from './model'

export function describeLayout(
  room: RoomSettings,
  zone: RectMm,
  instances: readonly FurnitureInstance[],
): string {
  const lines = [
    `Active Area: ${zone.w} × ${zone.h} mm, centred in the derived presentation room at origin ${Math.round(zone.x)} mm, ${Math.round(zone.y)} mm from the top-left corner in plan.`,
    `Derived presentation room (not user-editable; visual staging and 3D context only): ${room.widthMm} × ${room.depthMm} × ${room.heightMm} mm (width × depth × height).`,
    `Furniture count: ${instances.length}.`,
    'Committed furniture in millimetres (x/y are plan centres; rotation is clockwise in top view):',
  ]
  instances.forEach((item, index) => {
    const def = definitionOf(item.typeId)
    lines.push(
      `${index + 1}. ${instanceLabel(item, instances)} (${def.name}): ${def.widthMm} × ${def.depthMm} × ${def.heightMm} mm, centre ${Math.round(item.xMm)}, ${Math.round(item.yMm)} mm, rotation ${item.rotationDeg}°.`,
    )
  })
  return lines.join('\n')
}

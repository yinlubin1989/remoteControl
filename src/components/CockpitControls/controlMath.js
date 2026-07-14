const CENTER = 50
const DEAD_ZONE = 4

export const applyCockpitSteeringCurve = (value) => {
  const offset = value - CENTER
  const distance = Math.abs(offset)
  if (distance <= DEAD_ZONE) return CENTER

  const adjustedDistance = (
    (distance - DEAD_ZONE) / (CENTER - DEAD_ZONE)
  ) * CENTER
  const normalized = Math.sign(offset) * adjustedDistance / CENTER
  const curved = (0.35 * normalized) + (0.65 * normalized ** 3)
  return CENTER + curved * CENTER
}

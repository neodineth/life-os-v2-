// Empty-slot selection uses wall-clock minutes, independent of the screen scale.
export function calendarSelection(anchor: number, pointer: number) {
  const startSlot = Math.max(0, Math.min(1410, Math.floor(anchor / 30) * 30));
  const boundary = Math.max(0, Math.min(1440, Math.round(pointer / 30) * 30));
  return { start: Math.min(startSlot, boundary), end: Math.max(startSlot + 30, boundary) };
}

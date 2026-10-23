/**
 * Grouping of map pins that would sit on top of each other.
 *
 * A venue pin is a label about 120px wide, so at country zoom a city's venues were
 * a single unreadable stack in which only the top pin could be clicked. Pins are
 * grouped in screen space at the current zoom: any pin whose label box overlaps
 * the first pin of a group joins it, and the group is drawn as one counted marker
 * that zooms in when chosen. It is greedy and order-stable (by id), which is all a
 * directory of a few hundred venues needs, and needs no plugin.
 */

export interface ProjectedPin<T> { item: T; x: number; y: number }
export interface PinGroup<T> { items: T[]; x: number; y: number }

/** Roughly the size of a pin label; closer than this, two labels overlap. */
export const PIN_BOX = { width: 110, height: 40 };

export function clusterPins<T extends { id: string }>(
  pins: ProjectedPin<T>[],
  options: { box?: { width: number; height: number }; keep?: string | null } = {},
): PinGroup<T>[] {
  const box = options.box ?? PIN_BOX;
  const ordered = [...pins].sort((a, b) => a.item.id.localeCompare(b.item.id));
  const taken = new Set<string>();
  const groups: PinGroup<T>[] = [];
  for (const seed of ordered) {
    if (taken.has(seed.item.id)) continue;
    taken.add(seed.item.id);
    const members = [seed];
    // The selected pin always stands alone, so it can be seen and its card points at it.
    if (seed.item.id !== options.keep) {
      for (const other of ordered) {
        if (taken.has(other.item.id) || other.item.id === options.keep) continue;
        if (Math.abs(other.x - seed.x) < box.width && Math.abs(other.y - seed.y) < box.height) {
          taken.add(other.item.id);
          members.push(other);
        }
      }
    }
    groups.push({
      items: members.map(member => member.item),
      x: members.reduce((sum, member) => sum + member.x, 0) / members.length,
      y: members.reduce((sum, member) => sum + member.y, 0) / members.length,
    });
  }
  return groups;
}

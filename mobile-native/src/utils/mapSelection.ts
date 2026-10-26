import type { LiveMapMarker } from "../api/liveTracking";

export type CameraTarget =
  | { kind: "fit" }
  | { kind: "follow"; marker: LiveMapMarker }
  | null;

/**
 * Where the live map camera should go after a data load.
 *
 * - A selected asset that is still on the map is followed (re-centred on its new position).
 * - Otherwise the whole fleet is fitted, but only on the first load or while the user has not
 *   panned/zoomed the map themselves — background refreshes must not yank the view around.
 */
export function cameraTargetAfterLoad(
  markers: LiveMapMarker[],
  selectedId: string | null,
  state: { fitted: boolean; userMoved: boolean }
): CameraTarget {
  if (markers.length === 0) return null;
  const selected = selectedId ? markers.find((marker) => marker.id === selectedId) : undefined;
  if (selected) return { kind: "follow", marker: selected };
  if (!state.fitted || !state.userMoved) return { kind: "fit" };
  return null;
}

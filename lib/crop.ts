// The crop screen, opened from anywhere (pickPhoto): one request at a time, answered with the cropped picture or null.

export type CropResult = { uri: string; width: number; height: number };
export type CropRequest = {
  id: number;
  uri: string;
  width: number;
  height: number;
  /** The frame proposed first, e.g. [16, 9] for a banner. Null: the picture's own shape. */
  aspect: [number, number] | null;
  resolve: (r: CropResult | null) => void;
};

let next = 1;
let current: CropRequest | null = null;
const listeners = new Set<(r: CropRequest | null) => void>();

export function subscribeCrop(l: (r: CropRequest | null) => void) {
  listeners.add(l);
  l(current);
  return () => {
    listeners.delete(l);
  };
}

/** Opens the crop screen on a picked picture: the cropped copy (a new file), or null when cancelled. */
export function cropPhoto(img: { uri: string; width: number; height: number }, aspect?: [number, number] | null): Promise<CropResult | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    current = { ...img, id: next++, aspect: aspect ?? null, resolve };
    listeners.forEach((l) => l(current));
  });
}

export function closeCrop(id: number, result: CropResult | null) {
  if (current?.id !== id) return;
  const r = current;
  current = null;
  listeners.forEach((l) => l(null));
  r.resolve(result);
}

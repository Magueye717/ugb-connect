const MB = 1024 * 1024;
/** "0,2 Mo", "1,2 Mo": a document's size, always in Mo (the unit of the limit), French style. */
export const fileSize = (bytes: number) => `${Math.max(0.1, bytes / MB).toFixed(1).replace('.', ',')} Mo`;
/** Under a document's label: "PDF · 3 pages · 0,4 Mo" (the pages when known). */
export const documentMeta = (d: { bytes: number; pages?: number | null }) =>
  ['PDF', d.pages ? `${d.pages} page${d.pages > 1 ? 's' : ''}` : null, fileSize(d.bytes)].filter(Boolean).join(' · ');
/** Bytes to Mo, for comparing with a limit given in Mo. */
export const toMb = (bytes: number) => bytes / MB;

// Accent- and case-insensitive: "bibliotheque" finds "Bibliothèque". Done by hand, Hermes' normalize() support varies.
const ACCENTS: Record<string, string> = { à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u', ç: 'c', '’': "'" };

export const fold = (s: string) => s.toLowerCase().replace(/[àâäéèêëîïôöùûüç’]/g, (c) => ACCENTS[c]);

/** True when the query is empty or found in one of the fields. */
export function matches(query: string, fields: (string | null | undefined)[]) {
  const q = fold(query.trim());
  return !q || fields.some((f) => !!f && fold(f).includes(q));
}

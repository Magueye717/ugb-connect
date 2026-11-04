// UFR, region and the card's details: once given, they change at the next rentrée (the date comes from the server).

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** "1er octobre 2027". By hand: Hermes' Intl support for fr-FR varies by platform. */
export function rentreeLabel(iso: string) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  return `${day === 1 ? '1er' : day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

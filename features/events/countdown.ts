/** « Dans 3 j », « Demain · 20h00 », « Aujourd’hui · 20h00 », « En cours », « Terminé ». */
export function countdown(startsAt: string, endsAt: string, now: number) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (now >= end) return 'Terminé';
  if (now >= start) return 'En cours';
  const hour = new Date(start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  const day = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((day(start) - day(now)) / 86_400_000);
  return days === 0 ? `Aujourd’hui · ${hour}` : days === 1 ? `Demain · ${hour}` : `Dans ${days} j`;
}

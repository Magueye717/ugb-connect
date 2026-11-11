import { formatFcfa } from '@/constants/data';
import { notice, type NoticeAction } from '@/lib/notice';

/**
 * After « Payé »: the cash is in hand and the request is validated. Says it plainly — how much, from whom, which
 * tickets are now valid — and what's left on request, if only some were paid.
 */
export function noticeValidated({
  name,
  kind,
  amount,
  validated,
  left = 0,
  next,
}: {
  name: string;
  kind: 'event' | 'caravan';
  amount: number;
  /** What became valid: « Billet 1 · Standard », « Place 8 · Awa »… */
  validated: string[];
  /** Tickets of the request still waiting for their payment. */
  left?: number;
  /** The main button (« Scanner une autre demande »); « Parfait » otherwise. */
  next?: NoticeAction;
}) {
  const what = kind === 'event' ? (validated.length > 1 ? 'billets' : 'billet') : validated.length > 1 ? 'places' : 'place';
  const n = validated.length;
  notice({
    tone: 'success',
    title: 'Paiement validé',
    message: `${formatFcfa(amount)} reçus de ${name}. ${n > 1 ? `Ses ${n} ${what} sont` : `Son ${what} est`} maintenant ${n > 1 ? 'valables' : 'valable'}, avec leur QR code dans son app.`,
    bullets: [
      ...validated.slice(0, 5),
      ...(validated.length > 5 ? [`… et ${validated.length - 5} autre${validated.length > 6 ? 's' : ''}`] : []),
      kind === 'event' ? 'À scanner à l’entrée : rien à encaisser à la porte' : 'À scanner à l’embarquement : rien à encaisser dans le bus',
    ],
    footnote: left
      ? `${left} autre${left > 1 ? 's' : ''} ${kind === 'event' ? `billet${left > 1 ? 's' : ''}` : `place${left > 1 ? 's' : ''}`} encore en demande : ${name.split(' ')[0]} peut les payer plus tard, avant l’heure limite.`
      : 'Il est prévenu par une notification.',
    primary: next ?? { label: 'Parfait' },
  });
}

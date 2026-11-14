// A message worth a pause ("Envoyé pour validation", "Paiement en attente"…): a card in the middle of the screen with
// what happened and what comes next, closed with one button. Shorter confirmations are toasts (lib/toast); errors and
// choices stay dialogs (Alert).

export type NoticeTone = 'success' | 'pending' | 'info' | 'warning';
export type NoticeAction = { label: string; onPress?: () => void };
/** A choice in a question: `danger` (red, what removes or cancels), `primary` (navy), `quiet` (backing out). */
export type NoticeChoice = NoticeAction & { tone: 'danger' | 'primary' | 'quiet' };
export type Notice = {
  id: number;
  tone: NoticeTone;
  title: string;
  message?: string;
  /** What happens next, in order: shown numbered. */
  steps?: string[];
  /** A last line under the steps ("Tu reçois une notification dans tous les cas."). */
  footnote?: string;
  /** The main button; « Compris » by default. */
  primary?: NoticeAction;
  /** A second, quieter choice ("Voir mes publicités"). */
  secondary?: NoticeAction;
  /** What it means, as short points ("Les passagers sont remboursés à 100 %"). */
  bullets?: string[];
  /** A question: these buttons instead of primary / secondary, in this order. Tapping outside is backing out. */
  choices?: NoticeChoice[];
  /** Closed without a choice (tapped outside, back button). */
  onDismiss?: () => void;
};

let next = 1;
let current: Notice | null = null;
const listeners = new Set<(n: Notice | null) => void>();
const emit = () => listeners.forEach((l) => l(current));

export function subscribeNotice(l: (n: Notice | null) => void) {
  listeners.add(l);
  l(current);
  return () => {
    listeners.delete(l);
  };
}

/** Shows the card; a new one replaces the one on screen. */
export function notice(n: Omit<Notice, 'id'>) {
  current = { ...n, id: next++ };
  emit();
}

/**
 * Asks before something that can't be undone (cancel a trip, remove a photo, sign out): the consequences in points,
 * a red button to go ahead, a calm one to back out (also: tapping outside). Instead of Alert for these choices.
 */
export function confirmAction(q: {
  title: string;
  message?: string;
  bullets?: string[];
  /** The red button ("Annuler le trajet"). */
  confirm: string;
  onConfirm: () => void;
  /** Backing out ("Garder le trajet"); « Annuler » by default. */
  keep?: string;
  /** A third way out, positive (« Passer le relais à Awa »), shown between the two. */
  alternative?: NoticeAction;
  tone?: 'warning' | 'info';
}) {
  notice({
    tone: q.tone ?? 'warning',
    title: q.title,
    message: q.message,
    bullets: q.bullets,
    choices: [
      { label: q.confirm, onPress: q.onConfirm, tone: 'danger' },
      ...(q.alternative ? [{ ...q.alternative, tone: 'primary' as const }] : []),
      { label: q.keep ?? 'Annuler', tone: 'quiet' },
    ],
  });
}

export function dismissNotice(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

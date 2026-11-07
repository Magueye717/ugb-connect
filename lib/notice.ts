// A message worth a pause ("Envoyé pour validation", "Paiement en attente"…): a card in the middle of the screen with
// what happened and what comes next, closed with one button. Shorter confirmations are toasts (lib/toast); errors and
// choices stay dialogs (Alert).

export type NoticeTone = 'success' | 'pending' | 'info' | 'warning';
export type NoticeAction = { label: string; onPress?: () => void };
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

export function dismissNotice(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

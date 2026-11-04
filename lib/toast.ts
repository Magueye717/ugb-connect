// A short confirmation at the top of the screen ("Enregistré", "Message signalé"…), instead of a dialog to dismiss.
// Errors and choices stay dialogs (Alert): they need the student's attention or answer.

export type Toast = { id: number; message: string; tone: 'success' | 'info'; ms: number };

let next = 1;
let current: Toast | null = null;
const listeners = new Set<(t: Toast | null) => void>();

export function subscribeToast(l: (t: Toast | null) => void) {
  listeners.add(l);
  l(current);
  return () => {
    listeners.delete(l);
  };
}

/** Shows `message` for a few seconds (longer for a long one); a new one replaces the previous. */
export function toast(message: string, tone: Toast['tone'] = 'success') {
  current = { id: next++, message, tone, ms: Math.min(6000, 2500 + message.length * 40) };
  listeners.forEach((l) => l(current));
}

export function dismissToast(id: number) {
  if (current?.id !== id) return;
  current = null;
  listeners.forEach((l) => l(null));
}

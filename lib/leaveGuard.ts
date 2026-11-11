import { usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';

import { confirmAction } from '@/lib/notice';

const ask = (onLeave: () => void) =>
  confirmAction({
    title: 'Modifications non enregistrées',
    message: 'Tu as des changements qui ne sont pas encore enregistrés. Quitter sans enregistrer ?',
    confirm: 'Quitter sans enregistrer',
    keep: 'Continuer',
    onConfirm: onLeave,
  });

/**
 * A form with changes not saved yet: leaving the screen (back button, gesture, a link) asks first. After a save,
 * `leave(go)` navigates without asking (the changes are saved).
 */
export function useLeaveGuard(dirty: boolean) {
  // What to run once the guard is off: the blocked navigation, or the one after a save.
  const [then, setThen] = useState<null | (() => void)>(null);
  usePreventRemove(dirty && !then, ({ repeat }) => ask(() => setThen(() => repeat)));
  useEffect(() => {
    if (!then) return;
    then();
    // Armed again afterwards (a screen that stays, or the navigation didn't happen).
    const t = setTimeout(() => setThen(null), 0);
    return () => clearTimeout(t);
  }, [then]);
  return { leave: (go: () => void) => setThen(() => go) };
}

/** A sheet with changes not saved yet: closing it asks first. */
export const closeGuarded = (dirty: boolean, close: () => void) => (dirty ? ask(close) : close());

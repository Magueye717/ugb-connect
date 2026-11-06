import type { CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { ApiError } from '@/lib/api';

/** What a screen does with one frame: `done` (read, or a real answer to show), or `retry` (not readable yet). */
export type ScanAttempt = (uri: string) => Promise<'done' | 'retry'>;

/** Tries before suggesting to type the number: the server reads a few cards per hour per student, and each read takes a moment. */
const MAX_TRIES = 6;
/** Time for the camera to focus before the first frame, and between two tries. */
const FOCUS_MS = 1200;
const PAUSE_MS = 900;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The frame is only for the reading: deleted from the phone right after (never in the gallery). */
const erase = (uri?: string) => {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone, or in the system cache that clears itself.
  }
};

/** The server couldn't read this frame (blurred, too far): try again quietly instead of showing an error. */
export const unreadable = (err: unknown) => err instanceof ApiError && err.status === 400 && err.details.field === 'file';

export type ScanPhase = 'idle' | 'scanning' | 'reading' | 'gaveUp';

/**
 * A card scan without a shutter, started by the student (« Scanner la carte »): while `active`, a still frame is
 * taken silently (no sound, no flash, never shown), sent to `attempt`, erased, and taken again until a card is read,
 * up to 6 tries; then « gaveUp » (scan again, or type the number). Back to « idle » when it ends or the camera hides.
 */
export function useAutoScan(camera: RefObject<CameraView | null>, active: boolean, attempt: ScanAttempt) {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  // 0: not started. Each « Scanner » press is a new run.
  const [run, setRun] = useState(0);
  // The latest handler, without restarting the loop each time the screen renders.
  const handler = useRef(attempt);
  useEffect(() => {
    handler.current = attempt;
  }, [attempt]);

  useEffect(() => {
    if (!active || !run) return;
    let stopped = false;
    const end = (next: ScanPhase) => {
      setPhase(next);
      setRun(0);
    };
    (async () => {
      await wait(FOCUS_MS);
      for (let i = 0; i < MAX_TRIES; i++) {
        if (stopped) return end('idle');
        const frame = await camera.current?.takePictureAsync({ quality: 0.6, shutterSound: false }).catch(() => null);
        if (stopped) {
          erase(frame?.uri);
          return end('idle');
        }
        // The camera wasn't ready yet: a moment, then the next try.
        if (!frame) {
          await wait(PAUSE_MS);
          continue;
        }
        setPhase('reading');
        let result: 'done' | 'retry' = 'retry';
        try {
          result = await handler.current(frame.uri);
        } catch {
          result = 'retry';
        } finally {
          erase(frame.uri);
        }
        if (stopped || result === 'done') return end('idle');
        setPhase('scanning');
        await wait(PAUSE_MS);
      }
      end(stopped ? 'idle' : 'gaveUp');
    })();
    return () => {
      stopped = true;
    };
  }, [active, run, camera]);

  return {
    phase,
    /** « Scanner la carte » / « Scanner encore »: a new round of tries. */
    start: () => {
      setPhase('scanning');
      setRun((r) => r + 1);
    },
  };
}

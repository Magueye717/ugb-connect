import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

// Heard at a scanner (the bus door, a shop counter): the verdict without looking at the screen. iOS mutes
// haptics while the camera runs, so the sound is the cue there. Short tones, made for the app.
const SOURCES = {
  success: require('@/assets/sounds/scan-ok.wav'),
  warning: require('@/assets/sounds/scan-warning.wav'),
  error: require('@/assets/sounds/scan-error.wav'),
} as const;
type Sound = keyof typeof SOURCES;

// One player per sound, made on first use and kept: a scanner plays them again and again.
const players: Partial<Record<Sound, AudioPlayer>> = {};
let modeSet = false;

function play(sound: Sound) {
  if (Platform.OS === 'web') return;
  try {
    if (!modeSet) {
      modeSet = true;
      // Heard with the ring switch on silent (it's feedback for a task, like a till's beep), on top of any music.
      setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    const player = (players[sound] ??= createAudioPlayer(SOURCES[sound]));
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // A sound is a bonus: never let it break a scan.
  }
}

export const sounds = {
  /** Valid: a ticket boarded, an order handed over. */
  success: () => play('success'),
  /** Look at the screen: already scanned, another departure. */
  warning: () => play('warning'),
  /** Refused: unknown code, not paid. */
  error: () => play('error'),
};

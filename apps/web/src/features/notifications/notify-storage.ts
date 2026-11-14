const IGNORE_EVERYONE_KEY = 'ping.notify.ignore-everyone';
const SOUND_KEY = 'ping.notify.sound';

const readFlag = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
};

const writeFlag = (key: string, value: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // localStorage bị chặn: bỏ qua.
  }
};

export const readIgnoreEveryone = () => readFlag(IGNORE_EVERYONE_KEY, false);
export const writeIgnoreEveryone = (value: boolean) => writeFlag(IGNORE_EVERYONE_KEY, value);

export const readSoundEnabled = () => readFlag(SOUND_KEY, true);
export const writeSoundEnabled = (value: boolean) => writeFlag(SOUND_KEY, value);

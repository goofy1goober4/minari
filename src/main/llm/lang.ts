// Single source of truth for the demo language. Switch via `MINARI_LANG=ko`.
// Mirrors model.ts: one env var, read once at startup.
//
// Default stays 'en'. The Windows demo build (아버지 데모) sets MINARI_LANG=ko
// in start-minari.bat, so the app default is left untouched.

export type Lang = 'en' | 'ko';

export const LANG: Lang = process.env.MINARI_LANG === 'ko' ? 'ko' : 'en';

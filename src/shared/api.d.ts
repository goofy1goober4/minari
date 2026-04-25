import type { BootState } from './snapshot';

declare global {
  interface Window {
    minari: {
      speak(): Promise<string>;
      setClickThrough(passThrough: boolean): void;
      getBirthState(): Promise<{ completed: boolean; nickname: string | null }>;
      completeBirth(nickname: string): Promise<{ nickname: string; firstFragment: string }>;
      getBootState(): Promise<BootState>;
      onPing(callback: (fragment: string) => void): () => void;
    };
  }
}

export {};

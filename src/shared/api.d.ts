import type { BootState, GrowthStage } from './snapshot';

export interface RecentMessage {
  role: 'user' | 'minari';
  content: string;
  createdAt: number;
}

declare global {
  interface Window {
    minari: {
      lang: 'en' | 'ko';
      pose: 'idle' | 'reading' | 'diary';
      scale: number;
      devtools: boolean;
      speak(): Promise<string>;
      setClickThrough(passThrough: boolean): void;
      moveWindow(dx: number, dy: number): void;
      getBirthState(): Promise<{ completed: boolean; nickname: string | null; petName: string | null }>;
      completeBirth(
        nickname: string,
        petName: string,
      ): Promise<{ nickname: string; petName: string; firstFragment: string }>;
      getBootState(): Promise<BootState>;
      onPing(callback: (fragment: string) => void): () => void;
      onCursor(callback: (pos: { x: number; y: number }) => void): () => void;
      onWordQuestion(
        callback: (payload: { wordId: number; question: string }) => void,
      ): () => void;
      onAlarm(
        callback: (payload: { kind: string; text: string; mood: string }) => void,
      ): () => void;
      giftImage(filePath: string): Promise<string>;
      getPathForFile(file: File): string;

      getStage(): Promise<GrowthStage>;
      converse(text: string): Promise<{ text: string; expectFollowup?: boolean }>;
      getRecentMessages(limit?: number): Promise<RecentMessage[]>;
      getRecentDiaries(limit?: number): Promise<string[]>;
      getCuriousPos(): Promise<{ x: number; y: number } | null>;
      setCuriousPos(x: number, y: number): void;
      getCuriousHistoryHeight(): Promise<number | null>;
      setCuriousHistoryHeight(h: number): void;
      getCharacterPos(): Promise<{ x: number; y: number } | null>;
      setCharacterPos(x: number, y: number): void;
      getVolume(): Promise<{ volume: number; muted: boolean }>;
      setVolume(volume: number, muted: boolean): void;
      quitApp(): void;
    };
  }
}

export {};

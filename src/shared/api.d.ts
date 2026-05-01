import type { BootState, GrowthStage } from './snapshot';

export interface RecentMessage {
  role: 'user' | 'minari';
  content: string;
  createdAt: number;
}

declare global {
  interface Window {
    minari: {
      speak(): Promise<string>;
      setClickThrough(passThrough: boolean): void;
      getBirthState(): Promise<{ completed: boolean; nickname: string | null; petName: string | null }>;
      completeBirth(
        nickname: string,
        petName: string,
      ): Promise<{ nickname: string; petName: string; firstFragment: string }>;
      getBootState(): Promise<BootState>;
      onPing(callback: (fragment: string) => void): () => void;
      giftImage(filePath: string): Promise<string>;
      getPathForFile(file: File): string;

      getStage(): Promise<GrowthStage>;
      converse(text: string): Promise<string>;
      getRecentMessages(limit?: number): Promise<RecentMessage[]>;
    };
  }
}

export {};

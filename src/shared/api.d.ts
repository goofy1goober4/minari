declare global {
  interface Window {
    minari: {
      speak(): Promise<string>;
      setClickThrough(passThrough: boolean): void;
    };
  }
}

export {};

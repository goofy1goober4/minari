import { Container } from 'pixi.js';
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism';
import { POSTURE_PRESETS, type PosturePreset } from './postures';

// Resolved against electron-vite's publicDir (assets/).
const MODEL_PATH = '/live2d/minari_live2d_parts_no_backpack_fresh_cubism.model3.json';

// Our minimal model3.json omits Groups / HitAreas / Motions because the .moc3
// has no keyforms yet. The vendored CubismFramework's settings parser pushes
// these slots into a fixed-index vector and later derefs without guards
// (e.g. inside isExistEyeBlinkParameters). Stub them so the loader runs to
// completion — remove once the model is fully rigged.
type Model3Json = {
  Version: number;
  FileReferences: Record<string, unknown>;
  Groups?: unknown[];
  HitAreas?: unknown[];
  url: string;
};

// Match the prior sprite render height so the existing hit-region math in
// index.ts (SPROUT_HIT_*) and the bubble offset stay correct.
export const SPRITE_HEIGHT = 135;
const MODEL_BASE_Y = 10;

export class Minari extends Container {
  private model: Live2DModel | null = null;
  private posture: PosturePreset = POSTURE_PRESETS.idle;

  constructor() {
    super();
    void this.loadModel();
  }

  private async loadModel(): Promise<void> {
    try {
      const res = await fetch(MODEL_PATH);
      if (!res.ok) throw new Error('fetch ' + MODEL_PATH + ' → ' + res.status);
      const json = (await res.json()) as Model3Json;
      json.url = MODEL_PATH;
      if (!Array.isArray(json.Groups)) json.Groups = [];
      if (!Array.isArray(json.HitAreas)) json.HitAreas = [];
      if (!('Motions' in json.FileReferences)) {
        (json.FileReferences as Record<string, unknown>).Motions = {};
      }

      const model = await Live2DModel.from(json, {
        autoFocus: false,
        autoHitTest: false,
      });
      // Bottom-centre pivot mirrors the prior sprite anchor so the existing
      // hit-region math in index.ts (SPROUT_HIT_*) stays valid.
      model.anchor.set(0.5, 1);
      model.y = MODEL_BASE_Y;
      const h = model.height || 1;
      const scale = SPRITE_HEIGHT / h;
      model.scale.set(scale);
      this.addChild(model);
      this.model = model;
      console.log(
        '[minari] live2d model loaded ' +
          model.width.toFixed(0) +
          'x' +
          h.toFixed(0) +
          ' → render scale=' +
          scale.toFixed(3),
      );
    } catch (err) {
      const stack = err instanceof Error ? err.stack : String(err);
      console.error('[minari] live2d model load failed: ' + stack);
    }
  }

  // Public API kept for the existing IPC / interaction wiring. Physics-driven
  // motion (breathe, nudge, startle, notice, leaf press, sway, posture,
  // stem/leaf grow) is disabled until the .moc3 has keyforms to drive — these
  // are intentional no-ops so call-sites in index.ts / runBirthScene /
  // runResumeScene don't need to change.
  nudge(): void {}
  startle(): void {}
  notice(): void {}
  setPosture(preset: PosturePreset): void {
    this.posture = preset;
  }
  setStemGrowth(_p: number): void {}
  setLeafUnfold(_p: number): void {}
  onPointerMove(_localX: number, _localY: number, _vx: number, _eventDt: number): void {}
  onPointerLeave(): void {}
  breathe(_deltaMS: number): void {}
}

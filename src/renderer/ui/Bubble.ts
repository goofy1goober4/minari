import { Container, Graphics, Text } from 'pixi.js';

const BG_COLOR = 0xfffbf3;
const BORDER_COLOR = 0xd9d1c3;
const TEXT_COLOR = 0x4a5a3d;
const PADDING_X = 12;
const PADDING_Y = 8;
const RADIUS = 10;
const FONT_SIZE = 14;

const FADE_IN_MS = 220;
const FADE_OUT_MS = 320;
const BASE_HOLD_MS = 2800;
const PER_CHAR_MS = 60;

type Phase = 'hidden' | 'in' | 'hold' | 'out';

export class Bubble extends Container {
  private bg: Graphics;
  private _label: Text;
  private phase: Phase = 'hidden';
  private phaseElapsed = 0;
  private holdDuration = 0;

  constructor() {
    super();
    this.visible = false;
    this.alpha = 0;

    this.bg = new Graphics();
    this._label = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, -apple-system, "Helvetica Neue", sans-serif',
        fontSize: FONT_SIZE,
        fill: TEXT_COLOR,
        align: 'center',
      },
    });
    this.addChild(this.bg, this._label);
  }

  show(text: string) {
    this._label.text = text;
    const w = Math.ceil(this._label.width) + PADDING_X * 2;
    const h = Math.ceil(this._label.height) + PADDING_Y * 2;
    this._label.x = PADDING_X;
    this._label.y = PADDING_Y;

    this.bg
      .clear()
      .roundRect(0, 0, w, h, RADIUS)
      .fill(BG_COLOR)
      .stroke({ width: 1, color: BORDER_COLOR, alpha: 0.8 });

    this.pivot.set(w / 2, h);

    this.holdDuration = BASE_HOLD_MS + text.length * PER_CHAR_MS;
    this.phase = 'in';
    this.phaseElapsed = 0;
    this.visible = true;
  }

  dismiss() {
    if (this.phase === 'hidden' || this.phase === 'out') return;
    this.phase = 'out';
    this.phaseElapsed = 0;
  }

  isVisible(): boolean {
    return this.phase !== 'hidden';
  }

  update(deltaMS: number) {
    if (this.phase === 'hidden') return;
    this.phaseElapsed += deltaMS;

    if (this.phase === 'in') {
      const p = Math.min(1, this.phaseElapsed / FADE_IN_MS);
      const eased = easeOutCubic(p);
      this.alpha = eased;
      this.scale.set(0.92 + 0.08 * eased);
      if (p >= 1) {
        this.phase = 'hold';
        this.phaseElapsed = 0;
      }
    } else if (this.phase === 'hold') {
      this.alpha = 1;
      this.scale.set(1);
      if (this.phaseElapsed >= this.holdDuration) {
        this.phase = 'out';
        this.phaseElapsed = 0;
      }
    } else if (this.phase === 'out') {
      const p = Math.min(1, this.phaseElapsed / FADE_OUT_MS);
      this.alpha = 1 - easeOutCubic(p);
      if (p >= 1) {
        this.phase = 'hidden';
        this.visible = false;
        this._label.text = '';
      }
    }
  }
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

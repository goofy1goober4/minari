// "Dewdrop" speech bubble — DOM overlay so we get backdrop-filter, soft
// shadows, and the inner-light feel CSS handles cleanly. The renderer keeps
// its old Pixi-shaped contract: x/y in canvas-pixel coords (== CSS pixels at
// 1:1), update(dt) drives the phase machine, show()/dismiss()/isVisible()/
// getBounds() match the Container-based version so callers don't change.

import { playMumble, type VoiceProfile } from '../sound/mumble';

const PADDING_X = 12;
const PADDING_Y = 8;
const FONT_SIZE = 14;

const FADE_IN_MS = 220;
const FADE_OUT_MS = 320;
const BASE_HOLD_MS = 2800;
const PER_CHAR_MS = 60;

type Phase = 'hidden' | 'in' | 'hold' | 'out';

export class Bubble {
  // Caller-set position: bottom-centre anchor of the bubble in window-CSS px.
  x = 0;
  y = 0;

  private el: HTMLDivElement;
  private voice: VoiceProfile | null = null;
  private phase: Phase = 'hidden';
  private phaseElapsed = 0;
  private holdDuration = 0;

  constructor() {
    injectStylesOnce();
    this.el = document.createElement('div');
    this.el.className = 'minari-bubble';
    this.el.style.opacity = '0';
    document.body.appendChild(this.el);
  }

  setVoice(profile: VoiceProfile | null) {
    this.voice = profile;
  }

  show(text: string) {
    console.log(
      '[bubble] show ' + JSON.stringify(text) + ' voice=' + (this.voice ? 'set' : 'null'),
    );
    this.el.textContent = text;
    // Force layout so width/height are final before we anchor bottom-centre.
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.el.style.left = (this.x - w / 2) + 'px';
    this.el.style.top = (this.y - h) + 'px';
    this.holdDuration = BASE_HOLD_MS + text.length * PER_CHAR_MS;
    this.phase = 'in';
    this.phaseElapsed = 0;
    if (this.voice) playMumble(text, this.voice);
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
      this.applyAnim(eased, 0.92 + 0.08 * eased);
      if (p >= 1) {
        this.phase = 'hold';
        this.phaseElapsed = 0;
      }
    } else if (this.phase === 'hold') {
      this.applyAnim(1, 1);
      if (this.phaseElapsed >= this.holdDuration) {
        this.phase = 'out';
        this.phaseElapsed = 0;
      }
    } else if (this.phase === 'out') {
      const p = Math.min(1, this.phaseElapsed / FADE_OUT_MS);
      const eased = easeOutCubic(p);
      this.applyAnim(1 - eased, 1);
      if (p >= 1) {
        this.phase = 'hidden';
        this.el.textContent = '';
        this.el.style.opacity = '0';
      }
    }
  }

  // Pixi-shaped Rectangle clone so the renderer's hit-test code keeps working.
  getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const r = this.el.getBoundingClientRect();
    return { minX: r.left, maxX: r.right, minY: r.top, maxY: r.bottom };
  }

  private applyAnim(opacity: number, scale: number) {
    this.el.style.opacity = String(opacity);
    this.el.style.transform = 'scale(' + scale.toFixed(3) + ')';
  }
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

let stylesInjected = false;
function injectStylesOnce() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .minari-bubble {
      position: fixed;
      left: 0;
      top: 0;
      pointer-events: none;
      user-select: none;
      z-index: 1100;
      transform-origin: 50% 100%;

      /* mint-teal tinted glass */
      background: rgba(230, 245, 240, 0.7);
      backdrop-filter: blur(10px) saturate(1.1);
      -webkit-backdrop-filter: blur(10px) saturate(1.1);

      /* Single quiet border + inset top highlight gives a top-bright /
         bottom-fade gradient feel that survives the rounded corners
         (border-image flattens them). */
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 20px;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.55),
        inset 0 1px 2px rgba(255, 255, 255, 0.4),
        0 2px 8px rgba(0, 0, 0, 0.08);

      padding: ${PADDING_Y}px ${PADDING_X + 2}px;
      color: #4a5a3d;
      font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif;
      font-size: ${FONT_SIZE}px;
      line-height: 1.2;
      white-space: nowrap;
    }

    /* Upper-30% sheen — the light spot on a dewdrop. */
    .minari-bubble::before {
      content: '';
      position: absolute;
      inset: 1px 1px 70% 1px;
      border-radius: 19px 19px 4px 4px;
      background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.28) 0%,
        rgba(255, 255, 255, 0.06) 70%,
        rgba(255, 255, 255, 0) 100%
      );
      pointer-events: none;
    }

  `;
  document.head.appendChild(style);
}

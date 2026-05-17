const DEFAULT_MAX_LEN = 20;
const DEFAULT_SUBMIT_LABEL = 'ok';
// Movement past this (px) turns a press into a drag — below it, a click on
// the card still behaves as a plain click. Matches CuriousPrompt's DRAG_TOL_PX.
const DRAG_TOL_PX = 4;

// Last dragged position, remembered for the rest of the session so the second
// birth prompt (pet name) reappears where the user left the first one.
let lastPos: { x: number; y: number } | null = null;

export interface NicknamePromptOptions {
  question: string;
  placeholder: string;
  submitLabel?: string;
  maxLen?: number;
  // Minari's position — first-open placement sits the card to her left.
  anchor?: { x: number; y: number };
}

export class NicknamePrompt {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private button: HTMLButtonElement;
  private resolver: ((value: string) => void) | null = null;
  private submitHandler: () => void;
  private keyHandler: (e: KeyboardEvent) => void;
  // Window click-through follows the cursor — over the card it captures
  // clicks, off it passes through — so the prompt overlays without blocking
  // the desktop. `passThrough` dedupes the IPC.
  private hoverHandler: (e: PointerEvent) => void;
  private passThrough: boolean | null = null;

  // Drag state — see onDragStart. Position is (left, bottom-from-window-bottom).
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private elStartLeft = 0;
  private elStartBottom = 0;
  private posX: number | null = null;
  private posY: number | null = null;
  private readonly anchor: { x: number; y: number } | null;

  constructor(options: NicknamePromptOptions) {
    const maxLen = options.maxLen ?? DEFAULT_MAX_LEN;
    const submitLabel = options.submitLabel ?? DEFAULT_SUBMIT_LABEL;
    this.anchor = options.anchor ?? null;

    this.el = document.createElement('div');
    this.el.className = 'minari-nickname-prompt';
    this.el.innerHTML = `
      <div class="minari-nickname-card">
        <div class="minari-nickname-question"></div>
        <form class="minari-nickname-row">
          <input
            type="text"
            class="minari-nickname-input"
            maxlength="${maxLen}"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="submit" class="minari-nickname-submit"></button>
        </form>
      </div>
    `;
    injectStylesOnce();

    const question = this.el.querySelector('.minari-nickname-question') as HTMLDivElement;
    const form = this.el.querySelector('form') as HTMLFormElement;
    this.input = this.el.querySelector('input') as HTMLInputElement;
    this.button = this.el.querySelector('button') as HTMLButtonElement;

    question.textContent = options.question;
    this.input.placeholder = options.placeholder;
    this.button.textContent = submitLabel;
    this.button.disabled = true;

    this.input.addEventListener('input', () => {
      this.button.disabled = this.input.value.trim().length === 0;
    });

    this.submitHandler = () => {
      const value = this.input.value.trim();
      if (!value || !this.resolver) return;
      const r = this.resolver;
      this.resolver = null;
      r(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitHandler();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitHandler();
      }
    };
    this.input.addEventListener('keydown', this.keyHandler);

    // Drag the card by its chrome; the input and button keep their own
    // pointer behaviour (text caret / click) by swallowing the event.
    this.el.addEventListener('pointerdown', (e) => this.onDragStart(e));
    this.input.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Cursor over the card → window captures clicks; off it → pass-through.
    this.hoverHandler = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      const over =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom;
      this.setPassThrough(!over);
    };
  }

  mount(parent: HTMLElement = document.body) {
    parent.appendChild(this.el);
    // Start interactive; the hover handler flips to pass-through as soon as
    // the cursor moves off the card. macOS forwards hover even while the
    // window is click-through, so the cursor can always re-enter the card.
    this.setPassThrough(false);
    document.addEventListener('pointermove', this.hoverHandler);
    requestAnimationFrame(() => {
      // Reuse the dragged spot; else sit to Minari's left like the curious
      // prompt; else fall back to bottom-centre.
      if (lastPos) {
        this.applyPosition(lastPos.x, lastPos.y);
      } else if (this.anchor) {
        const PET_HALF_W = 70;
        const GAP = 24;
        this.applyPosition(
          this.anchor.x - PET_HALF_W - GAP - this.el.offsetWidth,
          window.innerHeight - this.anchor.y + 40,
        );
      } else {
        this.applyPosition((window.innerWidth - this.el.offsetWidth) / 2, 16);
      }
      this.el.classList.add('is-visible');
      this.input.focus();
    });
  }

  awaitInput(): Promise<string> {
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  setBusy(busy: boolean) {
    this.input.disabled = busy;
    this.button.disabled = busy || this.input.value.trim().length === 0;
  }

  async dismiss(): Promise<void> {
    document.removeEventListener('pointermove', this.hoverHandler);
    // Hand the window back to full pass-through as the prompt leaves.
    window.minari.setClickThrough(true);
    this.el.classList.remove('is-visible');
    await new Promise((r) => setTimeout(r, 220));
    this.el.remove();
  }

  // IPC the window click-through state only on an actual change.
  private setPassThrough(on: boolean): void {
    if (on === this.passThrough) return;
    this.passThrough = on;
    window.minari.setClickThrough(on);
  }

  // ── Drag ───────────────────────────────────────────────────────────────
  // Ported from CuriousPrompt.onDragStart — same press-then-move arming and
  // (left, bottom-from-window-bottom) coordinate model.
  private onDragStart(e: PointerEvent) {
    if (e.button !== 0) return;
    this.dragging = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    const rect = this.el.getBoundingClientRect();
    this.elStartLeft = rect.left;
    this.elStartBottom = window.innerHeight - rect.bottom;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - this.dragStartX;
      const dy = ev.clientY - this.dragStartY;
      if (!this.dragging && dx * dx + dy * dy > DRAG_TOL_PX * DRAG_TOL_PX) {
        this.dragging = true;
        this.el.classList.add('is-dragging');
      }
      if (this.dragging) {
        // dy positive (cursor moved down) → bottom-distance decreases.
        this.applyPosition(this.elStartLeft + dx, this.elStartBottom - dy);
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (this.dragging) {
        this.dragging = false;
        this.el.classList.remove('is-dragging');
        if (this.posX !== null && this.posY !== null) {
          lastPos = { x: this.posX, y: this.posY };
        }
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // x: left from window left. y: bottom-distance from window bottom.
  private applyPosition(x: number, y: number) {
    const margin = 4;
    const maxX = Math.max(margin, window.innerWidth - this.el.offsetWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - this.el.offsetHeight - margin);
    const cx = Math.max(margin, Math.min(maxX, x));
    const cy = Math.max(margin, Math.min(maxY, y));
    this.posX = cx;
    this.posY = cy;
    this.el.style.left = cx + 'px';
    this.el.style.bottom = cy + 'px';
    this.el.style.right = 'auto';
    this.el.style.top = 'auto';
  }
}

let stylesInjected = false;
function injectStylesOnce() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  // Frutiger Aero glass surface — shares the palette + glass treatment of
  // CuriousPrompt so the D+0 birth UI matches the curious-stage input.
  style.textContent = `
    .minari-nickname-prompt {
      position: fixed;
      bottom: 16px;
      transform: translateY(8px);
      opacity: 0;
      transition: opacity 240ms ease-out, transform 240ms ease-out;
      pointer-events: auto;
      z-index: 1000;
      cursor: grab;
    }
    .minari-nickname-prompt.is-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .minari-nickname-prompt.is-dragging {
      cursor: grabbing;
      transition: opacity 240ms ease-out;
    }
    .minari-nickname-card {
      background: rgba(248, 252, 255, 0.85);
      border: 1px solid rgba(220, 236, 245, 0.85);
      border-radius: 18px;
      padding: 14px 16px 13px;
      box-shadow:
        0 4px 14px rgba(53, 84, 104, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(14px) saturate(1.2);
      -webkit-backdrop-filter: blur(14px) saturate(1.2);
      font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif;
      color: #355468;
      min-width: 248px;
    }
    .minari-nickname-question {
      font-size: 13px;
      margin-bottom: 10px;
      opacity: 0.85;
    }
    .minari-nickname-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .minari-nickname-input {
      flex: 1;
      min-width: 0;
      box-sizing: border-box;
      font: inherit;
      font-size: 14px;
      color: #355468;
      background: rgba(248, 252, 255, 0.85);
      border: 1px solid rgba(215, 234, 244, 0.9);
      border-radius: 22px;
      padding: 8px 14px;
      outline: none;
      cursor: text;
      box-shadow:
        0 2px 8px rgba(53, 84, 104, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(14px) saturate(1.2);
      -webkit-backdrop-filter: blur(14px) saturate(1.2);
      transition: border-color 300ms ease-out, box-shadow 300ms ease-out;
    }
    .minari-nickname-input::placeholder {
      color: #97ADBC;
    }
    .minari-nickname-input:focus {
      border-color: #8EC5EA;
      box-shadow:
        0 0 0 3px rgba(221, 245, 234, 0.6),
        0 2px 8px rgba(53, 84, 104, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
    }
    .minari-nickname-input:disabled {
      opacity: 0.6;
    }
    .minari-nickname-submit {
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      color: #355468;
      background: linear-gradient(135deg, #8EC5EA, #DDF5EA);
      border: 1px solid rgba(215, 234, 244, 0.9);
      border-radius: 999px;
      padding: 8px 16px;
      cursor: pointer;
      box-shadow:
        0 2px 8px rgba(53, 84, 104, 0.10),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
      transition: filter 200ms ease-out, opacity 200ms ease-out;
    }
    .minari-nickname-submit:hover:not(:disabled) {
      filter: brightness(1.06);
    }
    .minari-nickname-submit:disabled {
      opacity: 0.45;
      cursor: default;
    }
  `;
  document.head.appendChild(style);
}

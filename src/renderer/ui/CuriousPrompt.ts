// Curious-stage text-input overlay.
// Long-press on Minari opens this. Same DOM-overlay pattern as
// birth/NicknamePrompt — slides up from below the sprout, transparent
// elsewhere, unmounts on dismiss().

const PLACEHOLDER = '...';
const MAX_LEN = 200;
const HISTORY_LIMIT = 16;
// Outside/blur cancellation only arms after this window. When word-question
// auto-opens the prompt the OS may not yet have given the Minari window
// focus, so the very first blur tick would otherwise dismiss us before the
// user can type.
const ARM_GRACE_MS = 700;

interface HistoryRow {
  role: 'user' | 'minari';
  content: string;
}

export interface CuriousPromptDeps {
  fetchHistory: () => Promise<HistoryRow[]>;
}

export class CuriousPrompt {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private ejectBtn: HTMLButtonElement;
  private historyPanel: HTMLDivElement;
  private deps: CuriousPromptDeps;
  private resolver: ((value: string | null) => void) | null = null;
  private historyOpen = false;
  private keyHandler: (e: KeyboardEvent) => void;
  private outsideHandler: (e: PointerEvent) => void;
  private blurHandler: () => void;
  private armTimer: ReturnType<typeof setTimeout> | null = null;
  private armed = false;

  constructor(deps: CuriousPromptDeps) {
    this.deps = deps;
    this.el = document.createElement('div');
    this.el.className = 'minari-curious';
    this.el.innerHTML = `
      <div class="minari-curious-card">
        <div class="minari-curious-history" hidden></div>
        <form class="minari-curious-row">
          <button type="button" class="minari-curious-eject" title="이전 대화">⏏</button>
          <input
            type="text"
            class="minari-curious-input"
            maxlength="${MAX_LEN}"
            autocomplete="off"
            spellcheck="false"
          />
        </form>
      </div>
    `;
    injectStylesOnce();

    this.input = this.el.querySelector('input') as HTMLInputElement;
    this.ejectBtn = this.el.querySelector('.minari-curious-eject') as HTMLButtonElement;
    this.historyPanel = this.el.querySelector('.minari-curious-history') as HTMLDivElement;
    const form = this.el.querySelector('form') as HTMLFormElement;

    this.input.placeholder = PLACEHOLDER;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    this.ejectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      void this.toggleHistory();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
      }
    };
    this.input.addEventListener('keydown', this.keyHandler);

    // Click outside the card (but inside our window) → cancel.
    this.outsideHandler = (e: PointerEvent) => {
      if (!this.resolver || !this.armed) return;
      const target = e.target as Node | null;
      if (target && this.el.contains(target)) return;
      this.cancel();
    };

    // Click outside our window entirely → the BrowserWindow loses OS focus
    // and the renderer fires a DOM blur. Treat it the same as outside-click.
    this.blurHandler = () => {
      if (!this.resolver || !this.armed) return;
      this.cancel();
    };
  }

  mount(parent: HTMLElement = document.body) {
    parent.appendChild(this.el);
    requestAnimationFrame(() => {
      this.el.classList.add('is-visible');
      this.input.focus();
      document.addEventListener('pointerdown', this.outsideHandler);
      window.addEventListener('blur', this.blurHandler);
      // Arm cancel-on-outside only after a short settle window — see
      // ARM_GRACE_MS comment.
      this.armTimer = setTimeout(() => {
        this.armed = true;
        this.armTimer = null;
        this.input.focus();
      }, ARM_GRACE_MS);
    });
  }

  awaitSubmit(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  setBusy(busy: boolean) {
    this.input.disabled = busy;
    this.ejectBtn.disabled = busy;
  }

  async dismiss(): Promise<void> {
    if (this.armTimer) {
      clearTimeout(this.armTimer);
      this.armTimer = null;
    }
    this.armed = false;
    document.removeEventListener('pointerdown', this.outsideHandler);
    window.removeEventListener('blur', this.blurHandler);
    this.el.classList.remove('is-visible');
    await new Promise((r) => setTimeout(r, 200));
    this.el.remove();
  }

  private submit() {
    const value = this.input.value.trim();
    if (!value || !this.resolver) return;
    const r = this.resolver;
    this.resolver = null;
    r(value);
  }

  private cancel() {
    if (!this.resolver) return;
    const r = this.resolver;
    this.resolver = null;
    r(null);
  }

  private async toggleHistory() {
    if (this.historyOpen) {
      this.historyPanel.hidden = true;
      this.historyPanel.innerHTML = '';
      this.historyOpen = false;
      return;
    }
    this.historyOpen = true;
    this.historyPanel.hidden = false;
    this.historyPanel.innerHTML =
      '<div class="minari-curious-history-empty">...</div>';
    try {
      const rows = await this.deps.fetchHistory();
      this.renderHistory(rows.slice(-HISTORY_LIMIT));
    } catch (err) {
      console.error('[curious] history fetch failed:', err);
      this.historyPanel.innerHTML =
        '<div class="minari-curious-history-empty">...</div>';
    }
  }

  private renderHistory(rows: HistoryRow[]) {
    if (rows.length === 0) {
      this.historyPanel.innerHTML =
        '<div class="minari-curious-history-empty">아직 대화가 없어.</div>';
      return;
    }
    const lines = rows
      .map((r) => {
        const cls = r.role === 'minari' ? 'msg-minari' : 'msg-user';
        const text = escapeHtml(r.content);
        return `<div class="minari-curious-msg ${cls}">${text}</div>`;
      })
      .join('');
    this.historyPanel.innerHTML = lines;
    this.historyPanel.scrollTop = this.historyPanel.scrollHeight;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let stylesInjected = false;
function injectStylesOnce() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .minari-curious {
      position: fixed;
      left: 50%;
      bottom: 40px;
      transform: translateX(-50%) translateY(8px);
      opacity: 0;
      transition: opacity 200ms ease-out, transform 200ms ease-out;
      pointer-events: auto;
      z-index: 1000;
      width: 280px;
    }
    .minari-curious.is-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .minari-curious-card {
      background: #fffbf3;
      border: 1px solid #d9d1c3;
      border-radius: 14px;
      box-shadow: 0 6px 20px rgba(74, 90, 61, 0.12);
      font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif;
      color: #4a5a3d;
      overflow: hidden;
    }
    .minari-curious-history {
      max-height: 140px;
      overflow-y: auto;
      padding: 10px 12px;
      border-bottom: 1px solid #ece5d4;
      font-size: 12px;
      line-height: 1.5;
    }
    .minari-curious-history[hidden] {
      display: none;
    }
    .minari-curious-history-empty {
      opacity: 0.5;
      text-align: center;
      padding: 8px 0;
    }
    .minari-curious-msg {
      padding: 2px 0;
      word-break: break-word;
    }
    .minari-curious-msg.msg-minari {
      color: #4a5a3d;
    }
    .minari-curious-msg.msg-minari::before {
      content: '· ';
      opacity: 0.5;
    }
    .minari-curious-msg.msg-user {
      color: #6b6256;
    }
    .minari-curious-msg.msg-user::before {
      content: '› ';
      opacity: 0.5;
    }
    .minari-curious-row {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 8px 10px;
    }
    .minari-curious-eject {
      font: inherit;
      font-size: 13px;
      color: #6b6256;
      background: transparent;
      border: 1px solid #d9d1c3;
      border-radius: 8px;
      padding: 4px 8px;
      cursor: pointer;
      transition: background 120ms ease-out, border-color 120ms ease-out;
      line-height: 1;
    }
    .minari-curious-eject:hover:not(:disabled) {
      background: #f6f0e2;
      border-color: #c9bfaa;
    }
    .minari-curious-eject:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .minari-curious-input {
      flex: 1;
      font: inherit;
      font-size: 14px;
      color: #4a5a3d;
      background: #f6f0e2;
      border: 1px solid #d9d1c3;
      border-radius: 8px;
      padding: 6px 10px;
      outline: none;
      transition: border-color 120ms ease-out;
    }
    .minari-curious-input::placeholder {
      color: #b5ac99;
    }
    .minari-curious-input:focus {
      border-color: #9bbf7d;
    }
    .minari-curious-input:disabled {
      opacity: 0.6;
    }
  `;
  document.head.appendChild(style);
}

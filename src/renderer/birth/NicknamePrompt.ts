const DEFAULT_MAX_LEN = 20;
const DEFAULT_SUBMIT_LABEL = '응';

export interface NicknamePromptOptions {
  question: string;
  placeholder: string;
  submitLabel?: string;
  maxLen?: number;
}

export class NicknamePrompt {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private button: HTMLButtonElement;
  private resolver: ((value: string) => void) | null = null;
  private submitHandler: () => void;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(options: NicknamePromptOptions) {
    const maxLen = options.maxLen ?? DEFAULT_MAX_LEN;
    const submitLabel = options.submitLabel ?? DEFAULT_SUBMIT_LABEL;

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
  }

  mount(parent: HTMLElement = document.body) {
    parent.appendChild(this.el);
    requestAnimationFrame(() => {
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
    this.el.classList.remove('is-visible');
    await new Promise((r) => setTimeout(r, 220));
    this.el.remove();
  }
}

let stylesInjected = false;
function injectStylesOnce() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .minari-nickname-prompt {
      position: fixed;
      left: 50%;
      bottom: 12px;
      transform: translateX(-50%) translateY(8px);
      opacity: 0;
      transition: opacity 220ms ease-out, transform 220ms ease-out;
      pointer-events: auto;
      z-index: 1000;
    }
    .minari-nickname-prompt.is-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .minari-nickname-card {
      background: #fffbf3;
      border: 1px solid #d9d1c3;
      border-radius: 14px;
      padding: 14px 16px 12px;
      box-shadow: 0 6px 20px rgba(74, 90, 61, 0.12);
      font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif;
      color: #4a5a3d;
      min-width: 240px;
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
    .minari-nickname-input:focus {
      border-color: #9bbf7d;
    }
    .minari-nickname-input:disabled {
      opacity: 0.6;
    }
    .minari-nickname-submit {
      font: inherit;
      font-size: 13px;
      color: #fffbf3;
      background: #9bbf7d;
      border: none;
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
      transition: background 120ms ease-out, opacity 120ms ease-out;
    }
    .minari-nickname-submit:hover:not(:disabled) {
      background: #8fb36d;
    }
    .minari-nickname-submit:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `;
  document.head.appendChild(style);
}

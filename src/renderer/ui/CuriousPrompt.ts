// Curious-stage text input — three independent glass-tinted elements
// (eject button, history panel, input field) stacked in a draggable container.
// Long-press on Minari mounts this overlay; submitting / Esc / outside-click
// dismisses it. Position persists across sessions via IPC state.
import { setGlobalVolume, setGlobalMuted } from '../sound/mumble';

const PLACEHOLDER = '...';
const MAX_LEN = 200;
const HISTORY_LIMIT = 16;
// Outside/blur cancellation only arms after this window. When word-question
// auto-opens the prompt the OS may not yet have given the Minari window
// focus, so the very first blur tick would otherwise dismiss us before the
// user can type.
const ARM_GRACE_MS = 700;
const DRAG_TOL_PX = 4;
const EJECT_LONGPRESS_MS = 500;
// Hover tooltips on the ⏏ / ♪ / ⌽ controls — a 400 ms dwell before the label
// appears (so a passing cursor doesn't flash it), then it auto-dismisses
// 700 ms later even if the cursor stays put. Unlike the over-Minari hover
// hints there's no show-count cap: the labels stay available on every hover.
const BTN_TOOLTIP_DELAY_MS = 400;
const BTN_TOOLTIP_HOLD_MS = 700;
// Asymmetric fade: a snappy fade-in, then a gentle, slower fade-out so the
// label drifts away rather than blinking off.
const BTN_TOOLTIP_FADE_IN_MS = 140;
const BTN_TOOLTIP_FADE_OUT_MS = 450;

interface HistoryRow {
  role: 'user' | 'minari';
  content: string;
}

export interface CuriousPromptDeps {
  fetchHistory: () => Promise<HistoryRow[]>;
  // Minari's current position (centre-x, feet-y in window coords) — used to
  // place the prompt to her left on first open, before any saved drag.
  petAnchor: () => { x: number; y: number };
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

  // Drag state. Position is stored as (left, bottom-from-window-bottom) so the
  // input row stays anchored to the bottom of the container and the history
  // panel grows upward when toggled instead of pushing the row down.
  private dragging = false;
  private dragArmed = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private elStartLeft = 0;
  private elStartBottom = 0;
  private posX: number | null = null;
  private posY: number | null = null;

  // Expanded menu (♪ / ⌽ / volume) + mute state.
  private menuEl: HTMLDivElement;
  private closeBtn: HTMLButtonElement;
  private volBtn: HTMLButtonElement;
  private volBar: HTMLDivElement;
  private volFill: HTMLDivElement;
  private confirmEl: HTMLDivElement;
  private menuExpanded = false;
  private volBarOpen = false;
  private muted = false;
  private volume = 1;
  private ejectLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  private ejectLongPressFired = false;

  // Custom hover tooltips for the ⏏ / ♪ / ⌽ controls — one shared bubble.
  // `tooltipTimer` is the dwell-before-show timer; `tooltipHideTimer` is the
  // auto-dismiss timer started once the label is visible.
  private tooltipEl: HTMLDivElement;
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: CuriousPromptDeps) {
    this.deps = deps;
    const isKo = window.minari.lang === 'ko';
    this.el = document.createElement('div');
    this.el.className = 'minari-curious';
    this.el.innerHTML = `
      <div class="minari-curious-history" hidden>
        <div class="minari-curious-history-resize" title="Resize"></div>
        <div class="minari-curious-history-scroll"></div>
      </div>
      <form class="minari-curious-row">
        <input
          type="text"
          class="minari-curious-input"
          maxlength="${MAX_LEN}"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="minari-curious-eject">⏏</button>
      </form>
      <div class="minari-curious-menu" hidden>
        <button type="button" class="minari-curious-close"></button>
        <div class="minari-curious-vol-row">
          <div class="minari-curious-vol-bar" hidden>
            <div class="minari-curious-vol-fill"></div>
          </div>
          <button type="button" class="minari-curious-vol"></button>
        </div>
      </div>
      <div class="minari-curious-confirm" hidden>
        <div class="minari-curious-confirm-msg">${isKo ? '미나리 끌까?' : 'Quit Minari?'}</div>
        <div class="minari-curious-confirm-actions">
          <button type="button" class="minari-curious-confirm-yes">${isKo ? '응' : 'Yes'}</button>
          <button type="button" class="minari-curious-confirm-no">${isKo ? '아니' : 'No'}</button>
        </div>
      </div>
    `;
    injectStylesOnce();

    this.input = this.el.querySelector('input') as HTMLInputElement;
    this.ejectBtn = this.el.querySelector('.minari-curious-eject') as HTMLButtonElement;
    this.historyPanel = this.el.querySelector('.minari-curious-history') as HTMLDivElement;
    this.menuEl = this.el.querySelector('.minari-curious-menu') as HTMLDivElement;
    this.closeBtn = this.el.querySelector('.minari-curious-close') as HTMLButtonElement;
    this.volBtn = this.el.querySelector('.minari-curious-vol') as HTMLButtonElement;
    this.volBar = this.el.querySelector('.minari-curious-vol-bar') as HTMLDivElement;
    this.volFill = this.el.querySelector('.minari-curious-vol-fill') as HTMLDivElement;
    this.confirmEl = this.el.querySelector('.minari-curious-confirm') as HTMLDivElement;
    const form = this.el.querySelector('form') as HTMLFormElement;

    this.input.placeholder = PLACEHOLDER;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    // ⏏ — short click toggles history; long press toggles the menu.
    this.ejectBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.ejectLongPressFired = false;
      if (this.ejectLongPressTimer) clearTimeout(this.ejectLongPressTimer);
      this.ejectLongPressTimer = setTimeout(() => {
        this.ejectLongPressTimer = null;
        this.ejectLongPressFired = true;
        this.toggleMenu();
      }, EJECT_LONGPRESS_MS);
    });
    const cancelEjectLongPress = () => {
      if (this.ejectLongPressTimer) {
        clearTimeout(this.ejectLongPressTimer);
        this.ejectLongPressTimer = null;
      }
    };
    this.ejectBtn.addEventListener('pointerup', cancelEjectLongPress);
    this.ejectBtn.addEventListener('pointercancel', cancelEjectLongPress);
    this.ejectBtn.addEventListener('pointerleave', cancelEjectLongPress);
    this.ejectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.ejectLongPressFired) {
        this.ejectLongPressFired = false;
        return;
      }
      void this.toggleHistory();
    });

    // ♪ — short click toggles mute and opens volume bar.
    this.volBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMute();
      this.openVolumeBar();
    });

    // ⌽ — show confirm dialog.
    this.closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showConfirm();
    });
    (this.el.querySelector('.minari-curious-confirm-yes') as HTMLButtonElement)
      .addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.minari.quitApp();
      });
    (this.el.querySelector('.minari-curious-confirm-no') as HTMLButtonElement)
      .addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideConfirm();
      });

    // Volume bar drag.
    this.volBar.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.startVolumeDrag(e);
    });

    // Hover tooltips — one shared bubble, repositioned per control. The native
    // `title` attributes are dropped above so these don't double up.
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'minari-curious-tooltip';
    document.body.appendChild(this.tooltipEl);
    this.attachTooltip(
      this.ejectBtn,
      isKo ? '기록 · 꾹 누르면 소리·끄기' : 'History · hold for volume & quit',
    );
    this.attachTooltip(this.volBtn, isKo ? '소리' : 'Volume');
    this.attachTooltip(this.closeBtn, isKo ? '끄기' : 'Quit');

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

    // Children stop propagation on pointerdown so their own clicks / text
    // selection work without triggering the container drag.
    for (const child of [
      this.input,
      this.historyPanel,
      this.menuEl,
      this.confirmEl,
    ] as HTMLElement[]) {
      child.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    // ⏏ long-press menu (volume / quit) auto-closes once the user turns back
    // to the conversation — typing, clicking the input, or clicking history.
    this.input.addEventListener('input', () => this.closeMenu());
    this.input.addEventListener('pointerdown', () => this.closeMenu());
    this.historyPanel.addEventListener('pointerdown', () => this.closeMenu());

    // Scroll-driven fade for the history scrollbar: visible while scrolling,
    // fades away after a short idle window. Hover keeps it visible (CSS).
    const scrollEl = this.historyPanel.querySelector('.minari-curious-history-scroll') as HTMLDivElement;
    let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
    scrollEl.addEventListener('scroll', () => {
      scrollEl.classList.add('is-scrolling');
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(() => {
        scrollEl.classList.remove('is-scrolling');
        scrollIdleTimer = null;
      }, 700);
    });

    // Resize handle on top edge of history panel — drag up to grow, down to
    // shrink. Stops drag propagation so it doesn't move the whole UI.
    const resizeEl = this.historyPanel.querySelector('.minari-curious-history-resize') as HTMLDivElement;
    resizeEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.startHistoryResize(e, scrollEl);
    });

    // Drag from anywhere on the container that isn't an interactive child.
    this.el.addEventListener('pointerdown', (e) => this.onDragStart(e));

    // Click outside the card (but inside our window) → cancel.
    this.outsideHandler = (e: PointerEvent) => {
      if (!this.resolver || !this.armed) return;
      // Suppress while dragging — releasing pointer at end of drag fires its
      // own click events that would otherwise dismiss us.
      if (this.dragging) return;
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
    const scrollEl = this.historyPanel.querySelector('.minari-curious-history-scroll') as HTMLDivElement;
    void Promise.all([
      window.minari.getCuriousPos().catch(() => null),
      window.minari.getCuriousHistoryHeight().catch(() => null),
      window.minari.getVolume().catch(() => ({ volume: 1, muted: false })),
    ]).then(([pos, h, vol]) => {
      if (pos) this.applyPosition(pos.x, pos.y);
      else this.applyInitialPosition();
      if (h && h > 60) scrollEl.style.maxHeight = h + 'px';
      this.volume = vol.volume;
      this.muted = vol.muted;
      this.applyVolumeToAudio();
      this.refreshVolumeUI();
      requestAnimationFrame(() => {
        this.el.classList.add('is-visible');
        this.input.focus();
        document.addEventListener('pointerdown', this.outsideHandler);
        window.addEventListener('blur', this.blurHandler);
        this.armTimer = setTimeout(() => {
          this.armed = true;
          this.armTimer = null;
          this.input.focus();
        }, ARM_GRACE_MS);
      });
    });
  }

  clearInput() {
    this.input.value = '';
    this.input.focus();
  }

  // Re-fetch and render history. No-op if the panel is closed (history will
  // load fresh next time the user opens it).
  async refreshHistory() {
    if (!this.historyOpen) return;
    const scrollEl = this.historyPanel.querySelector('.minari-curious-history-scroll') as HTMLDivElement;
    try {
      const rows = await this.deps.fetchHistory();
      const tail = rows.slice(-HISTORY_LIMIT);
      if (tail.length === 0) {
        scrollEl.innerHTML =
          '<div class="minari-curious-history-empty">(no chats yet)</div>';
        return;
      }
      scrollEl.innerHTML = tail
        .map((r) => {
          const cls = r.role === 'minari' ? 'msg-minari' : 'msg-user';
          const text = escapeHtml(r.content);
          return `<div class="minari-curious-msg ${cls}">${text}</div>`;
        })
        .join('');
      scrollEl.scrollTop = scrollEl.scrollHeight;
    } catch (err) {
      console.error('[curious] refreshHistory failed', err);
    }
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

  async dismiss() {
    this.cleanup();
    this.el.classList.remove('is-visible');
    await new Promise((r) => setTimeout(r, 200));
    if (this.el.parentElement) this.el.parentElement.removeChild(this.el);
  }

  private submit() {
    const text = this.input.value.trim();
    if (!text) {
      // Empty submit is treated the same as a "." trigger — caller decides.
      this.resolve('');
      return;
    }
    this.resolve(text);
  }

  private cancel() {
    this.resolve(null);
  }

  private resolve(value: string | null) {
    if (!this.resolver) return;
    const r = this.resolver;
    this.resolver = null;
    r(value);
  }

  private cleanup() {
    document.removeEventListener('pointerdown', this.outsideHandler);
    window.removeEventListener('blur', this.blurHandler);
    if (this.armTimer) {
      clearTimeout(this.armTimer);
      this.armTimer = null;
    }
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    this.tooltipEl.remove();
    this.armed = false;
  }

  private async toggleHistory() {
    const scrollEl = this.historyPanel.querySelector('.minari-curious-history-scroll') as HTMLDivElement;
    if (this.historyOpen) {
      this.historyPanel.classList.remove('is-open');
      this.ejectBtn.classList.remove('is-active');
      setTimeout(() => {
        if (!this.historyOpen) {
          this.historyPanel.hidden = true;
          scrollEl.innerHTML = '';
        }
      }, 260);
      this.historyOpen = false;
      return;
    }
    this.historyOpen = true;
    this.ejectBtn.classList.add('is-active');
    this.historyPanel.hidden = false;
    scrollEl.innerHTML = '<div class="minari-curious-history-empty">...</div>';
    requestAnimationFrame(() => this.historyPanel.classList.add('is-open'));
    try {
      const rows = await this.deps.fetchHistory();
      if (!this.historyOpen) return;
      const tail = rows.slice(-HISTORY_LIMIT);
      if (tail.length === 0) {
        scrollEl.innerHTML =
          '<div class="minari-curious-history-empty">(no chats yet)</div>';
        return;
      }
      scrollEl.innerHTML = tail
        .map((r) => {
          const cls = r.role === 'minari' ? 'msg-minari' : 'msg-user';
          const text = escapeHtml(r.content);
          return `<div class="minari-curious-msg ${cls}">${text}</div>`;
        })
        .join('');
      scrollEl.scrollTop = scrollEl.scrollHeight;
    } catch (err) {
      console.error('[curious] fetchHistory failed', err);
      scrollEl.innerHTML =
        '<div class="minari-curious-history-empty">(failed to load)</div>';
    }
  }

  // ── Menu / Volume / Quit ─────────────────────────────────────────────────
  // Collapse the ⏏ long-press menu if it's open; no-op otherwise.
  private closeMenu() {
    if (this.menuExpanded) this.toggleMenu();
  }

  private toggleMenu() {
    this.menuExpanded = !this.menuExpanded;
    if (!this.menuExpanded) {
      // Slide + fade out like the history panel, then drop the hidden flag
      // once the transition has finished.
      this.menuEl.classList.remove('is-open');
      this.volBarOpen = false;
      this.volBar.hidden = true;
      this.hideConfirm();
      setTimeout(() => {
        if (!this.menuExpanded) this.menuEl.hidden = true;
      }, 260);
      return;
    }
    this.menuEl.hidden = false;
    requestAnimationFrame(() => {
      this.menuEl.classList.add('is-open');
      const e = this.ejectBtn.getBoundingClientRect();
      const c = this.closeBtn.getBoundingClientRect();
      const v = this.volBtn.getBoundingClientRect();
      console.log(
        '[gap] eject  top=' + e.top.toFixed(1) + ' bottom=' + e.bottom.toFixed(1) +
        '  close  top=' + c.top.toFixed(1) + ' bottom=' + c.bottom.toFixed(1) +
        '  vol    top=' + v.top.toFixed(1) + ' bottom=' + v.bottom.toFixed(1),
      );
      console.log(
        '[gap] eject→close=' + (c.top - e.bottom).toFixed(2) +
        'px  close→vol=' + (v.top - c.bottom).toFixed(2) + 'px',
      );
    });
  }

  private toggleMute() {
    this.muted = !this.muted;
    this.applyVolumeToAudio();
    this.refreshVolumeUI();
    window.minari.setVolume(this.volume, this.muted);
  }

  private openVolumeBar() {
    if (this.volBarOpen) return;
    this.volBarOpen = true;
    this.volBar.hidden = false;
    requestAnimationFrame(() => this.volBar.classList.add('is-open'));
  }

  private startVolumeDrag(e: PointerEvent) {
    const setFromEvent = (ev: PointerEvent) => {
      const rect = this.volBar.getBoundingClientRect();
      // Left side of bar = max volume, right side = min.
      const v = 1 - (ev.clientX - rect.left) / Math.max(1, rect.width);
      this.volume = Math.max(0, Math.min(1, v));
      // Drag overrides mute — explicit volume change unmutes.
      this.muted = false;
      this.applyVolumeToAudio();
      this.refreshVolumeUI();
    };
    setFromEvent(e);
    const onMove = (ev: PointerEvent) => setFromEvent(ev);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      window.minari.setVolume(this.volume, this.muted);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  private applyVolumeToAudio() {
    setGlobalVolume(this.volume);
    setGlobalMuted(this.muted);
  }

  private refreshVolumeUI() {
    this.volBtn.classList.toggle('is-muted', this.muted);
    const w = this.muted ? 0 : this.volume * 100;
    this.volFill.style.width = w.toFixed(1) + '%';
  }

  private showConfirm() {
    this.confirmEl.hidden = false;
    requestAnimationFrame(() => this.confirmEl.classList.add('is-open'));
  }

  private hideConfirm() {
    this.confirmEl.classList.remove('is-open');
    setTimeout(() => {
      if (!this.confirmEl.classList.contains('is-open')) {
        this.confirmEl.hidden = true;
      }
    }, 260);
  }

  // ── Hover tooltips ───────────────────────────────────────────────────────
  // Each control shows `label` after a short dwell. No show-count cap — the
  // hint is available on every hover. Acting on the control (or leaving it)
  // dismisses it immediately.
  private attachTooltip(btn: HTMLElement, label: string) {
    btn.addEventListener('pointerenter', () => {
      if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
      this.tooltipTimer = setTimeout(() => {
        this.tooltipTimer = null;
        this.showTooltip(btn, label);
      }, BTN_TOOLTIP_DELAY_MS);
    });
    const dismiss = () => {
      if (this.tooltipTimer) {
        clearTimeout(this.tooltipTimer);
        this.tooltipTimer = null;
      }
      this.hideTooltip();
    };
    btn.addEventListener('pointerleave', dismiss);
    btn.addEventListener('pointerdown', dismiss);
  }

  private showTooltip(btn: HTMLElement, label: string) {
    const r = btn.getBoundingClientRect();
    this.tooltipEl.textContent = label;
    this.tooltipEl.style.left = r.left + r.width / 2 + 'px';
    this.tooltipEl.style.top = r.top - 8 + 'px';
    this.tooltipEl.style.transition = `opacity ${BTN_TOOLTIP_FADE_IN_MS}ms ease-out`;
    this.tooltipEl.style.opacity = '1';
    // Auto-dismiss after a short hold even if the cursor stays on the control.
    if (this.tooltipHideTimer) clearTimeout(this.tooltipHideTimer);
    this.tooltipHideTimer = setTimeout(() => {
      this.tooltipHideTimer = null;
      this.fadeOutTooltip();
    }, BTN_TOOLTIP_HOLD_MS);
  }

  private hideTooltip() {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    this.fadeOutTooltip();
  }

  // Soft, slow fade so the label drifts away instead of blinking off.
  private fadeOutTooltip() {
    this.tooltipEl.style.transition = `opacity ${BTN_TOOLTIP_FADE_OUT_MS}ms ease-out`;
    this.tooltipEl.style.opacity = '0';
  }

  // ── Resize history panel ─────────────────────────────────────────────────
  private startHistoryResize(e: PointerEvent, scrollEl: HTMLDivElement) {
    const startY = e.clientY;
    const startH = scrollEl.getBoundingClientRect().height;
    const minH = 60;
    const maxH = Math.max(minH, window.innerHeight - 100);
    const onMove = (ev: PointerEvent) => {
      // Panel grows upward, so dragging UP (dy < 0) should make it taller.
      const dy = ev.clientY - startY;
      const next = Math.max(minH, Math.min(maxH, startH - dy));
      scrollEl.style.maxHeight = next + 'px';
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const finalH = scrollEl.getBoundingClientRect().height;
      window.minari.setCuriousHistoryHeight(finalH);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ── Drag ─────────────────────────────────────────────────────────────────
  private onDragStart(e: PointerEvent) {
    if (e.button !== 0) return;
    this.dragArmed = true;
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
      this.dragArmed = false;
      if (this.dragging) {
        this.dragging = false;
        this.el.classList.remove('is-dragging');
        if (this.posX !== null && this.posY !== null) {
          window.minari.setCuriousPos(this.posX, this.posY);
        }
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // First-open placement: the empty space to Minari's left. Only used when no
  // dragged position has been saved — a later drag persists via setCuriousPos.
  private applyInitialPosition() {
    const pet = this.deps.petAnchor();
    const PET_HALF_W = 70;
    const GAP = 24;
    const left = pet.x - PET_HALF_W - GAP - this.el.offsetWidth;
    const bottom = window.innerHeight - pet.y + 40;
    this.applyPosition(left, bottom);
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
    /* Container — invisible itself; children carry the glass surfaces. */
    .minari-curious {
      position: fixed;
      left: 12px;
      bottom: 100px;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 250ms ease-out, transform 250ms ease-out;
      pointer-events: auto;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif;
      cursor: grab;
      user-select: none;
    }
    .minari-curious.is-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .minari-curious.is-dragging {
      cursor: grabbing;
      transition: none;
    }

    /* History panel — outer is the glass squircle, inner does the scrolling so
       the scrollbar stays inside the rounded clip. */
    .minari-curious-history {
      width: 220px;
      box-sizing: border-box;
      background: rgba(248, 252, 255, 0.85);
      border: 1px solid rgba(220, 236, 245, 0.85);
      border-radius: 18px;
      box-shadow:
        0 4px 14px rgba(53, 84, 104, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(14px) saturate(1.2);
      -webkit-backdrop-filter: blur(14px) saturate(1.2);
      color: #355468;
      font-size: 12px;
      line-height: 1.5;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 250ms ease-out, transform 250ms ease-out;
      overflow: hidden;
    }
    .minari-curious-history.is-open {
      opacity: 1;
      transform: translateY(0);
    }
    .minari-curious-history[hidden] {
      display: none;
    }
    .minari-curious-history-resize {
      height: 8px;
      cursor: ns-resize;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .minari-curious-history-resize::after {
      content: '';
      width: 20px;
      height: 2px;
      border-radius: 1px;
      background: rgba(199, 217, 229, 0);
      transition: background-color 300ms ease-out;
    }
    .minari-curious-history-resize:hover::after {
      background: rgba(199, 217, 229, 0.9);
    }
    .minari-curious-history-scroll {
      max-height: 180px;
      overflow-y: auto;
      padding: 10px 12px 10px 12px;
      scrollbar-gutter: stable;
    }
    .minari-curious-history-scroll::-webkit-scrollbar {
      width: 6px;
    }
    .minari-curious-history-scroll::-webkit-scrollbar-track {
      background: transparent;
      border-radius: 3px;
      margin: 6px 0;
    }
    .minari-curious-history-scroll::-webkit-scrollbar-thumb {
      background: rgba(199, 217, 229, 0);
      border-radius: 3px;
      transition: background-color 1400ms ease-out;
    }
    .minari-curious-history-scroll.is-scrolling::-webkit-scrollbar-thumb,
    .minari-curious-history-scroll:hover::-webkit-scrollbar-thumb {
      background: rgba(199, 217, 229, 1);
    }
    .minari-curious-history-empty {
      opacity: 0.5;
      text-align: center;
      padding: 8px 0;
    }
    .minari-curious-msg {
      padding: 3px 6px 3px 8px;
      margin: 2px 0;
      word-break: break-word;
      border-left: 2px solid transparent;
      border-radius: 4px;
    }
    .minari-curious-msg.msg-minari {
      color: #355468;
      border-left-color: #DDF5EA;
      background: rgba(247, 252, 250, 0.6);
    }
    .minari-curious-msg.msg-user {
      color: #355468;
      background: rgba(238, 246, 255, 0.7);
    }

    /* Row: input fills, eject sits on the right. flex-end so ⏏'s bottom is
       flush with the row bottom — otherwise the row's extra height (input is
       taller than ⏏) adds invisible space below ⏏, doubling the menu gap. */
    .minari-curious-row {
      display: flex;
      width: 220px;
      gap: 8px;
      align-items: flex-end;
      margin: 0;
      padding: 0;
    }
    .minari-curious-input {
      flex: 1;
      min-width: 0;
      margin-left: 10px;
      box-sizing: border-box;
      font: inherit;
      font-size: 14px;
      color: #355468;
      background: rgba(248, 252, 255, 0.85);
      border: 1px solid rgba(215, 234, 244, 0.9);
      border-radius: 22px;
      padding: 8px 14px;
      outline: none;
      box-shadow:
        0 2px 8px rgba(53, 84, 104, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(14px) saturate(1.2);
      -webkit-backdrop-filter: blur(14px) saturate(1.2);
      cursor: text;
      transition: border-color 300ms ease-out, box-shadow 300ms ease-out;
    }
    .minari-curious-input::placeholder {
      color: #97ADBC;
    }
    .minari-curious-input:focus {
      border-color: #8EC5EA;
      box-shadow:
        0 0 0 3px rgba(221, 245, 234, 0.6),
        0 2px 8px rgba(53, 84, 104, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
    }
    .minari-curious-input:disabled {
      opacity: 0.6;
      cursor: default;
    }

    /* Expanded menu — absolute-positioned below the input row so it pops OUT
       below ⏏ without pushing input / history up. ♪ ends up directly under ⏏;
       ⌽ tucks tight between them (slightly offset right, grape-cluster). */
    .minari-curious-menu {
      position: absolute;
      top: calc(100% + 2px);
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      padding: 0;
      margin: 0;
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity 250ms ease-out, transform 250ms ease-out;
    }
    .minari-curious-menu.is-open {
      opacity: 1;
      transform: translateY(0);
    }
    .minari-curious-menu[hidden] { display: none; }
    .minari-curious-vol-row {
      margin: 0;
      margin-top: -10px;
      padding: 0;
    }

    /* ⌽ (close) — smaller, tucked tight between ⏏ above and ♪ below, pushed
       further right so the three form a grape-cluster. */
    .minari-curious-close {
      width: 20px;
      height: 20px;
      padding: 0;
      border-radius: 50%;
      background: rgba(252, 254, 255, 0.78);
      border: 1px solid rgba(215, 234, 244, 0.85);
      box-shadow:
        0 2px 6px rgba(53, 84, 104, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(12px) saturate(1.2);
      -webkit-backdrop-filter: blur(12px) saturate(1.2);
      color: #d65a5a;
      font-size: 10px;
      line-height: 1;
      cursor: pointer;
      outline: none;
      margin: 0;
      margin-top: -10px;
      margin-right: -19px;
      z-index: 1;
      transition: background 250ms ease-out, border-color 250ms ease-out, color 250ms ease-out;
    }
    .minari-curious-close::before {
      content: '⌽';
    }
    .minari-curious-close:hover {
      background: rgba(254, 220, 220, 0.85);
      border-color: rgba(214, 90, 90, 0.4);
      color: #b04040;
    }

    /* ♪ row: bar slides in to the left of the button. */
    .minari-curious-vol-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .minari-curious-vol-bar {
      width: 170px;
      height: 10px;
      border-radius: 999px;
      background: rgba(248, 252, 255, 0.85);
      border: 1px solid rgba(215, 234, 244, 0.9);
      backdrop-filter: blur(14px) saturate(1.2);
      -webkit-backdrop-filter: blur(14px) saturate(1.2);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
      position: relative;
      cursor: pointer;
      opacity: 0;
      transform: translateX(8px);
      transition: opacity 250ms ease-out, transform 250ms ease-out;
      overflow: hidden;
    }
    .minari-curious-vol-bar.is-open {
      opacity: 1;
      transform: translateX(0);
    }
    .minari-curious-vol-bar[hidden] {
      display: none;
    }
    .minari-curious-vol-fill {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #8EC5EA, #DDF5EA);
      transition: width 200ms ease-out;
    }
    .minari-curious-vol {
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 50%;
      background: rgba(252, 254, 255, 0.78);
      border: 1px solid rgba(215, 234, 244, 0.85);
      box-shadow:
        0 2px 6px rgba(53, 84, 104, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(12px) saturate(1.2);
      -webkit-backdrop-filter: blur(12px) saturate(1.2);
      color: #355468;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      outline: none;
      transition: background 250ms ease-out, border-color 250ms ease-out, color 250ms ease-out;
    }
    .minari-curious-vol::before {
      content: '♪';
    }
    .minari-curious-vol:hover::before {
      content: '♪̸';
    }
    .minari-curious-vol.is-muted {
      color: #d65a5a;
      background: rgba(254, 220, 220, 0.85);
      border-color: rgba(214, 90, 90, 0.4);
    }
    .minari-curious-vol.is-muted::before {
      content: '♪̸';
    }
    .minari-curious-vol.is-muted:hover {
      color: #355468;
      background: rgba(252, 254, 255, 0.78);
      border-color: rgba(215, 234, 244, 0.85);
    }
    .minari-curious-vol.is-muted:hover::before {
      content: '♪';
    }

    /* Confirm dialog — small glass card floating above the menu/input. */
    .minari-curious-confirm {
      position: absolute;
      bottom: calc(100% + 8px);
      right: 0;
      width: 220px;
      box-sizing: border-box;
      background: rgba(248, 252, 255, 0.92);
      border: 1px solid rgba(220, 236, 245, 0.85);
      border-radius: 18px;
      padding: 12px;
      box-shadow:
        0 4px 14px rgba(53, 84, 104, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(14px) saturate(1.2);
      -webkit-backdrop-filter: blur(14px) saturate(1.2);
      color: #355468;
      font-size: 13px;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 250ms ease-out, transform 250ms ease-out;
    }
    .minari-curious-confirm.is-open {
      opacity: 1;
      transform: translateY(0);
    }
    .minari-curious-confirm[hidden] {
      display: none;
    }
    .minari-curious-confirm-msg {
      text-align: center;
      margin-bottom: 10px;
    }
    .minari-curious-confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    .minari-curious-confirm-yes,
    .minari-curious-confirm-no {
      flex: 1;
      padding: 6px 10px;
      font: inherit;
      font-size: 13px;
      border-radius: 12px;
      background: rgba(252, 254, 255, 0.78);
      border: 1px solid rgba(215, 234, 244, 0.85);
      color: #355468;
      cursor: pointer;
      outline: none;
      transition: background 200ms ease-out, border-color 200ms ease-out, color 200ms ease-out;
    }
    .minari-curious-confirm-yes:hover {
      background: rgba(254, 220, 220, 0.85);
      border-color: rgba(214, 90, 90, 0.4);
      color: #b04040;
    }
    .minari-curious-confirm-no:hover {
      background: rgba(238, 249, 243, 0.85);
      border-color: rgba(182, 227, 209, 0.85);
      color: #5E9A83;
    }

    /* Eject — small glass disc, sits to the right of the input. Flips
       vertically when history is open. */
    .minari-curious-eject {
      flex: none;
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 50%;
      background: rgba(252, 254, 255, 0.78);
      border: 1px solid rgba(215, 234, 244, 0.85);
      box-shadow:
        0 2px 6px rgba(53, 84, 104, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(12px) saturate(1.2);
      -webkit-backdrop-filter: blur(12px) saturate(1.2);
      color: #355468;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      outline: none;
      transition:
        background 250ms ease-out,
        border-color 250ms ease-out,
        color 250ms ease-out,
        transform 250ms ease-out;
    }
    .minari-curious-eject > * {
      display: inline-block;
    }
    .minari-curious-eject:hover:not(:disabled),
    .minari-curious-eject.is-active {
      background: rgba(238, 249, 243, 0.85);
      border-color: rgba(182, 227, 209, 0.85);
      color: #5E9A83;
    }
    .minari-curious-eject:focus-visible {
      border-color: #8EC5EA;
    }
    .minari-curious-eject:disabled {
      opacity: 0.5;
      cursor: default;
    }

    /* Hover tooltip — a glass pill centred above the hovered control. */
    .minari-curious-tooltip {
      position: fixed;
      z-index: 1001;
      pointer-events: none;
      font-size: 12px;
      color: #5a7a8c;
      white-space: nowrap;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(248, 252, 255, 0.92);
      border: 1px solid rgba(215, 234, 244, 0.9);
      box-shadow: 0 2px 8px rgba(53, 84, 104, 0.12);
      opacity: 0;
      /* Default fade; showTooltip / fadeOutTooltip override per direction. */
      transition: opacity 450ms ease-out;
      transform: translate(-50%, -100%);
    }
  `;
  document.head.appendChild(style);
}

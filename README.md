# minari

> *The grown-up's plushie. Except this one notices you back.*

A small offline-first desktop companion that lives in the corner of your screen. She doesn't give advice. She notices small things, mumbles to herself, and remembers you across days.

Built for the **Kaggle Gemma 4 Good** competition (deadline 2026-05-18). Runs entirely on-device with Gemma 4 E2B (3 GB) or E4B (5 GB) via Ollama.

---

## What it does

- **Notices, doesn't ask.** Soft pings — one-line lowercase fragments — fire 2–5 times a day on her own clock, suppressed by recent interaction, quiet hours, and a daily cap. No notifications, no questions.
- **Remembers you across days.** D+0 birth with a name you give her, snapshot resume across sessions, an automatic one-line diary written at quit time.
- **Babbles, not speaks.** Animal-Crossing-style 15-sample mumble synthesizer drives the bubble text. No TTS.
- **Receives gifts.** Drag any image onto her — Gemma vision describes it as a toddler would (`"warm cheese circles"`).
- **Learns from you.** When she sees something she doesn't have a word for, she asks later: `"warm cheese circles... what?"` Once you teach her `pizza`, the next image of one comes back as `"pizza!"`
- **Reacts to alarms.** Wires into Claude Code's `Stop` hook so coding-agent runs end with one of four moods: startled, annoyed, deadpan, or just *"...loud."*

She is not a tool, not a chatbot, not a wellbeing app. She's a small thing that lives on your desktop and occasionally looks up.

---

## Demo highlights

Three things to watch in 60 seconds:

1. **Holding space, not advice.** "오늘 힘들었어." → `"...here."` Not "here's what you should do."
2. **D+0 → D+10 drift.** Babble stage to curious stage. Mumble timbre, vocabulary, and proactive ping cadence all shift. She also starts asking what things are called.
3. **3 GB model, on-device.** Toggle Wi-Fi off mid-demo. She keeps responding. The same story runs on E4B if you have the headroom.

---

## Quick start

Requirements:
- macOS 13+ (tested on 25.2). Linux/Windows untested but likely works.
- Node 20+
- [Ollama](https://ollama.com) installed and running
- ~8 GB free disk for the model

```bash
# 1. pull the model (E2B = 3GB, the hackathon track)
ollama pull gemma4:e2b

# 2. install + run
npm install
MINARI_MODEL=gemma4:e2b npm run dev
```

Drop `MINARI_MODEL` to default to `gemma4:e4b` (sharper but heavier).

First launch plays a birth scene: a seed sprouts, you give her a nickname, she says her first word. Subsequent launches resume from where you left off.

---

## Word learning (the "she learns from you" demo)

```
D+3   you drop a pizza photo  →  "warm cheese circles."     ← doesn't know
D+10  she asks unprompted      →  "warm cheese circles... what?"
      you type                 →  "pizza"
      she echoes               →  "pizza?"
      you confirm              →  "yes"
      she savours              →  "pizza-"
      diary that night         →  "jy gave warm cheese circles. warm cheese circles has name now: pizza."
D+11  you drop another pizza   →  "pizza!"                    ← remembers
```

Implementation lives in `src/main/wordLearning/`. Vision results are post-processed against learned rows by keyword overlap (≥30% of the smaller caption); on hit, the new caption's tokens fold back into the row to widen the matching pool over time. No mocked output, no hard-coded vocabulary — Gemma's actual vision call drives everything.

In dev (`npm run dev`), the unknown→curious delay is 30s and the cooldown 60s for fast iteration. In production, 3 days and 24 hours.

---

## Coding-agent alarms

Minari is *affected by* alarms, not a notifier. Wire her into Claude Code by appending to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node /ABSOLUTE/PATH/TO/minari/scripts/alarm-hook.js" }
        ]
      }
    ]
  }
}
```

Now every time your coding agent finishes a turn, she startles, glares, mutters, or grumbles `"...loud."` Random reaction; templated text; real DB row written. Manual demo trigger:

```bash
npm run demo:alarm          # random
npm run demo:alarm loud     # force the cookie-ending reaction
```

The hook script POSTs to a localhost-only HTTP server (default `127.0.0.1:47823`) inside the Minari main process. Set `MINARI_HOOK_TOKEN` to require an `Authorization: Bearer` header if you're worried about other local processes triggering it. Override the port with `MINARI_HOOK_PORT`.

---

## Architecture

```
Electron main (Node)                Renderer (PixiJS)
┌──────────────────────┐            ┌──────────────────────┐
│ ipc handlers         │  IPC       │ sprout sprite        │
│ soft-ping scheduler  │ ───────►   │ DOM bubble overlay   │
│ word-learning state  │            │ DOM curious prompt   │
│ alarm HTTP server    │            │ mumble synthesizer   │
│ Ollama client        │            │ drag-drop receiver   │
└──────────┬───────────┘            └──────────┬───────────┘
           │ better-sqlite3 + WAL              │
   ┌───────▼──────────┐                ┌───────▼────────┐
   │ minari.db        │                │ AudioContext   │
   │  conversations   │                │  15 wav samples│
   │  diary           │                └────────────────┘
   │  state           │
   │  learned_words   │
   │  soft_pings      │
   └──────────────────┘
                   ▲
                   │ HTTP localhost
                   │
          ┌────────┴────────────┐
          │ scripts/alarm-hook  │ ← Claude Code Stop/Notification hooks
          │ scripts/demo-alarm  │ ← `npm run demo:alarm`
          └─────────────────────┘
```

Key constraints baked into the design:

- **System prompts ≤ 50 words.** E2B/E4B at this size silently drop output past that. The matcher and curiosity questions are template-driven for that reason — the LLM is only used for *seeing*, not *remembering*.
- **`think: false` everywhere.** Without it, Gemma 4 thinks for ~7 s before each fragment.
- **Click-through window with cursor polling.** macOS `setIgnoreMouseEvents(true, {forward:true})` doesn't forward OS-level drag-enter, so a 50 ms cursor poll in main flips click-through off the moment the cursor enters the window. Drag-and-drop then arrives normally.

---

## Project layout

```
src/
├── main/
│   ├── alarm/              HTTP server + reaction selector
│   ├── llm/                Ollama wrappers, prompt pools, guardrails
│   ├── memory/             SQLite open + repository
│   ├── wordLearning/       matcher, repo, teaching state, keyword templates
│   ├── softPing.ts         scheduler + word-curiosity gate
│   ├── snapshot.ts         resume bucket logic
│   ├── growth.ts           D-day → stage
│   ├── diary.ts            quit-time generator
│   └── window.ts           pet window + cursor polling
├── renderer/               PixiJS, DOM overlays, mumble engine
├── shared/                 types + suppression rules (testable)
└── preload/                contextBridge surface

scripts/
├── alarm-hook.js           Claude Code hook entry (POSTs to main)
├── demo-alarm.js           manual trigger via the same path
└── regression.ts           pure-helper test suite (npm run test:regression)

assets/sprites/             sprout PNG
assets/sounds/              15 mumble syllable wavs
docs/                       design + handoff docs (Korean)
```

---

## Tests

```bash
npm run typecheck            # tsc --noEmit
npm run test:regression      # 73 pure-helper assertions
```

The regression suite covers snapshot bucket boundaries, soft-ping suppression rules, guardrail filtering, the word-matcher, and the alarm reaction selector. UI flows (birth, drag-drop, curious prompt) are exercised manually — see the checklist printed at the end of the suite.

---

## Constraints — what Minari does not say

She does not say *therapy, therapist, treatment, cure, heal, fix, diagnose, diagnosis, medication, recommend, should, must, need to.* These are filtered post-LLM in `src/main/llm/guardrails.ts` and replaced with `"..."` if they slip through. She is not a substitute for emotional or medical care; she is a small companion that holds space.

---

## License

MIT. See `LICENSE`.

Built with [Ollama](https://ollama.com), [Electron](https://electronjs.org), [PixiJS](https://pixijs.com), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), and Gemma 4 by Google DeepMind.

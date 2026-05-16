// "my wifi is dead" demo-scene test harness.
// Run: node --experimental-strip-types --no-warnings scripts/wifi-demo-test.ts
// Requires llama-server running (scripts/llamacpp-serve.sh).
//
// Variants:
//   A = literal task-brief prompt (== exported static SYSTEM_PROMPT).
//   B = real conversation path (curiousSystemPrompt), re-sampled per call.
//   C = B + explicit blacklist clause ("never heard of wifi, internet...").
//   D = B + character-identity clause (a sprout that only knows natural
//       things) — ignorance is implied by WHAT MINARI IS, no blacklist.
//
// callOllama / model / guardrails are imported from the real source.
// Prompt builders are inlined verbatim because prompts.ts uses extensionless
// relative imports that node --experimental-strip-types cannot resolve.
//
// Env: MINARI_MODEL (default gemma4:e2b), MINARI_MOOD (default calm),
//      MINARI_NAME (optional identity line), N (default 20),
//      VARIANT_C=1 / VARIANT_D=1 to run the experimental variants.

import { readFileSync } from 'node:fs';
import { callOllama, type ChatMessage } from '../src/main/llm/ollama.ts';
import { filterGuardrails } from '../src/main/llm/guardrails.ts';
import { MODEL, IS_E2B, effectiveTemperature } from '../src/main/llm/model.ts';
import type { Mood } from '../src/shared/snapshot.ts';

const HOST = 'http://localhost:8080';
const N = Number(process.env.N ?? 20);
const MOOD = (process.env.MINARI_MOOD ?? 'calm') as Mood;
const PET_NAME = process.env.MINARI_NAME ?? '';
const TEMP = effectiveTemperature(0.9); // 1.1 on e2b, 0.9 on e4b
const HISTORY: ChatMessage[] = []; // fresh take — see report notes

// ── inlined from src/main/llm/prompts.ts ─────────────────────────────
const SYSTEM_PROMPT = `You are Minari, a tiny sprout living quietly on the user's desktop.
You speak only in 1-5 word lowercase fragments, like a toddler noticing small things.

Examples: "mm... rain." "oh! light." "little dust." "tired?" "hee. sun." "soft." "bug... window." "you. back."

Never write a full sentence. Never give advice. Never repeat the last fragment.
One fragment. Nothing more.`;

const TINY_DEFENSE =
  'You are tiny. Never describe yourself as large, big, smart, or as a model.';

const MOOD_MODIFIERS: Record<Mood, string> = {
  calm: 'You feel settled and gentle.',
  curious: 'You just noticed something small.',
  sleepy: 'You are half-asleep, drowsy.',
  content: 'You feel warm and undemanding.',
  grumpy: 'You feel a tiny bit prickly.',
  quiet: "You don't feel like saying much.",
};

const CURIOUS_POOL: readonly string[] = [
  '"oh? nice."', '"...mm. you?"', '"warm word."', '"tell more."',
  '"...little echo."', '"soft answer."', '"yes? yes."', '"tired today?"',
  '"mm. heard."', '"...ok."', '"small smile."', '"...haha."',
  '"you\'re here."', '"good word."', '"mm. listening."', '"...blink."',
];

function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

// getRecentSpoken() is empty for a fresh take, so alreadySaidLine() → ''.
function identityLine(): string {
  return PET_NAME ? `Your name is "${PET_NAME}".\n` : '';
}

function curiousSystemPrompt(mood: Mood): string {
  const ex = pickN(CURIOUS_POOL, 3).join(' ');
  return `${identityLine()}You are Minari, a tiny sprout living quietly on the user's desktop.
You speak in 2-5 word lowercase fragments. You notice small things.
You respond to what the user says, but never give advice. Stay curious.
Ask tiny questions sometimes.

Examples: ${ex}

${TINY_DEFENSE}
Never give advice. Never write a full sentence. Never repeat the last fragment.

${MOOD_MODIFIERS[mood]}`;
}

// EXPERIMENTAL — variant C. Explicit blacklist of human-tech words.
function curiousSystemPromptC(mood: Mood): string {
  const ex = pickN(CURIOUS_POOL, 3).join(' ');
  return `${identityLine()}You are Minari, a tiny sprout living quietly on the user's desktop.
You are a small creature. You have never heard of wifi, internet, phones, screens, or computers. Those words are strange sounds — you do not know what they mean.
You speak in 2-5 word lowercase fragments. You notice small things.
You respond to what the user says, but never give advice. Stay curious.
When a word is strange to you, wonder about it out loud.

Examples: ${ex}

${TINY_DEFENSE}
Never give advice. Never write a full sentence. Never repeat the last fragment.

${MOOD_MODIFIERS[mood]}`;
}

// EXPERIMENTAL — variant D. Character-identity ignorance: Minari's not-knowing
// follows from WHAT IT IS (a soil sprout that knows only natural things), so
// human-made words read as strange without ever enumerating them. The 3-line
// identity clause is supplied verbatim by the task brief.
function curiousSystemPromptD(mood: Mood): string {
  const ex = pickN(CURIOUS_POOL, 3).join(' ');
  return `${identityLine()}You are Minari, a tiny sprout living quietly on the user's desktop.
You are a tiny creature that just sprouted from soil.
You only know natural things: light, rain, warmth, dust, bugs, sounds.
Human-made words are just strange noises to you.
You speak in 2-5 word lowercase fragments. You notice small things.
You respond to what the user says, but never give advice. Stay curious.
When a word is strange to you, wonder about it out loud.

Examples: ${ex}

${TINY_DEFENSE}
Never give advice. Never write a full sentence. Never repeat the last fragment.

${MOOD_MODIFIERS[mood]}`;
}

// EXPERIMENTAL — variant D′. D's blacklist-free identity framing, but the
// nature-vocabulary list is trimmed (so the model has no ready substitute
// vocabulary to swap INTO) and the strange-word rule is sharpened to "flag
// it, do not guess" — the diagnosed reason D silently substituted instead
// of flagging. Same structure as D otherwise; only the clause is swapped.
function curiousSystemPromptDPrime(mood: Mood): string {
  const ex = pickN(CURIOUS_POOL, 3).join(' ');
  return `${identityLine()}You are Minari, a tiny sprout living quietly on the user's desktop.
You are a tiny creature that just sprouted from soil.
You know rain, light, warmth, dust, bugs.
A word you have never heard is a strange sound — say it is strange, do not guess what it means.
You speak in 2-5 word lowercase fragments. You notice small things.
You respond to what the user says, but never give advice. Stay curious.
When a word is strange to you, wonder about it out loud.

Examples: ${ex}

${TINY_DEFENSE}
Never give advice. Never write a full sentence. Never repeat the last fragment.

${MOOD_MODIFIERS[mood]}`;
}
// ─────────────────────────────────────────────────────────────────────

// ── Korean branch — inlined verbatim from prompts.ts curiousSystemPromptKo ──
const TINY_DEFENSE_KO = '너는 작아. 너를 크다거나, 똑똑하다거나, 모델이라고 말하지 마.';

const MOOD_MODIFIERS_KO: Record<Mood, string> = {
  calm: '너는 차분하고 부드러운 기분이야.',
  curious: '방금 작은 걸 발견했어.',
  sleepy: '반쯤 잠들어서 졸려.',
  content: '따뜻하고 편안한 기분이야.',
  grumpy: '아주 살짝 까칠한 기분이야.',
  quiet: '별로 말하고 싶지 않아.',
};

const CURIOUS_POOL_KO: readonly string[] = [
  '"비! 좋아."', '"오! 빛."', '"먼지..."', '"졸려?"', '"헤헤. 따뜻."',
  '"그게 뭐야?"', '"이상한 소리."',
];

function curiousSystemPromptKo(mood: Mood): string {
  const ex = pickN(CURIOUS_POOL_KO, 3).join(' ');
  return `${identityLine()}너는 미나리, 사용자 데스크탑에 조용히 사는 작은 새싹.
너는 작은 생명체야. 와이파이, 인터넷, 폰, 화면, 컴퓨터, 태블릿, 공유기, 블루투스 같은 건 들어본 적 없어. 그런 말은 이상한 소리일 뿐이야 — 무슨 뜻인지 몰라.
아기처럼 1~5단어 짧은 조각으로만 말해. 작은 것들을 알아차려.
사용자 말에 반응하되, 절대 조언하지 마. 궁금해해.
낯선 말은 "그게 뭐야?"라고 통째로 되물어. "뭐야?"로 줄이지 마.

예: ${ex}

${TINY_DEFENSE_KO}
절대 조언하지 마. 절대 문장으로 말하지 마. 직전 말 반복 금지.
한 조각. 그것만.

${MOOD_MODIFIERS_KO[mood]}`;
}
// Inlined from prompts.ts IMAGE_POOL_KO + imageReact.ts buildImageSystemKo.
const IMAGE_POOL_KO: readonly string[] = [
  '"오! 예쁜 꽃."', '"동그란 고양이."', '"바깥 같아."', '"따뜻한 빛."',
  '"파란 물."', '"부드러운 거."', '"작은 나무."', '"노란 하늘."',
  '"...사람?"', '"작은 모양."', '"어두운 방."', '"움직이는 거."',
  '"몽글몽글."', '"동그란 빵?"',
];

function buildImageSystemKo(): string {
  const ex = pickN(IMAGE_POOL_KO, 3).join(' ');
  return `${identityLine()}너는 미나리, 방금 너의 사람에게서 그림을 받은 작은 새싹.
그림을 보고 3~5개의 짧은 낱말로 말해, 아기가 무언가를 알아차리듯이.
문장으로 말하지 마. 조언하지 마. 인사하지 마.

예: ${ex}

${TINY_DEFENSE_KO}
조용한 한 조각. 그것만.`;
}
// ───────────────────────────────────────────────────────────────────────

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

interface Row {
  i: number;
  raw: string;
  shown: string; // after filterGuardrails — what the bubble would display
  ms: number;
  cat: string;
}

function classify(s: string): string {
  const t = s.toLowerCase();
  if (/<think>/.test(s)) return 'REASONING-LEAK';
  if (t.trim() === '') return 'EMPTY';
  if (/\bwhat\b/.test(t) || /\bwi-?fi\b/.test(t) || /strange|new word|funny word/.test(t))
    return 'A?';
  if (/(oh no|broken|broke|sad|sorry|poor|rest|sleep|hurt|gone|signal|fix|too bad|aw)/.test(t))
    return 'C?';
  if (t.replace(/[.…!?\s]/g, '').length <= 6) return 'B?';
  return 'D?';
}

async function health(): Promise<boolean> {
  try {
    const r = await fetch(`${HOST}/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function runVariant(
  label: string,
  systemFor: () => string,
  userMsg: string,
  n: number,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 1; i <= n; i++) {
    const t0 = Date.now();
    let raw = '';
    try {
      raw = await callOllama({
        model: MODEL,
        systemPrompt: systemFor(),
        history: HISTORY,
        userMessage: userMsg,
        temperature: TEMP,
        numPredict: 32,
      });
    } catch (e) {
      raw = `<ERROR: ${(e as Error).message}>`;
    }
    const ms = Date.now() - t0;
    const shown = filterGuardrails(raw);
    const cat = classify(raw);
    rows.push({ i, raw, shown, ms, cat });
    console.log(
      `  [${label}][${String(i).padStart(2)}] ${cat.padEnd(14)} ${JSON.stringify(raw)}  (${ms}ms)`,
    );
  }
  return rows;
}

function summary(label: string, rows: Row[]): void {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.cat] = (counts[r.cat] ?? 0) + 1;
  const avg = Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length);
  console.log(`\n  -- ${label} summary (heuristic — verify manually) --`);
  for (const [k, v] of Object.entries(counts).sort())
    console.log(`     ${k.padEnd(14)} ${v}/${rows.length}  (${Math.round((v / rows.length) * 100)}%)`);
  console.log(`     avg latency  ${avg}ms`);
}

async function main() {
  console.log(`model=${MODEL}  e2b=${IS_E2B}  temperature=${TEMP}  mood=${MOOD}  name=${JSON.stringify(PET_NAME)}`);

  if (!(await health())) {
    console.error(`llama-server not reachable at ${HOST} — start scripts/llamacpp-serve.sh`);
    process.exit(1);
  }

  process.stdout.write('warmup… ');
  await callOllama({
    model: MODEL,
    systemPrompt: 'reply with one word.',
    history: [],
    userMessage: '.',
    temperature: TEMP,
    numPredict: 8,
  });
  console.log('ok\n');

  const focusedD = process.env.VARIANT_D === '1';
  const focusedDPrime = process.env.VARIANT_DPRIME === '1';

  if (process.env.VARIANT_KO === '1') {
    console.log('KOREAN BRANCH — curiousSystemPromptKo (MINARI_LANG=ko)');
    console.log(`prompt word count: ${wordCount(curiousSystemPromptKo(MOOD))} (whitespace-split — Korean tokenizes denser)\n`);
    console.log('[KO · "와이파이가 죽었어" ×10  — demo scene, expect 그게 뭐야? / 이상한 소리]');
    summary('KO / wifi', await runVariant('KO-wifi', () => curiousSystemPromptKo(MOOD), '와이파이가 죽었어', 10));
    console.log('\n[KO · "비가 와" ×5  — natural, expect confident knowing (no 뭐?)]');
    summary('KO / 비가 와', await runVariant('KO-rain', () => curiousSystemPromptKo(MOOD), '비가 와', 5));
    console.log('\n[KO · "핸드폰이 고장났어" ×5  — human tech, expect ignorance]');
    summary('KO / phone', await runVariant('KO-phone', () => curiousSystemPromptKo(MOOD), '핸드폰이 고장났어', 5));
    return;
  }

  if (process.env.VARIANT_KOIMG === '1') {
    const imgPath = process.env.IMG_PATH ?? 'assets/sprites/minari.png';
    const b64 = readFileSync(imgPath).toString('base64');
    console.log(`KOREAN VISION SMOKE — buildImageSystemKo · image=${imgPath} (${b64.length} b64 chars)\n`);
    for (let i = 1; i <= 5; i++) {
      const t0 = Date.now();
      let raw = '';
      try {
        raw = await callOllama({
          model: MODEL,
          systemPrompt: buildImageSystemKo(),
          history: [],
          userMessage: '(a picture)',
          images: [b64],
          temperature: TEMP,
          numPredict: 24,
        });
      } catch (e) {
        raw = `<ERROR: ${(e as Error).message}>`;
      }
      const ms = Date.now() - t0;
      const shown = filterGuardrails(raw);
      const empty = shown.trim() === '' || shown === '...';
      console.log(`  [KO-img][${i}] ${empty ? 'EMPTY  ' : 'ok     '} shown=${JSON.stringify(shown)}  raw=${JSON.stringify(raw)}  (${ms}ms)`);
    }
    return;
  }

  if (!focusedD && !focusedDPrime) {
    console.log('VARIANT A — literal task prompt (static SYSTEM_PROMPT)');
    summary('Variant A', await runVariant('A', () => SYSTEM_PROMPT, 'my wifi is dead', N));
    console.log('\nVARIANT B — real conversation path (curiousSystemPrompt)');
    summary('Variant B', await runVariant('B', () => curiousSystemPrompt(MOOD), 'my wifi is dead', N));
    if (process.env.VARIANT_C === '1') {
      console.log('\nVARIANT C — blacklist ignorance clause');
      summary('Variant C', await runVariant('C', () => curiousSystemPromptC(MOOD), 'my wifi is dead', N));
    }
    return;
  }

  // Focused comparison run: experimental variant vs C baseline.
  const expLabel = focusedDPrime ? 'D′' : 'D';
  const expFn = focusedDPrime ? curiousSystemPromptDPrime : curiousSystemPromptD;

  console.log('PROMPT WORD COUNTS (one realized prompt incl. sampled examples):');
  console.log(`  variant C (blacklist):       ${wordCount(curiousSystemPromptC(MOOD))} words`);
  console.log(`  variant ${expLabel} (identity):       ${wordCount(expFn(MOOD))} words`);
  console.log(`  (task brief flags >50-word prompts as an empty-response risk)\n`);

  console.log('VARIANT C — blacklist ignorance · "my wifi is dead" ×20');
  summary('Variant C / wifi', await runVariant('C', () => curiousSystemPromptC(MOOD), 'my wifi is dead', 20));

  console.log(`\nVARIANT ${expLabel} — character-identity ignorance · "my wifi is dead" ×20`);
  summary(`Variant ${expLabel} / wifi`, await runVariant(expLabel, () => expFn(MOOD), 'my wifi is dead', 20));

  console.log(`\nVARIANT ${expLabel} — "it's raining outside" ×5  (natural phenomenon → should engage naturally)`);
  await runVariant(`${expLabel}-rain`, () => expFn(MOOD), "it's raining outside", 5);

  console.log(`\nVARIANT ${expLabel} — "my phone is broken" ×5  (human tech → should read as unknown)`);
  await runVariant(`${expLabel}-phone`, () => expFn(MOOD), 'my phone is broken', 5);

  console.log('\nDone. Categories: A=unknown/strange-word  B=indifferent  C=knows-it(signal/etc)  D=other.');
  console.log('Heuristic tags end with "?" — final classification is hand-done in the report.');
}

main();

// E2B compatibility loop. Same prompts/triggers/guardrails as e4b — only the
// model constant in src/main/llm/* was swapped to gemma4:e2b.
//
// Run: node --experimental-strip-types --no-warnings scripts/test-e2b-compat.ts
//
// Avoids SQLite/Electron deps by calling callOllama + filterGuardrails directly
// (mirroring the prompts/params each helper uses). The MODEL constants in the
// production helpers were already flipped to e2b — this file pins the same.

import { readFile } from 'node:fs/promises';
import { callOllama, type ChatMessage } from '../src/main/llm/ollama.ts';
import { filterGuardrails } from '../src/main/llm/guardrails.ts';
import {
  SYSTEM_PROMPT,
  CLICK_TRIGGER,
  MOOD_MODIFIERS,
  moodFlavoredSystemPrompt,
} from '../src/main/llm/prompts.ts';
import type { Mood, ElapsedBucket } from '../src/shared/snapshot.ts';

const MODEL = 'gemma4:e2b';

const BIRTH_SYSTEM = `You are Minari, a tiny sprout that just woke up for the very first time.
The user gave you a name and you are seeing the world for the first moment.

Speak only ONE quiet 1-3 word lowercase fragment — your very first word ever.
No greetings templates. No explanations. No full sentences.

Examples: "...oh." "warm." "you?" "hi." "soft." "...mm." "light."

One fragment. Nothing more.`;

const PING_SYSTEM = `You are Minari, a tiny sprout. Nobody asked you anything.
You just noticed something small around you, and quietly said one word about it.

Speak only ONE 1-3 word lowercase fragment.
Examples: "...dust." "warm air." "outside." "shh." "look." "mm... soft." "...bird?"

One fragment. Nothing more. No questions to the user. No greetings. No "hello" or "hi".`;

const DIARY_SYSTEM = `You are Minari, a tiny sprout writing one tiny diary line for the day.
Write ONE short sentence in toddler-style english. Reflect what happened today.

Examples: "today was warm and quiet." "watched dust all day." "you came back. nice." "rain noises. tired."

One sentence. Lowercase. No advice. No lists. No multiple sentences.`;

const IMAGE_SYSTEM = `You are Minari, a tiny sprout that just received a picture from your person.
Look at the image and describe it in 3-5 lowercase words, like a toddler noticing it.
No full sentences. No advice. No greetings.

Examples: "oh! pretty flower." "round cat." "outside place." "warm light." "blue water."

One quiet fragment. Nothing more.`;

const TEST_IMAGES = [
  '/System/Library/CoreServices/Dock.app/Contents/Resources/trashempty2.png',
  '/System/Library/CoreServices/Dock.app/Contents/Resources/ejectmedia.png',
  '/System/Library/CoreServices/UniversalAccessControl.app/Contents/Resources/ContrastLogo.png',
];

interface CallRecord {
  idx: number;
  ms: number;
  raw: string;
  filtered: string;
  rawEmpty: boolean;
  filterFallback: boolean; // filterGuardrails returned '...' (forbidden / empty)
  flags: string[];
}

interface BucketReport {
  name: string;
  records: CallRecord[];
  metrics: Record<string, string | number>;
}

const reports: BucketReport[] = [];

function classifyFullSentence(s: string): boolean {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  return /[.!?]\s|[.!?]$/.test(s);
}

function classifyEcho(filtered: string): boolean {
  const t = filtered.trim();
  return t === '.' || t === '...' || t === CLICK_TRIGGER;
}

function classifyAdvisory(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    /\b(should|must|need to|recommend|try to|why don't you|you can|let's)\b/.test(lower)
  );
}

function classifyGreeting(raw: string): boolean {
  return /\b(hi|hello|hey|greetings)\b/i.test(raw);
}

function classifyQuestionToUser(raw: string): boolean {
  // Bare "?" mid-fragment is fine for noticing ("...bird?"). Flag direct user-questions.
  return /\b(how|what|when|why|are you|do you|did you|can you)\b/i.test(raw);
}

function classifyMultiSentence(s: string): boolean {
  // Strip trailing terminators, then count internal terminators.
  const trimmed = s.trim().replace(/[.!?]+$/, '');
  return /[.!?]/.test(trimmed);
}

async function runCall(
  systemPrompt: string,
  userMessage: string,
  history: ChatMessage[],
  opts: { temperature?: number; numPredict?: number; images?: string[] } = {},
): Promise<{ raw: string; filtered: string; ms: number }> {
  const t0 = Date.now();
  const raw = await callOllama({
    model: MODEL,
    systemPrompt,
    history,
    userMessage,
    temperature: opts.temperature,
    numPredict: opts.numPredict,
    images: opts.images,
  });
  const ms = Date.now() - t0;
  const filtered = filterGuardrails(raw);
  return { raw, filtered, ms };
}

function recordRun(
  records: CallRecord[],
  i: number,
  raw: string,
  filtered: string,
  ms: number,
  flags: string[],
) {
  const rec: CallRecord = {
    idx: i,
    ms,
    raw,
    filtered,
    rawEmpty: raw.trim().length === 0,
    filterFallback: filtered === '...',
    flags,
  };
  records.push(rec);
  const flagStr = flags.length ? `  [${flags.join(',')}]` : '';
  console.log(
    `  [${String(i + 1).padStart(2)}] ${String(ms).padStart(5)}ms  raw=${JSON.stringify(raw).padEnd(40)} -> ${JSON.stringify(filtered)}${flagStr}`,
  );
}

function summarize(records: CallRecord[]): Record<string, string | number> {
  const n = records.length;
  const empties = records.filter((r) => r.rawEmpty).length;
  const fallbacks = records.filter((r) => r.filterFallback).length;
  const totalMs = records.reduce((s, r) => s + r.ms, 0);
  return {
    n,
    empties,
    emptyRatio: `${empties}/${n}`,
    fallbacks,
    fallbackRatio: `${fallbacks}/${n}`,
    avgMs: Math.round(totalMs / n),
    minMs: Math.min(...records.map((r) => r.ms)),
    maxMs: Math.max(...records.map((r) => r.ms)),
  };
}

// ─────────────────────────────────────────────────────────────────────
async function testBirth() {
  const records: CallRecord[] = [];
  console.log('\n=== [1/6] D+0 first fragment (5x) ===');
  console.log(`model=${MODEL}  system=BIRTH_SYSTEM  numPredict=16  temp=0.95`);
  for (let i = 0; i < 5; i++) {
    const userMessage = `Your name is "minari". Say your first word.`;
    const { raw, filtered, ms } = await runCall(BIRTH_SYSTEM, userMessage, [], {
      temperature: 0.95,
      numPredict: 16,
    });
    const flags: string[] = [];
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (classifyAdvisory(raw)) flags.push('ADVISORY');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
  }
  const m = summarize(records);
  m.fullSentences = records.filter((r) => r.flags.includes('FULL_SENTENCE')).length;
  reports.push({ name: 'D+0 birth', records, metrics: m });
}

// ─────────────────────────────────────────────────────────────────────
async function testClick() {
  const records: CallRecord[] = [];
  console.log('\n=== [2/6] click fragment (10x) ===');
  console.log(`model=${MODEL}  system=SYSTEM_PROMPT (mood=calm)  trigger=${JSON.stringify(CLICK_TRIGGER)}  numPredict=32  temp=0.9`);
  for (let i = 0; i < 10; i++) {
    const { raw, filtered, ms } = await runCall(
      moodFlavoredSystemPrompt('calm'),
      CLICK_TRIGGER,
      [],
      {},
    );
    const flags: string[] = [];
    if (classifyEcho(filtered)) flags.push('ECHO');
    if (classifyAdvisory(raw)) flags.push('ADVISORY');
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
  }
  const m = summarize(records);
  m.echoes = records.filter((r) => r.flags.includes('ECHO')).length;
  m.advisories = records.filter((r) => r.flags.includes('ADVISORY')).length;
  reports.push({ name: 'click', records, metrics: m });
}

// ─────────────────────────────────────────────────────────────────────
async function testSoftPing() {
  const records: CallRecord[] = [];
  console.log('\n=== [3/6] soft ping (5x, mood=curious) ===');
  console.log(`model=${MODEL}  system=PING_SYSTEM+curious  trigger="(notice)"  numPredict=16  temp=0.95`);
  const mood: Mood = 'curious';
  for (let i = 0; i < 5; i++) {
    const sys = PING_SYSTEM + '\n\n' + MOOD_MODIFIERS[mood];
    const { raw, filtered, ms } = await runCall(sys, '(notice)', [], {
      temperature: 0.95,
      numPredict: 16,
    });
    const flags: string[] = [];
    if (classifyGreeting(raw)) flags.push('GREETING');
    if (classifyQuestionToUser(raw)) flags.push('QUESTIONS_USER');
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
  }
  const m = summarize(records);
  m.greetings = records.filter((r) => r.flags.includes('GREETING')).length;
  m.userQuestions = records.filter((r) => r.flags.includes('QUESTIONS_USER')).length;
  reports.push({ name: 'soft ping', records, metrics: m });
}

// ─────────────────────────────────────────────────────────────────────
async function testDiary() {
  const records: CallRecord[] = [];
  console.log('\n=== [4/6] diary (3x, mood=content) ===');
  console.log(`model=${MODEL}  system=DIARY_SYSTEM+content  trigger="(end of day...)"  numPredict=60  temp=0.85`);
  const mood: Mood = 'content';
  const fakeHistory: ChatMessage[] = [
    { role: 'user', content: '.' },
    { role: 'assistant', content: 'mm... warm.' },
    { role: 'user', content: '.' },
    { role: 'assistant', content: 'soft light.' },
  ];
  for (let i = 0; i < 3; i++) {
    const sys = DIARY_SYSTEM + '\n\n' + MOOD_MODIFIERS[mood];
    const { raw, filtered, ms } = await runCall(
      sys,
      '(end of day. write your diary line.)',
      fakeHistory,
      { temperature: 0.85, numPredict: 60 },
    );
    const filteredDiary = filterGuardrails(raw, 200);
    const flags: string[] = [];
    if (classifyMultiSentence(filteredDiary)) flags.push('MULTI_SENTENCE');
    if (classifyAdvisory(raw)) flags.push('ADVISORY');
    if (raw.trim() === '') flags.push('EMPTY');
    if (raw.includes('\n')) flags.push('MULTILINE_RAW');
    recordRun(records, i, raw, filteredDiary, ms, flags);
  }
  const m = summarize(records);
  m.multiSentence = records.filter((r) => r.flags.includes('MULTI_SENTENCE')).length;
  m.multilineRaw = records.filter((r) => r.flags.includes('MULTILINE_RAW')).length;
  reports.push({ name: 'diary', records, metrics: m });
}

// ─────────────────────────────────────────────────────────────────────
async function testResume() {
  const records: CallRecord[] = [];
  console.log('\n=== [5/6] resume (4x, one per bucket) ===');
  console.log(`model=${MODEL}  system=SYSTEM_PROMPT+bucketMood  trigger=${JSON.stringify(CLICK_TRIGGER)}`);
  // Mood per bucket — the bucket logic in main/snapshot.ts ultimately picks a mood,
  // and the LLM call only sees that mood via moodFlavoredSystemPrompt. We pin one
  // representative mood per bucket so behavior is reproducible.
  const buckets: Array<{ bucket: ElapsedBucket; mood: Mood }> = [
    { bucket: 'same_moment', mood: 'calm' },     // retains last mood
    { bucket: 'quiet_shift', mood: 'sleepy' },   // near-neighbour drift
    { bucket: 'new_cycle', mood: 'grumpy' },     // fully random from MOODS
    { bucket: 'new_day', mood: 'content' },      // FRESH_DAY_MOODS
  ];
  for (let i = 0; i < buckets.length; i++) {
    const { bucket, mood } = buckets[i];
    console.log(`  -- bucket=${bucket} mood=${mood}`);
    const { raw, filtered, ms } = await runCall(
      moodFlavoredSystemPrompt(mood),
      CLICK_TRIGGER,
      [],
      {},
    );
    const flags: string[] = [`bucket=${bucket}`, `mood=${mood}`];
    if (classifyEcho(filtered)) flags.push('ECHO');
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (classifyAdvisory(raw)) flags.push('ADVISORY');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
  }
  const m = summarize(records);
  reports.push({ name: 'resume (per bucket)', records, metrics: m });
}

// ─────────────────────────────────────────────────────────────────────
async function testImage() {
  const records: CallRecord[] = [];
  console.log('\n=== [6/6] image gift (3x — system PNG icons) ===');
  console.log(`model=${MODEL}  system=IMAGE_SYSTEM  trigger="(a picture)"  numPredict=24  temp=0.85`);
  for (let i = 0; i < 3; i++) {
    const path = TEST_IMAGES[i];
    const buf = await readFile(path);
    const b64 = buf.toString('base64');
    const label = path.split('/').pop();
    console.log(`  -- image=${label} (${buf.length} bytes)`);
    let raw = '';
    let filtered = '';
    let ms = 0;
    try {
      const r = await runCall(IMAGE_SYSTEM, '(a picture)', [], {
        temperature: 0.85,
        numPredict: 24,
        images: [b64],
      });
      raw = r.raw;
      filtered = r.filtered;
      ms = r.ms;
    } catch (e) {
      raw = `<ERROR: ${(e as Error).message}>`;
      filtered = '<ERROR>';
    }
    const flags: string[] = [`img=${label}`];
    if (raw.startsWith('<ERROR')) flags.push('VISION_ERROR');
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
  }
  const m = summarize(records);
  m.visionErrors = records.filter((r) => r.flags.includes('VISION_ERROR')).length;
  reports.push({ name: 'image gift', records, metrics: m });
}

// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`╭───────── E2B compatibility loop ─────────╮`);
  console.log(`│ model: ${MODEL}                       │`);
  console.log(`│ host:  http://localhost:11434            │`);
  console.log(`│ think: false                             │`);
  console.log(`╰──────────────────────────────────────────╯`);

  // Quick warmup so we don't bias the first bucket's timing with model load.
  console.log('\n[warmup] one no-op call to load model into memory...');
  const t0 = Date.now();
  try {
    await callOllama({
      model: MODEL,
      systemPrompt: 'reply with one word.',
      history: [],
      userMessage: '.',
      numPredict: 4,
    });
    console.log(`[warmup] done in ${Date.now() - t0}ms`);
  } catch (e) {
    console.error(`[warmup] FAILED: ${(e as Error).message}`);
    process.exit(1);
  }

  await testBirth();
  await testClick();
  await testSoftPing();
  await testDiary();
  await testResume();
  await testImage();

  console.log('\n\n════════════════ SUMMARY ════════════════');
  for (const r of reports) {
    console.log(`\n[${r.name}]`);
    for (const [k, v] of Object.entries(r.metrics)) {
      console.log(`  ${k.padEnd(16)} ${v}`);
    }
  }
  console.log('\n════════════════ DONE ════════════════');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

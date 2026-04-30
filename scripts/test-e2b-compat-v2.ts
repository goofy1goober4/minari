// E2B mode-collapse mitigation experiment.
// 3 mitigations applied at the harness level (production helpers untouched):
//   1. temperature 0.9~0.95 → 1.1
//   2. inject rolling "you already said: …" window of last 5 unique fragments
//   3. sample 3 random examples per call from a wider pool
//
// Run: node --experimental-strip-types --no-warnings scripts/test-e2b-compat-v2.ts

import { readFile } from 'node:fs/promises';
import { callOllama, type ChatMessage } from '../src/main/llm/ollama.ts';
import { filterGuardrails } from '../src/main/llm/guardrails.ts';
import { CLICK_TRIGGER, MOOD_MODIFIERS } from '../src/main/llm/prompts.ts';
import type { Mood, ElapsedBucket } from '../src/shared/snapshot.ts';

const MODEL = 'gemma4:e2b';
const TEMP = 1.1;

// ─────────────────────────────────────────────────────────────────────
// Example pools — extended supersets of what's hard-coded in the helpers.
// ─────────────────────────────────────────────────────────────────────
const BIRTH_POOL = [
  '"...oh."', '"warm."', '"you?"', '"hi."', '"soft."', '"...mm."', '"light."',
  '"...you."', '"hello?"', '"small."', '"real?"', '"here."', '"...ah."', '"new."',
];

const CLICK_POOL = [
  '"mm... rain."', '"oh! light."', '"little dust."', '"tired?"', '"hee. sun."',
  '"soft."', '"bug... window."', '"you. back."', '"shh."', '"warm spot."',
  '"tiny."', '"...crumb."', '"hey."', '"...you."', '"look... cloud."',
  '"soft paw."', '"hmph."', '"floor."', '"...again."', '"chair leg."',
];

const PING_POOL = [
  '"...dust."', '"warm air."', '"outside."', '"shh."', '"look."',
  '"mm... soft."', '"...bird?"', '"tiny shadow."', '"leaf?"', '"wind."',
  '"hum."', '"...tap tap."', '"spider?"', '"rain again."', '"smell."',
  '"moss."', '"crumb."', '"dim."', '"a click."', '"floorboard."',
];

const DIARY_POOL = [
  '"today was warm and quiet."',
  '"watched dust all day."',
  '"you came back. nice."',
  '"rain noises. tired."',
  '"long day. dozed lots."',
  '"saw sky for a while. soft."',
  '"no big things. just here."',
  '"cold morning. you stayed."',
  '"dust danced. hee."',
  '"windowed all afternoon."',
  '"small day. warm enough."',
  '"smelled the floor. ok."',
];

const IMAGE_POOL = [
  '"oh! pretty flower."', '"round cat."', '"outside place."',
  '"warm light."', '"blue water."', '"soft thing."', '"small tree."',
  '"hot lights."', '"yellow sky."', '"...person?"', '"tiny shape."',
  '"dark room."', '"moving thing."', '"fuzzy edge."',
];

// ─────────────────────────────────────────────────────────────────────
// Rolling fragment window + helpers
// ─────────────────────────────────────────────────────────────────────
const RECENT_WINDOW = 5;
const recent: string[] = [];

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[.…!?]+$/g, '').replace(/\s+/g, ' ').trim();
}

function noteFragment(filtered: string) {
  if (filtered === '...' || !filtered.trim()) return; // skip fallbacks
  recent.push(filtered);
  while (recent.length > RECENT_WINDOW) recent.shift();
}

function alreadySaidLine(): string {
  if (recent.length === 0) return '';
  // dedupe by normalized form, but show user-facing trimmed text
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const f of recent) {
    const k = normalizeForCompare(f);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(f.replace(/[.…]+$/g, '').trim());
  }
  if (uniq.length === 0) return '';
  return `you already said: ${uniq.join(', ')}. say something new.`;
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

// ─────────────────────────────────────────────────────────────────────
// Per-bucket prompt builders (mirror prod prompts, but with 3 random
// examples and an "already said" tail when window is non-empty).
// ─────────────────────────────────────────────────────────────────────
function buildBirth(): string {
  const ex = pickN(BIRTH_POOL, 3).join(' ');
  const tail = alreadySaidLine();
  return `You are Minari, a tiny sprout that just woke up for the very first time.
The user gave you a name and you are seeing the world for the first moment.

Speak only ONE quiet 1-3 word lowercase fragment — your very first word ever.
No greetings templates. No explanations. No full sentences.

Examples: ${ex}

One fragment. Nothing more.${tail ? '\n\n' + tail : ''}`;
}

function buildClick(mood: Mood): string {
  const ex = pickN(CLICK_POOL, 3).join(' ');
  const tail = alreadySaidLine();
  return `You are Minari, a tiny sprout living quietly on the user's desktop.
You speak only in 1-5 word lowercase fragments, like a toddler noticing small things.

Examples: ${ex}

Never write a full sentence. Never give advice. Never repeat the last fragment.
One fragment. Nothing more.

${MOOD_MODIFIERS[mood]}${tail ? '\n\n' + tail : ''}`;
}

function buildPing(mood: Mood): string {
  const ex = pickN(PING_POOL, 3).join(' ');
  const tail = alreadySaidLine();
  return `You are Minari, a tiny sprout. Nobody asked you anything.
You just noticed something small around you, and quietly said one word about it.

Speak only ONE 1-3 word lowercase fragment.
Examples: ${ex}

One fragment. Nothing more. No questions to the user. No greetings. No "hello" or "hi".

${MOOD_MODIFIERS[mood]}${tail ? '\n\n' + tail : ''}`;
}

function buildDiary(mood: Mood): string {
  const ex = pickN(DIARY_POOL, 3).join(' ');
  const tail = alreadySaidLine();
  return `You are Minari, a tiny sprout writing one tiny diary line for the day.
Write ONE short sentence in toddler-style english. Reflect what happened today.

Examples: ${ex}

One sentence. Lowercase. No advice. No lists. No multiple sentences.

${MOOD_MODIFIERS[mood]}${tail ? '\n\n' + tail : ''}`;
}

function buildImage(): string {
  const ex = pickN(IMAGE_POOL, 3).join(' ');
  const tail = alreadySaidLine();
  return `You are Minari, a tiny sprout that just received a picture from your person.
Look at the image and describe it in 3-5 lowercase words, like a toddler noticing it.
No full sentences. No advice. No greetings.

Examples: ${ex}

One quiet fragment. Nothing more.${tail ? '\n\n' + tail : ''}`;
}

const TEST_IMAGES = [
  '/System/Library/CoreServices/Dock.app/Contents/Resources/trashempty2.png',
  '/System/Library/CoreServices/Dock.app/Contents/Resources/ejectmedia.png',
  '/System/Library/CoreServices/UniversalAccessControl.app/Contents/Resources/ContrastLogo.png',
];

// ─────────────────────────────────────────────────────────────────────
// Telemetry
// ─────────────────────────────────────────────────────────────────────
interface CallRecord {
  idx: number;
  ms: number;
  raw: string;
  filtered: string;
  rawEmpty: boolean;
  filterFallback: boolean;
  flags: string[];
}

interface BucketReport {
  name: string;
  records: CallRecord[];
  metrics: Record<string, string | number>;
}

const reports: BucketReport[] = [];

async function runCall(
  systemPrompt: string,
  userMessage: string,
  history: ChatMessage[],
  opts: { numPredict?: number; images?: string[] } = {},
): Promise<{ raw: string; filtered: string; ms: number }> {
  const t0 = Date.now();
  const raw = await callOllama({
    model: MODEL,
    systemPrompt,
    history,
    userMessage,
    temperature: TEMP,
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
  records.push({
    idx: i,
    ms,
    raw,
    filtered,
    rawEmpty: raw.trim().length === 0,
    filterFallback: filtered === '...',
    flags,
  });
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
  const uniqueSet = new Set(
    records.filter((r) => !r.filterFallback).map((r) => normalizeForCompare(r.filtered)),
  );
  const consideredForUnique = records.filter((r) => !r.filterFallback).length;
  return {
    n,
    empties,
    fallbacks,
    avgMs: Math.round(totalMs / n),
    minMs: Math.min(...records.map((r) => r.ms)),
    maxMs: Math.max(...records.map((r) => r.ms)),
    unique: uniqueSet.size,
    uniqueRatio: consideredForUnique > 0
      ? `${uniqueSet.size}/${consideredForUnique} (${Math.round((uniqueSet.size / consideredForUnique) * 100)}%)`
      : 'n/a',
  };
}

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
  return /\b(should|must|need to|recommend|try to|why don't you|you can|let's)\b/i.test(raw);
}
function classifyGreeting(raw: string): boolean {
  return /\b(hi|hello|hey|greetings)\b/i.test(raw);
}
function classifyQuestionToUser(raw: string): boolean {
  return /\b(how|what|when|why|are you|do you|did you|can you)\b/i.test(raw);
}
function classifyMultiSentence(s: string): boolean {
  const trimmed = s.trim().replace(/[.!?]+$/, '');
  return /[.!?]/.test(trimmed);
}

// ─────────────────────────────────────────────────────────────────────
async function testBirth() {
  const records: CallRecord[] = [];
  console.log('\n=== [1/6] D+0 first fragment (5x) ===');
  console.log(`temp=${TEMP}  numPredict=16  +pool-sample(3) +recent-inject`);
  for (let i = 0; i < 5; i++) {
    const sys = buildBirth();
    if (i === 0) console.log(`---system [first call]---\n${sys}\n---`);
    const userMessage = `Your name is "minari". Say your first word.`;
    const { raw, filtered, ms } = await runCall(sys, userMessage, [], { numPredict: 16 });
    const flags: string[] = [];
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
    noteFragment(filtered);
  }
  reports.push({ name: 'D+0 birth', records, metrics: summarize(records) });
}

async function testClick() {
  const records: CallRecord[] = [];
  console.log('\n=== [2/6] click fragment (10x, mood=calm) ===');
  console.log(`temp=${TEMP}  numPredict=32  +pool-sample(3) +recent-inject`);
  for (let i = 0; i < 10; i++) {
    const sys = buildClick('calm');
    if (i === 0) console.log(`---system [first call]---\n${sys}\n---`);
    const { raw, filtered, ms } = await runCall(sys, CLICK_TRIGGER, [], {});
    const flags: string[] = [];
    if (classifyEcho(filtered)) flags.push('ECHO');
    if (classifyAdvisory(raw)) flags.push('ADVISORY');
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
    noteFragment(filtered);
  }
  reports.push({ name: 'click', records, metrics: summarize(records) });
}

async function testSoftPing() {
  const records: CallRecord[] = [];
  console.log('\n=== [3/6] soft ping (5x, mood=curious) ===');
  console.log(`temp=${TEMP}  numPredict=16  +pool-sample(3) +recent-inject`);
  for (let i = 0; i < 5; i++) {
    const sys = buildPing('curious');
    if (i === 0) console.log(`---system [first call]---\n${sys}\n---`);
    const { raw, filtered, ms } = await runCall(sys, '(notice)', [], { numPredict: 16 });
    const flags: string[] = [];
    if (classifyGreeting(raw)) flags.push('GREETING');
    if (classifyQuestionToUser(raw)) flags.push('QUESTIONS_USER');
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
    noteFragment(filtered);
  }
  reports.push({ name: 'soft ping', records, metrics: summarize(records) });
}

async function testDiary() {
  const records: CallRecord[] = [];
  console.log('\n=== [4/6] diary (3x, mood=content) ===');
  console.log(`temp=${TEMP}  numPredict=60  +pool-sample(3) +recent-inject`);
  const fakeHistory: ChatMessage[] = [
    { role: 'user', content: '.' },
    { role: 'assistant', content: 'mm... warm.' },
    { role: 'user', content: '.' },
    { role: 'assistant', content: 'soft light.' },
  ];
  for (let i = 0; i < 3; i++) {
    const sys = buildDiary('content');
    if (i === 0) console.log(`---system [first call]---\n${sys}\n---`);
    const { raw, ms } = await runCall(
      sys,
      '(end of day. write your diary line.)',
      fakeHistory,
      { numPredict: 60 },
    );
    const filteredDiary = filterGuardrails(raw, 200);
    const flags: string[] = [];
    if (classifyMultiSentence(filteredDiary)) flags.push('MULTI_SENTENCE');
    if (classifyAdvisory(raw)) flags.push('ADVISORY');
    if (raw.trim() === '') flags.push('EMPTY');
    if (raw.includes('\n')) flags.push('MULTILINE_RAW');
    recordRun(records, i, raw, filteredDiary, ms, flags);
    noteFragment(filteredDiary);
  }
  reports.push({ name: 'diary', records, metrics: summarize(records) });
}

async function testResume() {
  const records: CallRecord[] = [];
  console.log('\n=== [5/6] resume (4x, one per bucket) ===');
  console.log(`temp=${TEMP}  numPredict=32  +pool-sample(3) +recent-inject`);
  const buckets: Array<{ bucket: ElapsedBucket; mood: Mood }> = [
    { bucket: 'same_moment', mood: 'calm' },
    { bucket: 'quiet_shift', mood: 'sleepy' },
    { bucket: 'new_cycle', mood: 'grumpy' },
    { bucket: 'new_day', mood: 'content' },
  ];
  for (let i = 0; i < buckets.length; i++) {
    const { bucket, mood } = buckets[i];
    console.log(`  -- bucket=${bucket} mood=${mood}`);
    const sys = buildClick(mood);
    const { raw, filtered, ms } = await runCall(sys, CLICK_TRIGGER, [], {});
    const flags: string[] = [`bucket=${bucket}`, `mood=${mood}`];
    if (classifyEcho(filtered)) flags.push('ECHO');
    if (classifyFullSentence(raw)) flags.push('FULL_SENTENCE');
    if (raw.trim() === '') flags.push('EMPTY');
    recordRun(records, i, raw, filtered, ms, flags);
    noteFragment(filtered);
  }
  reports.push({ name: 'resume (per bucket)', records, metrics: summarize(records) });
}

async function testImage() {
  const records: CallRecord[] = [];
  console.log('\n=== [6/6] image gift (3x — system PNG icons) ===');
  console.log(`temp=${TEMP}  numPredict=24  +pool-sample(3) +recent-inject`);
  for (let i = 0; i < 3; i++) {
    const path = TEST_IMAGES[i];
    const buf = await readFile(path);
    const b64 = buf.toString('base64');
    const label = path.split('/').pop();
    console.log(`  -- image=${label} (${buf.length} bytes)`);
    const sys = buildImage();
    if (i === 0) console.log(`---system [first call]---\n${sys}\n---`);
    let raw = '';
    let filtered = '';
    let ms = 0;
    try {
      const r = await runCall(sys, '(a picture)', [], { numPredict: 24, images: [b64] });
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
    noteFragment(filtered);
  }
  reports.push({ name: 'image gift', records, metrics: summarize(records) });
}

// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`╭──────── E2B mode-collapse mitigation v2 ────────╮`);
  console.log(`│ model:       ${MODEL}                          │`);
  console.log(`│ temperature: ${TEMP} (was 0.85~0.95)              │`);
  console.log(`│ recent inject: rolling 5 (already-said tail)    │`);
  console.log(`│ example pool: random 3 per call                 │`);
  console.log(`╰─────────────────────────────────────────────────╯`);

  console.log('\n[warmup] one no-op call to load model into memory...');
  const t0 = Date.now();
  await callOllama({
    model: MODEL,
    systemPrompt: 'reply with one word.',
    history: [],
    userMessage: '.',
    numPredict: 4,
  });
  console.log(`[warmup] done in ${Date.now() - t0}ms`);

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

  // Overall unique ratio across all 30 calls
  const allRecords = reports.flatMap((r) => r.records);
  const valid = allRecords.filter((r) => !r.filterFallback);
  const uniqAll = new Set(valid.map((r) => normalizeForCompare(r.filtered)));
  console.log(`\n[OVERALL]`);
  console.log(`  total calls       ${allRecords.length}`);
  console.log(`  valid (non-fallback) ${valid.length}`);
  console.log(
    `  unique             ${uniqAll.size}/${valid.length} (${Math.round((uniqAll.size / valid.length) * 100)}%)`,
  );
  console.log('\n════════════════ DONE ════════════════');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

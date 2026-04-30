// E2B compatibility loop v3 — drives the real production helpers (after the
// pool-sample + recent-inject backport). Model is selected via MINARI_MODEL.
//
// Run with E2B:  MINARI_MODEL=gemma4:e2b npx tsx scripts/test-e2b-compat-v3.ts
// Run with E4B:  MINARI_MODEL=gemma4:e4b npx tsx scripts/test-e2b-compat-v3.ts
//
// (tsx, not `node --experimental-strip-types`, because the helpers chain into
// `./ollama` / `./guardrails` etc. with extensionless imports — fine for Vite,
// but Node's strip-types loader requires explicit `.ts` extensions.)
//
// Helpers used directly: birthFragment, pingFragment, diary, imageReact.
// Click + resume bypass speak.ts (DB-bound) and call callOllama with
// moodFlavoredSystemPrompt — the same composition speak.ts uses internally.

import { readFile } from 'node:fs/promises';
import { callOllama, type ChatMessage } from '../src/main/llm/ollama';
import { filterGuardrails } from '../src/main/llm/guardrails';
import { CLICK_TRIGGER, moodFlavoredSystemPrompt } from '../src/main/llm/prompts';
import { MODEL, IS_E2B, effectiveTemperature } from '../src/main/llm/model';
import {
  noteRecentSpoken,
  clearRecentSpoken,
} from '../src/main/llm/recentSpoken';
import { generateBirthFragment } from '../src/main/llm/birthFragment';
import { generateNoticingFragment } from '../src/main/llm/pingFragment';
import { generateDiaryEntry } from '../src/main/llm/diary';
import { reactToImage } from '../src/main/llm/imageReact';
import type { Mood, ElapsedBucket } from '../src/shared/snapshot';

const TEST_IMAGES = [
  '/System/Library/CoreServices/Dock.app/Contents/Resources/trashempty2.png',
  '/System/Library/CoreServices/Dock.app/Contents/Resources/ejectmedia.png',
  '/System/Library/CoreServices/UniversalAccessControl.app/Contents/Resources/ContrastLogo.png',
];

interface CallRecord {
  idx: number;
  ms: number;
  filtered: string;
  filterFallback: boolean;
  flags: string[];
}

interface BucketReport {
  name: string;
  records: CallRecord[];
  metrics: Record<string, string | number>;
}

const reports: BucketReport[] = [];

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[.…!?]+$/g, '').replace(/\s+/g, ' ').trim();
}

function recordRun(
  records: CallRecord[],
  i: number,
  filtered: string,
  ms: number,
  flags: string[],
) {
  records.push({
    idx: i,
    ms,
    filtered,
    filterFallback: filtered === '...',
    flags,
  });
  const flagStr = flags.length ? `  [${flags.join(',')}]` : '';
  console.log(
    `  [${String(i + 1).padStart(2)}] ${String(ms).padStart(5)}ms  -> ${JSON.stringify(filtered).padEnd(36)}${flagStr}`,
  );
}

function summarize(records: CallRecord[]): Record<string, string | number> {
  const n = records.length;
  const fallbacks = records.filter((r) => r.filterFallback).length;
  const totalMs = records.reduce((s, r) => s + r.ms, 0);
  const valid = records.filter((r) => !r.filterFallback);
  const uniq = new Set(valid.map((r) => normalizeForCompare(r.filtered)));
  return {
    n,
    fallbacks,
    avgMs: Math.round(totalMs / n),
    minMs: Math.min(...records.map((r) => r.ms)),
    maxMs: Math.max(...records.map((r) => r.ms)),
    uniqueRatio: valid.length > 0
      ? `${uniq.size}/${valid.length} (${Math.round((uniq.size / valid.length) * 100)}%)`
      : 'n/a',
  };
}

// ─────────────────────────────────────────────────────────────────────
async function testBirth() {
  const records: CallRecord[] = [];
  console.log('\n=== [1/6] D+0 birth (5x) ===');
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const filtered = await generateBirthFragment('minari');
    const ms = Date.now() - t0;
    recordRun(records, i, filtered, ms, []);
  }
  reports.push({ name: 'D+0 birth', records, metrics: summarize(records) });
}

async function testClick() {
  const records: CallRecord[] = [];
  console.log('\n=== [2/6] click (10x, mood=calm) ===');
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    const raw = await callOllama({
      model: MODEL,
      systemPrompt: moodFlavoredSystemPrompt('calm'),
      history: [],
      userMessage: CLICK_TRIGGER,
      temperature: effectiveTemperature(0.9),
    });
    const ms = Date.now() - t0;
    const filtered = filterGuardrails(raw);
    noteRecentSpoken(filtered);
    recordRun(records, i, filtered, ms, []);
  }
  reports.push({ name: 'click', records, metrics: summarize(records) });
}

async function testSoftPing() {
  const records: CallRecord[] = [];
  console.log('\n=== [3/6] soft ping (5x, mood=curious) ===');
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const filtered = await generateNoticingFragment('curious');
    const ms = Date.now() - t0;
    recordRun(records, i, filtered, ms, []);
  }
  reports.push({ name: 'soft ping', records, metrics: summarize(records) });
}

async function testDiary() {
  const records: CallRecord[] = [];
  console.log('\n=== [4/6] diary (3x, mood=content) ===');
  const fakeHistory: ChatMessage[] = [
    { role: 'user', content: '.' },
    { role: 'assistant', content: 'mm... warm.' },
    { role: 'user', content: '.' },
    { role: 'assistant', content: 'soft light.' },
  ];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const filtered = await generateDiaryEntry(fakeHistory, 'content');
    const ms = Date.now() - t0;
    recordRun(records, i, filtered, ms, []);
  }
  reports.push({ name: 'diary', records, metrics: summarize(records) });
}

async function testResume() {
  const records: CallRecord[] = [];
  console.log('\n=== [5/6] resume (4x, one per bucket) ===');
  const buckets: Array<{ bucket: ElapsedBucket; mood: Mood }> = [
    { bucket: 'same_moment', mood: 'calm' },
    { bucket: 'quiet_shift', mood: 'sleepy' },
    { bucket: 'new_cycle', mood: 'grumpy' },
    { bucket: 'new_day', mood: 'content' },
  ];
  for (let i = 0; i < buckets.length; i++) {
    const { bucket, mood } = buckets[i];
    const t0 = Date.now();
    const raw = await callOllama({
      model: MODEL,
      systemPrompt: moodFlavoredSystemPrompt(mood),
      history: [],
      userMessage: CLICK_TRIGGER,
      temperature: effectiveTemperature(0.9),
    });
    const ms = Date.now() - t0;
    const filtered = filterGuardrails(raw);
    noteRecentSpoken(filtered);
    recordRun(records, i, filtered, ms, [`bucket=${bucket}`, `mood=${mood}`]);
  }
  reports.push({ name: 'resume (per bucket)', records, metrics: summarize(records) });
}

async function testImage() {
  const records: CallRecord[] = [];
  console.log('\n=== [6/6] image gift (3x) ===');
  for (let i = 0; i < 3; i++) {
    const path = TEST_IMAGES[i];
    const buf = await readFile(path);
    const b64 = buf.toString('base64');
    const label = path.split('/').pop();
    const t0 = Date.now();
    let filtered = '';
    try {
      filtered = await reactToImage(b64);
    } catch (e) {
      filtered = `<ERROR: ${(e as Error).message}>`;
    }
    const ms = Date.now() - t0;
    recordRun(records, i, filtered, ms, [`img=${label}`]);
  }
  reports.push({ name: 'image gift', records, metrics: summarize(records) });
}

async function main() {
  console.log(`╭──────── E2B/E4B compat loop v3 ────────╮`);
  console.log(`│ MINARI_MODEL: ${MODEL}                ${IS_E2B ? '(E2B)' : '(E4B)'}    │`);
  console.log(`│ temperature:  ${IS_E2B ? '1.1 (E2B override)' : 'per-helper baseline (E4B)'}     │`);
  console.log(`│ recent inject: ON (rolling 5)          │`);
  console.log(`│ pool sampling: ON (3 per call)         │`);
  console.log(`╰────────────────────────────────────────╯`);

  clearRecentSpoken();

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
      console.log(`  ${k.padEnd(14)} ${v}`);
    }
  }

  const allRecords = reports.flatMap((r) => r.records);
  const valid = allRecords.filter((r) => !r.filterFallback);
  const uniqAll = new Set(valid.map((r) => normalizeForCompare(r.filtered)));
  console.log(`\n[OVERALL]`);
  console.log(`  total calls    ${allRecords.length}`);
  console.log(`  valid          ${valid.length}`);
  console.log(
    `  unique ratio   ${uniqAll.size}/${valid.length} (${Math.round((uniqAll.size / valid.length) * 100)}%)`,
  );
  console.log('\n════════════════ DONE ════════════════');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

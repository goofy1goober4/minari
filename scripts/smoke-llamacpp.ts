// End-to-end smoke for the llama.cpp-backed LLM client.
// Run: node --experimental-strip-types --no-warnings scripts/smoke-llamacpp.ts
//
// Requires llama-server already running (scripts/llamacpp-serve.sh).

import { readFile } from 'node:fs/promises';
import { callOllama } from '../src/main/llm/ollama.ts';

const MODEL = 'gemma4:e2b';
const SYS = `You are minari, a tiny sprout. Reply with one quiet lowercase fragment (1-3 words). No greetings. No advice. No full sentences.`;
const IMG_SYS = `You are minari. Look at the image and describe it in 3-5 lowercase words, like a toddler noticing it. No full sentences.`;

const RUNS = 10;
const IMG_PATH = '/System/Library/CoreServices/Dock.app/Contents/Resources/trashempty2.png';

async function main() {
  console.log(`model=${MODEL}  host=http://localhost:8080`);

  // Warmup.
  const t0 = Date.now();
  const warm = await callOllama({
    model: MODEL,
    systemPrompt: 'reply with one word.',
    history: [],
    userMessage: '.',
    numPredict: 4,
  });
  console.log(`[warmup] ${Date.now() - t0}ms  ${JSON.stringify(warm)}`);

  // Chat loop.
  console.log(`\n=== chat x${RUNS} ===`);
  let empties = 0;
  for (let i = 0; i < RUNS; i++) {
    const t = Date.now();
    const raw = await callOllama({
      model: MODEL,
      systemPrompt: SYS,
      history: [],
      userMessage: '.',
      temperature: 0.95,
      numPredict: 24,
    });
    const ms = Date.now() - t;
    if (!raw.trim()) empties++;
    console.log(`  [${String(i + 1).padStart(2)}] ${String(ms).padStart(5)}ms  ${JSON.stringify(raw)}`);
  }
  console.log(`empty: ${empties}/${RUNS}`);

  // Image.
  console.log(`\n=== image (${IMG_PATH.split('/').pop()}) ===`);
  const buf = await readFile(IMG_PATH);
  const t = Date.now();
  const raw = await callOllama({
    model: MODEL,
    systemPrompt: IMG_SYS,
    history: [],
    userMessage: '(a picture)',
    images: [buf.toString('base64')],
    temperature: 0.85,
    numPredict: 32,
  });
  console.log(`  ${Date.now() - t}ms  ${JSON.stringify(raw)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

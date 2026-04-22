import { callOllama } from '../src/main/llm/ollama.ts';
import { SYSTEM_PROMPT, CLICK_TRIGGER } from '../src/main/llm/prompts.ts';
import { filterGuardrails } from '../src/main/llm/guardrails.ts';

const MODEL = 'gemma4:e4b';
const RUNS = 10;

async function main() {
  console.log(`model: ${MODEL}  trigger: ${JSON.stringify(CLICK_TRIGGER)}\n`);
  let empties = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    const raw = await callOllama({
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      history: [],
      userMessage: CLICK_TRIGGER,
      temperature: 0.9,
    });
    const filtered = filterGuardrails(raw);
    const ms = Date.now() - t0;
    if (!raw.trim()) empties++;
    console.log(`[${String(i + 1).padStart(2)}] ${String(ms).padStart(4)}ms  raw=${JSON.stringify(raw).padEnd(30)}  -> ${JSON.stringify(filtered)}`);
  }
  console.log(`\nempty responses: ${empties}/${RUNS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

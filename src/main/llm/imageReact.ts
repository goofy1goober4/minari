import { readFile } from 'node:fs/promises';
import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import {
  IMAGE_POOL,
  RECENT_INJECT_N,
  TINY_DEFENSE,
  alreadySaidLine,
  identityLine,
  pickN,
} from './prompts';
import { getRecentSpoken, noteRecentSpoken } from './recentSpoken';

function buildImageSystem(): string {
  const ex = pickN(IMAGE_POOL, 3).join(' ');
  const tail = alreadySaidLine(getRecentSpoken(RECENT_INJECT_N));
  return `${identityLine()}You are Minari, a tiny sprout that just received a picture from your person.
Look at the image and describe it in 3-5 lowercase words, like a toddler noticing it.
No full sentences. No advice. No greetings.

Examples: ${ex}

${TINY_DEFENSE}
One quiet fragment. Nothing more.${tail ? '\n\n' + tail : ''}`;
}

export async function reactToImage(imageBase64: string): Promise<string> {
  const raw = await callOllama({
    model: MODEL,
    systemPrompt: buildImageSystem(),
    history: [],
    userMessage: '(a picture)',
    images: [imageBase64],
    temperature: effectiveTemperature(0.85),
    numPredict: 24,
  });
  const fragment = filterGuardrails(raw);
  noteRecentSpoken(fragment);
  return fragment;
}

export async function readImageAsBase64(path: string): Promise<string> {
  const buf = await readFile(path);
  return buf.toString('base64');
}

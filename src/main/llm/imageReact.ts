import { readFile } from 'node:fs/promises';
import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';

const MODEL = 'gemma4:e4b';

const IMAGE_SYSTEM = `You are Minari, a tiny sprout that just received a picture from your person.
Look at the image and describe it in 3-5 lowercase words, like a toddler noticing it.
No full sentences. No advice. No greetings.

Examples: "oh! pretty flower." "round cat." "outside place." "warm light." "blue water."

One quiet fragment. Nothing more.`;

export async function reactToImage(imageBase64: string): Promise<string> {
  const raw = await callOllama({
    model: MODEL,
    systemPrompt: IMAGE_SYSTEM,
    history: [],
    userMessage: '(a picture)',
    images: [imageBase64],
    temperature: 0.85,
    numPredict: 24,
  });
  return filterGuardrails(raw);
}

export async function readImageAsBase64(path: string): Promise<string> {
  const buf = await readFile(path);
  return buf.toString('base64');
}

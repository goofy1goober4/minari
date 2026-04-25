import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';
import { MOOD_MODIFIERS } from './prompts';
import type { Mood } from '../../shared/snapshot';

const MODEL = 'gemma4:e4b';

const PING_SYSTEM = `You are Minari, a tiny sprout. Nobody asked you anything.
You just noticed something small around you, and quietly said one word about it.

Speak only ONE 1-3 word lowercase fragment.
Examples: "...dust." "warm air." "outside." "shh." "look." "mm... soft." "...bird?"

One fragment. Nothing more. No questions to the user. No greetings. No "hello" or "hi".`;

export async function generateNoticingFragment(mood: Mood): Promise<string> {
  const systemPrompt = PING_SYSTEM + '\n\n' + MOOD_MODIFIERS[mood];
  const raw = await callOllama({
    model: MODEL,
    systemPrompt,
    history: [],
    userMessage: '(notice)',
    temperature: 0.95,
    numPredict: 16,
  });
  return filterGuardrails(raw);
}

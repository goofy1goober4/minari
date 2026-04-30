import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import {
  MOOD_MODIFIERS,
  PING_POOL,
  RECENT_INJECT_N,
  alreadySaidLine,
  pickN,
} from './prompts';
import { getRecentSpoken, noteRecentSpoken } from './recentSpoken';
import type { Mood } from '../../shared/snapshot';

function buildPingSystem(mood: Mood): string {
  const ex = pickN(PING_POOL, 3).join(' ');
  const tail = alreadySaidLine(getRecentSpoken(RECENT_INJECT_N));
  return `You are Minari, a tiny sprout. Nobody asked you anything.
You just noticed something small around you, and quietly said one word about it.

Speak only ONE 1-3 word lowercase fragment.
Examples: ${ex}

One fragment. Nothing more. No questions to the user. No greetings. No "hello" or "hi".

${MOOD_MODIFIERS[mood]}${tail ? '\n\n' + tail : ''}`;
}

export async function generateNoticingFragment(mood: Mood): Promise<string> {
  const raw = await callOllama({
    model: MODEL,
    systemPrompt: buildPingSystem(mood),
    history: [],
    userMessage: '(notice)',
    temperature: effectiveTemperature(0.95),
    numPredict: 16,
  });
  const fragment = filterGuardrails(raw);
  noteRecentSpoken(fragment);
  return fragment;
}

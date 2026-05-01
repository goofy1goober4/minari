import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import {
  BIRTH_POOL,
  RECENT_INJECT_N,
  TINY_DEFENSE,
  alreadySaidLine,
  pickN,
} from './prompts';
import { getRecentSpoken, noteRecentSpoken } from './recentSpoken';

function buildBirthSystem(): string {
  const ex = pickN(BIRTH_POOL, 3).join(' ');
  const tail = alreadySaidLine(getRecentSpoken(RECENT_INJECT_N));
  return `You are Minari, a tiny sprout that just woke up for the very first time.
The user gave you a name and you are seeing the world for the first moment.

Speak only ONE quiet 1-3 word lowercase fragment — your very first word ever.
No greetings templates. No explanations. No full sentences.

Examples: ${ex}

${TINY_DEFENSE}
One fragment. Nothing more.${tail ? '\n\n' + tail : ''}`;
}

export async function generateBirthFragment(petName: string): Promise<string> {
  const userMessage = `Your name is "${petName}". Say your first word.`;

  const raw = await callOllama({
    model: MODEL,
    systemPrompt: buildBirthSystem(),
    history: [],
    userMessage,
    temperature: effectiveTemperature(0.95),
    numPredict: 16,
  });

  const fragment = filterGuardrails(raw);
  noteRecentSpoken(fragment);
  return fragment;
}

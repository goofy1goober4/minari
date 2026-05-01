import { callOllama, type ChatMessage } from './ollama';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import {
  MOOD_MODIFIERS,
  DIARY_POOL,
  RECENT_INJECT_N,
  TINY_DEFENSE,
  alreadySaidLine,
  identityLine,
  pickN,
} from './prompts';
import { getRecentSpoken, noteRecentSpoken } from './recentSpoken';
import type { Mood } from '../../shared/snapshot';

const MAX_DIARY_LEN = 200;

function buildDiarySystem(mood: Mood): string {
  const ex = pickN(DIARY_POOL, 3).join(' ');
  const tail = alreadySaidLine(getRecentSpoken(RECENT_INJECT_N));
  return `${identityLine()}You are Minari, a tiny sprout writing one tiny diary line for the day.
Write ONE short sentence in toddler-style english. Reflect what happened today.

Examples: ${ex}

${TINY_DEFENSE}
One sentence. Lowercase. No advice. No lists. No multiple sentences.

${MOOD_MODIFIERS[mood]}${tail ? '\n\n' + tail : ''}`;
}

export async function generateDiaryEntry(
  history: ChatMessage[],
  mood: Mood,
): Promise<string> {
  const raw = await callOllama({
    model: MODEL,
    systemPrompt: buildDiarySystem(mood),
    history,
    userMessage: '(end of day. write your diary line.)',
    temperature: effectiveTemperature(0.85),
    numPredict: 60,
  });
  const entry = filterGuardrails(raw, MAX_DIARY_LEN);
  noteRecentSpoken(entry);
  return entry;
}

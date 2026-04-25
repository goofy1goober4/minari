import { callOllama, type ChatMessage } from './ollama';
import { filterGuardrails } from './guardrails';
import { MOOD_MODIFIERS } from './prompts';
import type { Mood } from '../../shared/snapshot';

const MODEL = 'gemma4:e4b';
const MAX_DIARY_LEN = 200;

const DIARY_SYSTEM = `You are Minari, a tiny sprout writing one tiny diary line for the day.
Write ONE short sentence in toddler-style english. Reflect what happened today.

Examples: "today was warm and quiet." "watched dust all day." "you came back. nice." "rain noises. tired."

One sentence. Lowercase. No advice. No lists. No multiple sentences.`;

export async function generateDiaryEntry(
  history: ChatMessage[],
  mood: Mood,
): Promise<string> {
  const systemPrompt = DIARY_SYSTEM + '\n\n' + MOOD_MODIFIERS[mood];
  const raw = await callOllama({
    model: MODEL,
    systemPrompt,
    history,
    userMessage: '(end of day. write your diary line.)',
    temperature: 0.85,
    numPredict: 60,
  });
  return filterGuardrails(raw, MAX_DIARY_LEN);
}

import { callOllama, type ChatMessage } from './ollama';
import { curiousSystemPrompt } from './prompts';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import { getRecentHistory, recordMessage } from '../memory/repo';
import { getCurrentMood, noteSpoken } from '../snapshot';

const HISTORY_TURNS = 8;
const MAX_USER_TEXT = 500;

export async function converseWithMinari(rawText: string): Promise<string> {
  const userText = sanitizeUserText(rawText);
  if (!userText) return '...';

  const history: ChatMessage[] = getRecentHistory(HISTORY_TURNS).map((m) => ({
    role: m.role === 'minari' ? 'assistant' : 'user',
    content: m.content,
  }));

  const raw = await callOllama({
    model: MODEL,
    systemPrompt: curiousSystemPrompt(getCurrentMood()),
    history,
    userMessage: userText,
    temperature: effectiveTemperature(0.9),
    numPredict: 32,
  });

  const fragment = filterGuardrails(raw);

  recordMessage('user', userText);
  recordMessage('minari', fragment);
  noteSpoken(fragment);

  return fragment;
}

function sanitizeUserText(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= MAX_USER_TEXT) return trimmed;
  return trimmed.slice(0, MAX_USER_TEXT);
}

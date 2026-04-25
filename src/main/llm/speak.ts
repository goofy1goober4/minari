import { callOllama, type ChatMessage } from './ollama';
import { CLICK_TRIGGER, moodFlavoredSystemPrompt } from './prompts';
import { filterGuardrails } from './guardrails';
import { getRecentHistory, recordMessage } from '../memory/repo';
import { getCurrentMood, noteSpoken } from '../snapshot';

const MODEL = 'gemma4:e4b';
const HISTORY_TURNS = 8;

export async function speakAsMinari(): Promise<string> {
  const history: ChatMessage[] = getRecentHistory(HISTORY_TURNS).map((m) => ({
    role: m.role === 'minari' ? 'assistant' : 'user',
    content: m.content,
  }));

  const raw = await callOllama({
    model: MODEL,
    systemPrompt: moodFlavoredSystemPrompt(getCurrentMood()),
    history,
    userMessage: CLICK_TRIGGER,
  });

  const fragment = filterGuardrails(raw);

  recordMessage('user', CLICK_TRIGGER);
  recordMessage('minari', fragment);
  noteSpoken(fragment);

  return fragment;
}

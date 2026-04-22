import { callOllama, type ChatMessage } from './ollama';
import { SYSTEM_PROMPT, CLICK_TRIGGER } from './prompts';
import { filterGuardrails } from './guardrails';
import { getRecentHistory, recordMessage } from '../memory/repo';

const MODEL = 'gemma4:e4b';
const HISTORY_TURNS = 8;

export async function speakAsMinari(): Promise<string> {
  const history: ChatMessage[] = getRecentHistory(HISTORY_TURNS).map((m) => ({
    role: m.role === 'minari' ? 'assistant' : 'user',
    content: m.content,
  }));

  const raw = await callOllama({
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    history,
    userMessage: CLICK_TRIGGER,
  });

  const fragment = filterGuardrails(raw);

  recordMessage('user', CLICK_TRIGGER);
  recordMessage('minari', fragment);

  return fragment;
}

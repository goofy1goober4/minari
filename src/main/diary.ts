import { generateDiaryEntry } from './llm/diary';
import { recordDiary, getTodaysMessageCount, getTodaysHistory } from './memory/repo';
import { getCurrentMood } from './snapshot';
import type { ChatMessage } from './llm/ollama';

export async function maybeWriteDiary(): Promise<boolean> {
  const count = getTodaysMessageCount();
  if (count === 0) {
    console.log('[diary] no conversations today → skip');
    return false;
  }

  const history = getTodaysHistory();
  const chatHistory: ChatMessage[] = history.map((m) => ({
    role: m.role === 'minari' ? 'assistant' : 'user',
    content: m.content,
  }));

  const mood = getCurrentMood();
  console.log(
    '[diary] generating from ' + count + ' messages today (capped to ' + history.length + '), mood=' + mood,
  );

  const entry = await generateDiaryEntry(chatHistory, mood);
  recordDiary(entry, mood);
  console.log('[diary] saved: ' + JSON.stringify(entry));
  return true;
}

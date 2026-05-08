import { callOllama, type ChatMessage } from './ollama';
import { curiousSystemPrompt } from './prompts';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import { getRecentHistory, recordMessage, recordDiary, getState } from '../memory/repo';
import { getCurrentMood, noteSpoken } from '../snapshot';
import {
  exitConfirmingMode,
  exitTeachingMode,
  getConfirmingWord,
  getTeachingWordId,
  enterConfirmingMode,
} from '../wordLearning/teachingState';
import { getById, markLearned } from '../wordLearning/repo';

const HISTORY_TURNS = 8;
const MAX_USER_TEXT = 500;

const CONFIRM_TOKENS = new Set(['yes', 'yeah', 'yep', 'y', 'right', 'correct', 'ok', 'okay']);

// Templated teaching replies skip the LLM entirely, so they'd return in <1ms
// and read as robotic. A pause lands the response in a thinking-it-over beat
// — Minari is "tasting" the new word, not echoing it back.
const TEACHING_REPLY_DELAY_MS = 2000;

export interface UserInputResult {
  text: string;
  // Tells the renderer to re-open the input box after showing `text` —
  // currently used after teaching's "pizza?" so the user can answer "yes"
  // without having to long-press the sprout.
  expectFollowup?: boolean;
}

export async function handleUserInput(rawText: string): Promise<UserInputResult> {
  const userText = sanitizeUserText(rawText);
  if (!userText) return { text: '...' };

  // Confirming mode wins over teaching: if both somehow exist, "yes" should
  // resolve the pending word rather than overwriting it.
  const confirming = getConfirmingWord();
  if (confirming) {
    const word = getById(confirming.id);
    const isConfirm = CONFIRM_TOKENS.has(userText.trim().toLowerCase());
    if (isConfirm && word) {
      const text = await finalizeLearning(
        userText,
        word.id,
        word.babyDescription,
        confirming.pendingName,
      );
      return { text };
    }
    exitConfirmingMode();
    // fall through to normal conversation
  }

  const teachingId = getTeachingWordId();
  if (teachingId !== null) {
    const word = getById(teachingId);
    if (!word) {
      exitTeachingMode();
    } else {
      const candidate = firstWord(userText);
      if (!candidate) {
        // Empty-ish input — keep teaching mode open per spec.
        return { text: '...' };
      }
      exitTeachingMode();
      enterConfirmingMode(word.id, candidate);
      const response = `${candidate}?`;
      recordMessage('user', userText);
      await delay(TEACHING_REPLY_DELAY_MS);
      recordMessage('minari', response);
      noteSpoken(response);
      return { text: response, expectFollowup: true };
    }
  }

  const text = await converseWithMinari(userText);
  return { text };
}

async function converseWithMinari(userText: string): Promise<string> {
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

async function finalizeLearning(
  userText: string,
  wordId: number,
  babyDescription: string,
  learnedName: string,
): Promise<string> {
  markLearned(wordId, learnedName);
  exitConfirmingMode();

  const response = `${learnedName}-`;
  const nickname = getState('nickname') || 'you';
  const diaryEntry = `${nickname} gave ${babyDescription}. ${babyDescription} has name now: ${learnedName}.`;
  // Mood vocabulary is fixed (calm | curious | sleepy | content | grumpy |
  // quiet); 'content' is the closest fit for the warm-quiet "happy".
  recordDiary(diaryEntry, 'content');

  recordMessage('user', userText);
  await delay(TEACHING_REPLY_DELAY_MS);
  recordMessage('minari', response);
  noteSpoken(response);

  console.log(
    '[learn] confirmed → id=' +
      wordId +
      ' name=' +
      JSON.stringify(learnedName) +
      ' diary=' +
      JSON.stringify(diaryEntry),
  );
  return response;
}

function firstWord(s: string): string {
  return s.trim().toLowerCase().split(/\s+/)[0] ?? '';
}

function sanitizeUserText(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= MAX_USER_TEXT) return trimmed;
  return trimmed.slice(0, MAX_USER_TEXT);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

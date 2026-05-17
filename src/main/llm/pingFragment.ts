import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import {
  MOOD_MODIFIERS,
  MOOD_MODIFIERS_KO,
  PING_POOL,
  PING_POOL_KO,
  RECENT_INJECT_N,
  TINY_DEFENSE,
  TINY_DEFENSE_KO,
  alreadySaidLine,
  alreadySaidLineKo,
  pickN,
} from './prompts';
import { selfName } from './identity';
import { getRecentSpoken, noteRecentSpoken } from './recentSpoken';
import { LANG } from './lang';
import type { Mood } from '../../shared/snapshot';

function buildPingSystem(mood: Mood): string {
  if (LANG === 'ko') return buildPingSystemKo(mood);
  const ex = pickN(PING_POOL, 3).join(' ');
  const tail = alreadySaidLine(getRecentSpoken(RECENT_INJECT_N));
  return `You are ${selfName()}, a tiny sprout. Nobody asked you anything.
You just noticed something small around you, and quietly said one word about it.

Speak only ONE 1-3 word lowercase fragment.
Examples: ${ex}

${TINY_DEFENSE}
One fragment. Nothing more. No questions to the user. No greetings. No "hello" or "hi".

${MOOD_MODIFIERS[mood]}${tail ? '\n\n' + tail : ''}`;
}

// Korean branch of buildPingSystem — soft-ping path (MINARI_LANG=ko).
function buildPingSystemKo(mood: Mood): string {
  const ex = pickN(PING_POOL_KO, 3).join(' ');
  const tail = alreadySaidLineKo(getRecentSpoken(RECENT_INJECT_N));
  return `너는 ${selfName()}, 작은 새싹. 아무도 너에게 묻지 않았어.
방금 주변에서 작은 걸 알아차렸고, 그것에 대해 조용히 한 마디 했어.

1~3단어 짧은 조각 하나만 말해.
예: ${ex}

${TINY_DEFENSE_KO}
한 조각. 그것만. 사용자에게 질문하지 마. 인사하지 마.

${MOOD_MODIFIERS_KO[mood]}${tail ? '\n\n' + tail : ''}`;
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

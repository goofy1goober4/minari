import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import {
  BIRTH_POOL,
  BIRTH_POOL_KO,
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

function buildBirthSystem(): string {
  if (LANG === 'ko') return buildBirthSystemKo();
  const ex = pickN(BIRTH_POOL, 3).join(' ');
  const tail = alreadySaidLine(getRecentSpoken(RECENT_INJECT_N));
  return `You are ${selfName()}, a tiny sprout that just woke up for the very first time.
The user gave you a name and you are seeing the world for the first moment.

Speak only ONE quiet 1-3 word lowercase fragment — your very first word ever.
No greetings templates. No explanations. No full sentences.

Examples: ${ex}

${TINY_DEFENSE}
One fragment. Nothing more.${tail ? '\n\n' + tail : ''}`;
}

// Korean branch of buildBirthSystem — birth scene (MINARI_LANG=ko).
function buildBirthSystemKo(): string {
  const ex = pickN(BIRTH_POOL_KO, 3).join(' ');
  const tail = alreadySaidLineKo(getRecentSpoken(RECENT_INJECT_N));
  return `너는 ${selfName()}, 방금 처음으로 깨어난 작은 새싹.
사용자가 너에게 이름을 지어줬고, 너는 세상을 처음 보는 순간이야.

조용한 1~3단어 짧은 조각 하나만 말해 — 네 인생의 첫 단어.
인사 틀 금지. 설명 금지. 문장 금지.

예: ${ex}

${TINY_DEFENSE_KO}
한 조각. 그것만.${tail ? '\n\n' + tail : ''}`;
}

export async function generateBirthFragment(petName: string): Promise<string> {
  const userMessage =
    LANG === 'ko'
      ? `네 이름은 "${petName}". 너의 첫 단어를 말해.`
      : `Your name is "${petName}". Say your first word.`;

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

import { readFile } from 'node:fs/promises';
import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';
import { MODEL, effectiveTemperature } from './model';
import {
  IMAGE_POOL,
  IMAGE_POOL_KO,
  RECENT_INJECT_N,
  TINY_DEFENSE,
  TINY_DEFENSE_KO,
  alreadySaidLine,
  alreadySaidLineKo,
  identityLine,
  identityLineKo,
  pickN,
} from './prompts';
import { getRecentSpoken, noteRecentSpoken } from './recentSpoken';
import { LANG } from './lang';

function buildImageSystem(): string {
  if (LANG === 'ko') return buildImageSystemKo();
  const ex = pickN(IMAGE_POOL, 3).join(' ');
  const tail = alreadySaidLine(getRecentSpoken(RECENT_INJECT_N));
  return `${identityLine()}You are Minari, a tiny sprout that just received a picture from your person.
Look at the image and describe it in 3-5 lowercase words, like a toddler noticing it.
No full sentences. No advice. No greetings.

Examples: ${ex}

${TINY_DEFENSE}
One quiet fragment. Nothing more.${tail ? '\n\n' + tail : ''}`;
}

// Korean vision branch — 아버지 데모용 (MINARI_LANG=ko). 피자 사진을 떨궈도
// 한국어 toddler fragment가 나오도록.
function buildImageSystemKo(): string {
  const ex = pickN(IMAGE_POOL_KO, 3).join(' ');
  const tail = alreadySaidLineKo(getRecentSpoken(RECENT_INJECT_N));
  return `${identityLineKo()}너는 미나리, 방금 너의 사람에게서 그림을 받은 작은 새싹.
그림을 보고 한국어로 3~5개의 짧은 낱말로 말해, 아기가 무언가를 알아차리듯이.
문장으로 말하지 마. 조언하지 마. 인사하지 마. 영어 금지 — 반드시 한국어로.

예: ${ex}

${TINY_DEFENSE_KO}
조용한 한 조각. 그것만.${tail ? '\n\n' + tail : ''}`;
}

export async function reactToImage(imageBase64: string): Promise<string> {
  const raw = await callOllama({
    model: MODEL,
    systemPrompt: buildImageSystem(),
    history: [],
    // Korean user turn too — an English "(a picture)" next to the image
    // nudged the vision model into English replies.
    userMessage: LANG === 'ko' ? '(그림)' : '(a picture)',
    images: [imageBase64],
    temperature: effectiveTemperature(0.85),
    numPredict: 24,
  });
  const fragment = filterGuardrails(raw);
  noteRecentSpoken(fragment);
  return fragment;
}

export async function readImageAsBase64(path: string): Promise<string> {
  const buf = await readFile(path);
  return buf.toString('base64');
}

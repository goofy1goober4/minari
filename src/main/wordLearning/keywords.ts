import { LANG } from '../llm/lang';

const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'it', 'oh', 'mm', 'hmm', 'and', 'or', 'of']);

export function extractKeywords(desc: string, max: number): string {
  if (LANG === 'ko') {
    // Korean vision fragments are Hangul words split by spaces/periods —
    // the Latin-only filter below would strip every character.
    return desc
      .split(/[^가-힣]+/)
      .filter((w) => w.length > 0)
      .slice(0, max)
      .join(' ');
  }
  return desc
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .slice(0, max)
    .join(' ');
}

const CURIOSITY_TEMPLATES: readonly string[] = [
  'that thing... {keywords}... what name?',
  'mm... {keywords}... what called?',
  '{keywords}... what?',
  'remember... {keywords}. what is?',
];

// Korean re-ask templates (아버지 데모) — toddler 미나리 tone, casual.
const CURIOSITY_TEMPLATES_KO: readonly string[] = [
  '그거... {keywords}... 이름 뭐야?',
  '음... {keywords}... 뭐라고 불러?',
  '{keywords}... 그거 뭐야?',
  '아까 그거... {keywords}. 이게 뭐야?',
];

export function pickCuriosityTemplate(): string {
  const pool = LANG === 'ko' ? CURIOSITY_TEMPLATES_KO : CURIOSITY_TEMPLATES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generateCuriosityQuestion(babyDescription: string): string {
  const keywords = extractKeywords(babyDescription, 3);
  const template = pickCuriosityTemplate();
  const fallback = LANG === 'ko' ? '그거...' : 'that...';
  return template.replace('{keywords}', keywords || fallback);
}

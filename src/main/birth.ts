import { getState, setState } from './memory/repo';
import { generateBirthFragment } from './llm/birthFragment';
import { recordMessage } from './memory/repo';
import { saveInitialSnapshot } from './snapshot';
import { setHatchedAt } from './growth';

const KEY_COMPLETED = 'birth_completed';
const KEY_NICKNAME = 'nickname';

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 20;

export interface BirthState {
  completed: boolean;
  nickname: string | null;
}

export interface BirthCompletion {
  nickname: string;
  firstFragment: string;
}

export class BirthStateMachine {
  getState(): BirthState {
    return {
      completed: getState(KEY_COMPLETED) === 'true',
      nickname: getState(KEY_NICKNAME),
    };
  }

  async completeBirth(rawNickname: string): Promise<BirthCompletion> {
    const nickname = sanitizeNickname(rawNickname);
    if (nickname.length < NICKNAME_MIN) {
      throw new Error('nickname is empty');
    }

    setState(KEY_NICKNAME, nickname);

    const firstFragment = await generateBirthFragment(nickname);
    recordMessage('minari', firstFragment);
    saveInitialSnapshot(firstFragment);

    setHatchedAt();
    setState(KEY_COMPLETED, 'true');

    return { nickname, firstFragment };
  }
}

function sanitizeNickname(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= NICKNAME_MAX) return trimmed;
  return trimmed.slice(0, NICKNAME_MAX);
}

import { getState, setState, recordMessage } from './memory/repo';
import { generateBirthFragment } from './llm/birthFragment';
import { saveInitialSnapshot } from './snapshot';
import { setHatchedAt } from './growth';
import { setPetName, setUserNickname } from './llm/identity';

const KEY_COMPLETED = 'birth_completed';
const KEY_NICKNAME = 'nickname';
const KEY_PET_NAME = 'pet_name';

const NAME_MIN = 1;
const NAME_MAX = 20;

export interface BirthState {
  completed: boolean;
  nickname: string | null;
  petName: string | null;
}

export interface BirthCompletion {
  nickname: string;
  petName: string;
  firstFragment: string;
}

export class BirthStateMachine {
  getState(): BirthState {
    return {
      completed: getState(KEY_COMPLETED) === 'true',
      nickname: getState(KEY_NICKNAME),
      petName: getState(KEY_PET_NAME),
    };
  }

  async completeBirth(rawNickname: string, rawPetName: string): Promise<BirthCompletion> {
    const nickname = sanitizeName(rawNickname);
    const petName = sanitizeName(rawPetName);
    if (nickname.length < NAME_MIN) throw new Error('nickname is empty');
    if (petName.length < NAME_MIN) throw new Error('pet name is empty');

    setState(KEY_NICKNAME, nickname);
    setState(KEY_PET_NAME, petName);
    setUserNickname(nickname);
    setPetName(petName);

    const firstFragment = await generateBirthFragment(petName);
    recordMessage('minari', firstFragment);
    saveInitialSnapshot(firstFragment);

    setHatchedAt();
    setState(KEY_COMPLETED, 'true');

    return { nickname, petName, firstFragment };
  }
}

function sanitizeName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= NAME_MAX) return trimmed;
  return trimmed.slice(0, NAME_MAX);
}

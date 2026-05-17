// In-memory cache for the pet's own name + the user's nickname. Pure module
// (no SQLite import) so prompts.ts can read it without pulling Electron/DB
// into test harnesses. The DB stays the source of truth — boot/birth code
// is responsible for keeping this cache in sync via setPetName / setUserNickname.

let petName: string | null = null;
let userNickname: string | null = null;

export function setPetName(name: string | null): void {
  petName = name && name.trim() ? name.trim() : null;
}

export function getPetName(): string | null {
  return petName;
}

// The pet's own name as it should appear inside system prompts: the
// user-given name from D+0 birth, or "..." before birth assigns one — never
// an empty string, which would leave a prompt saying "you are , a sprout".
export function selfName(): string {
  return petName ?? '...';
}

export function setUserNickname(name: string | null): void {
  userNickname = name && name.trim() ? name.trim() : null;
}

export function getUserNickname(): string | null {
  return userNickname;
}

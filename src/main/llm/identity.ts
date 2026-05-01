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

export function setUserNickname(name: string | null): void {
  userNickname = name && name.trim() ? name.trim() : null;
}

export function getUserNickname(): string | null {
  return userNickname;
}

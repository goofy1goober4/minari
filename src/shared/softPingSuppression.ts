export type SuppressReason =
  | 'boot-grace'
  | 'quiet-hours'
  | 'quiet-end-grace'
  | 'daily-cap'
  | 'min-spacing'
  | 'interaction-cooldown';

export interface SuppressionConfig {
  bootGraceMs: number;
  quietEndHour: number;
  quietEndGraceMin: number;
  minSpacingMs: number;
  interactionCooldownMs: number;
  dailyCap: number;
}

export interface SuppressionInputs {
  now: number;
  bootAt: number;
  lastPingAt: number;
  lastInteractionAt: number | null;
  pingsToday: number;
  config: SuppressionConfig;
}

export const PROD_SUPPRESSION_CONFIG: SuppressionConfig = {
  bootGraceMs: 60 * 1000,
  quietEndHour: 7,
  quietEndGraceMin: 10,
  minSpacingMs: 90 * 60 * 1000,
  interactionCooldownMs: 10 * 60 * 1000,
  dailyCap: 2,
};

export const DEV_SUPPRESSION_CONFIG: SuppressionConfig = {
  bootGraceMs: 10 * 1000,
  quietEndHour: 0,
  quietEndGraceMin: 0,
  minSpacingMs: 2 * 60 * 1000,
  interactionCooldownMs: 30 * 1000,
  dailyCap: 10,
};

export function evaluateSuppression(inputs: SuppressionInputs): SuppressReason | null {
  const { now, bootAt, lastPingAt, lastInteractionAt, pingsToday, config } = inputs;
  if (now - bootAt < config.bootGraceMs) return 'boot-grace';
  const d = new Date(now);
  const hour = d.getHours();
  const minute = d.getMinutes();
  if (hour < config.quietEndHour) return 'quiet-hours';
  if (hour === config.quietEndHour && minute < config.quietEndGraceMin) return 'quiet-end-grace';
  if (pingsToday >= config.dailyCap) return 'daily-cap';
  if (now - lastPingAt < config.minSpacingMs) return 'min-spacing';
  if (lastInteractionAt !== null && now - lastInteractionAt < config.interactionCooldownMs) {
    return 'interaction-cooldown';
  }
  return null;
}

// Single source of truth for which Ollama model the LLM helpers use.
// Switch tracks via `MINARI_MODEL=gemma4:e2b` (or any tag Ollama has pulled).
//
// Default stays on e4b (the main hackathon track). e2b is the llama.cpp
// "3GB model" track — it mode-collapses without prompt-side mitigations
// (rolling "already said" + per-call example sampling), so we also bump
// temperature when running on it.

export const MODEL = process.env.MINARI_MODEL ?? 'gemma4:e4b';
export const IS_E2B = MODEL.includes('e2b');

const E2B_TEMPERATURE = 1.1;

export function effectiveTemperature(baseE4B: number): number {
  return IS_E2B ? E2B_TEMPERATURE : baseE4B;
}

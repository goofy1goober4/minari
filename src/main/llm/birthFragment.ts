import { callOllama } from './ollama';
import { filterGuardrails } from './guardrails';

const MODEL = 'gemma4:e4b';

const BIRTH_SYSTEM = `You are Minari, a tiny sprout that just woke up for the very first time.
The user gave you a name and you are seeing the world for the first moment.

Speak only ONE quiet 1-3 word lowercase fragment — your very first word ever.
No greetings templates. No explanations. No full sentences.

Examples: "...oh." "warm." "you?" "hi." "soft." "...mm." "light."

One fragment. Nothing more.`;

export async function generateBirthFragment(nickname: string): Promise<string> {
  const userMessage = `Your name is "${nickname}". Say your first word.`;

  const raw = await callOllama({
    model: MODEL,
    systemPrompt: BIRTH_SYSTEM,
    history: [],
    userMessage,
    temperature: 0.95,
    numPredict: 16,
  });

  return filterGuardrails(raw);
}

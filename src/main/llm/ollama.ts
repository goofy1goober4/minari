export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOllamaOptions {
  model: string;
  systemPrompt: string;
  history: ChatMessage[];
  userMessage: string;
  host?: string;
  temperature?: number;
  numPredict?: number;
}

export async function callOllama(opts: CallOllamaOptions): Promise<string> {
  const host = opts.host ?? 'http://localhost:11434';
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.history,
    { role: 'user', content: opts.userMessage },
  ];

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages,
      stream: false,
      think: false,
      options: {
        temperature: opts.temperature ?? 0.9,
        top_p: 0.9,
        num_predict: opts.numPredict ?? 32,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Ollama returned no message content: ${JSON.stringify(data)}`);
  }
  return content;
}

// LLM client. Despite the filename, this now talks to llama-server (llama.cpp)
// via its OpenAI-compatible /v1/chat/completions endpoint. Default host is
// http://localhost:8080 — start with `llama-server -m <gguf> --mmproj <mmproj>`.
// Symbol names (callOllama, CallOllamaOptions) are kept so callers don't churn.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface CallOllamaOptions {
  model: string;
  systemPrompt: string;
  history: ChatMessage[];
  userMessage: string;
  // Base64 image payloads attached to the user turn (no data: prefix).
  images?: string[];
  host?: string;
  temperature?: number;
  numPredict?: number;
}

type OAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface OAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OAIContentPart[];
}

function toOAI(msg: ChatMessage): OAIMessage {
  if (!msg.images || msg.images.length === 0) {
    return { role: msg.role, content: msg.content };
  }
  const parts: OAIContentPart[] = [{ type: 'text', text: msg.content }];
  for (const b64 of msg.images) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${b64}` },
    });
  }
  return { role: msg.role, content: parts };
}

export async function callOllama(opts: CallOllamaOptions): Promise<string> {
  const host = opts.host ?? 'http://localhost:8080';
  const userMsg: ChatMessage = { role: 'user', content: opts.userMessage };
  if (opts.images && opts.images.length > 0) userMsg.images = opts.images;
  const messages: OAIMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.history.map(toOAI),
    toOAI(userMsg),
  ];

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages,
      stream: false,
      temperature: opts.temperature ?? 0.9,
      top_p: 0.9,
      max_tokens: opts.numPredict ?? 32,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`llama-server HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`llama-server returned no message content: ${JSON.stringify(data)}`);
  }
  return content;
}

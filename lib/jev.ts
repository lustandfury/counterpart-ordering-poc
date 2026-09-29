const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};
export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};
export type Question = NoulQuestion | ChoiceQuestion;

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type Answer = NoulAnswer | ChoiceAnswer;

export type JevResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
};

export type JevRequest = {
  state: string | object;
  questions: Record<string, Question>;
  model?: string;
};

export class JevError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 529]);

export function parseJevResponse(body: unknown): JevResponse {
  const b = body as Partial<JevResponse> | null;
  if (!b || typeof b !== "object" || !b.answers || typeof b.answers !== "object") {
    throw new JevError("Malformed Jev response: missing answers");
  }
  for (const [id, a] of Object.entries(b.answers)) {
    if (a.type === "choice") {
      if (typeof a.choice !== "string" || typeof a.confidence !== "number" || !a.probabilities) {
        throw new JevError(`Malformed choice answer for "${id}"`);
      }
    } else if (a.type === "noul") {
      if (typeof a.noul !== "number") throw new JevError(`Malformed noul answer for "${id}"`);
    } else {
      throw new JevError(`Unsupported answer type for "${id}"`);
    }
  }
  return {
    model: b.model ?? "unknown",
    answers: b.answers,
    usage: b.usage ?? { input_tokens: 0, output_tokens: 0 },
  };
}

type Options = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** POST to Jev; retries 429/529 with exponential backoff. */
export async function callJev(req: JevRequest, opts: Options = {}): Promise<JevResponse> {
  const apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new JevError("TYPESAFE_API_KEY is not set");
  const doFetch = opts.fetchImpl ?? fetch;
  const maxRetries = opts.maxRetries ?? 5;
  const base = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  for (let attempt = 0; ; attempt++) {
    const res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "jev-latest", ...req }),
    });
    if (res.ok) return parseJevResponse(await res.json());
    if (RETRYABLE.has(res.status) && attempt < maxRetries) {
      await sleep(base * 2 ** attempt + Math.random() * base);
      continue;
    }
    throw new JevError(`Jev request failed: ${res.status} ${await res.text()}`, res.status);
  }
}

import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

let client: GoogleGenAI | undefined;

function getClient() {
  if (!client) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY is missing from .env");
    // The SDK default (5 attempts, up to 60s apart) turns a busy model into minutes of waiting;
    // retry once and then move on to the fallback model instead.
    client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 2, initialDelay: 2 } } });
  }
  return client;
}

function models(): string[] {
  const primary = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL;
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

// 429 = quota exhausted, 5xx = model overloaded; both are worth retrying on the fallback model.
const TIMEOUT_MS = 90_000;
const retryable = (err: unknown) =>
  (err instanceof ApiError && (err.status === 429 || err.status >= 500)) ||
  (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"));

/**
 * Ask Gemini for JSON matching `schema`. Returns the parsed value and the model that answered.
 */
export async function generateJson<T>(
  schema: z.ZodType<T>,
  prompt: string,
  systemInstruction?: string,
): Promise<{ data: T; model: string }> {
  const responseJsonSchema = z.toJSONSchema(schema);
  let lastError: unknown;

  for (const model of models()) {
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema,
          temperature: 0.2,
          // Structured extraction does not need long reasoning; high thinking made calls take 30-90 s.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });
      const text = response.text;
      if (!text) throw new Error(`${model} returned an empty response`);
      return { data: schema.parse(JSON.parse(text)), model };
    } catch (err) {
      lastError = err;
      console.warn(`[gemini] ${model} failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
      if (!retryable(err)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

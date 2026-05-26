import OpenAI from "openai";
import { config } from "./config";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey() });
  }
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: config.embeddingModel(),
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number
): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: config.chatModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: maxTokens ?? config.maxAnswerTokens(),
  });
  return response.choices[0]?.message?.content ?? "";
}

export function isOpenAIError(error: unknown): { message: string; status?: number } {
  if (error instanceof OpenAI.APIError) {
    return { message: error.message, status: error.status };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "Unknown OpenAI error" };
}

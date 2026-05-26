function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  openaiApiKey: () => requireEnv("OPENAI_API_KEY"),
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  chatModel: () => optionalEnv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
  embeddingModel: () => optionalEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  maxQueryLength: () => optionalInt("MAX_QUERY_LENGTH", 500),
  maxRetrievedChunks: () => optionalInt("MAX_RETRIEVED_CHUNKS", 30),
  maxAnswerTokens: () => optionalInt("MAX_ANSWER_TOKENS", 1500),
  rateLimitRequests: () => optionalInt("RATE_LIMIT_REQUESTS", 20),
  rateLimitWindowMs: () => optionalInt("RATE_LIMIT_WINDOW_MS", 60000),
  demoMinPeriod: () => optionalEnv("DEMO_MIN_PERIOD", "2024Q1"),
  demoMaxPeriod: () => optionalEnv("DEMO_MAX_PERIOD", "2025Q1"),
  appName: () => optionalEnv("NEXT_PUBLIC_APP_NAME", "Earnings Insight"),
};

export type AiErrorCode = "not_configured" | "auth" | "quota" | "blocked" | "unavailable" | "bad_response";

const USER_MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "AI is not set up yet. Add an API key to the environment file.",
  auth: "The AI provider rejected the API key. Check the key and try again.",
  quota: "The AI provider's usage limit was reached. Try again later or check your plan.",
  blocked: "The AI provider declined to answer this request.",
  unavailable: "The AI provider is not responding right now. Try again in a few minutes.",
  bad_response: "The AI returned an answer that could not be used. Try again.",
};

export class AiError extends Error {
  readonly userMessage: string;

  constructor(
    readonly code: AiErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AiError";
    this.userMessage = USER_MESSAGES[code];
  }
}

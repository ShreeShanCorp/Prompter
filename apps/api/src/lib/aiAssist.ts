import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

export interface AiAssistRequest {
  sectionLabel: string;
  inputText: string;
}

export interface AiAssistResult {
  outputText: string;
  model: string;
  tokensUsed: number | null;
}

export interface AiAssistClient {
  draft(request: AiAssistRequest): Promise<AiAssistResult>;
}

/**
 * Real Claude-backed implementation. Injected as an interface (rather than
 * calling the SDK directly in the route) so tests can supply a fake client
 * instead of needing a live ANTHROPIC_API_KEY or network access -- same
 * pattern as ExportStorage.
 */
export class AnthropicAiAssistClient implements AiAssistClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async draft({ sectionLabel, inputText }: AiAssistRequest): Promise<AiAssistResult> {
    const message = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You draft one section of a structured SaaS build brief (SaaS-Build-Prompt-Template.md). " +
        "Given the section name and the user's rough input, produce a clear, specific draft answer " +
        "for that section only. Respond with only the drafted content -- no preamble, no commentary, " +
        "no markdown code fences.",
      messages: [
        {
          role: "user",
          content: `Section: ${sectionLabel}\n\nUser's rough input:\n${inputText}`,
        },
      ],
    });

    const outputText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      outputText,
      model: message.model,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    };
  }
}

/**
 * Returns null when ANTHROPIC_API_KEY is absent -- callers must treat that
 * as "AI-assist unavailable" (Section 7's documented fallback), not throw.
 */
export function createDefaultAiAssistClient(): AiAssistClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new AnthropicAiAssistClient(apiKey);
}

import { logWrite } from "../shared/log.ts";

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  disableThinking?: boolean;
}

export interface LLMResponse {
  text: string;
  toolCalls?: ToolCallResult[];
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ToolCallResult {
  id: string;
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class LLMAdapter {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  getApiKey(): string {
    return this.config.apiKey;
  }

  async generate(
    messages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string | null;
      tool_call_id?: string;
      tool_calls?: ToolCallResult[];
    }>,
    tools?: ToolDefinition[],
    toolChoice?: string,
    callType?: string,
    thinkingEnabled?: boolean,
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: 0.8,
      max_tokens: 2000,
    };
    if (tools) body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;

    const shouldDisableThinking =
      thinkingEnabled === false || (thinkingEnabled === undefined && this.config.disableThinking);
    if (shouldDisableThinking) body.thinking = { type: "disabled" };

    logWrite(
      "srv",
      "dbg",
      `[LLM] model=${this.config.model} messages=${messages.length}${tools ? ` tools=${tools.length}` : ""}`,
    );

    const startTime = performance.now();

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`LLM API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    };

    const elapsed = Math.round(performance.now() - startTime);
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens;

    logWrite(
      "srv",
      "perf",
      `[LLM] model=${this.config.model} type=${callType ?? "-"} duration=${elapsed}ms ` +
        `msgs=${messages.length}${tools ? ` tools=${tools.length}` : ""} ` +
        `tokens={prompt:${data.usage?.prompt_tokens ?? "?"},completion:${data.usage?.completion_tokens ?? "?"}${reasoningTokens != null ? `,reasoning:${reasoningTokens}` : ""}}`,
    );

    const choice = data.choices[0]?.message;
    return {
      text: choice?.content ?? "",
      toolCalls: choice?.tool_calls,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  async chat(
    systemPrompt: string,
    userPrompt: string,
    tools?: ToolDefinition[],
    toolChoice?: string,
    callType?: string,
    thinkingEnabled?: boolean,
  ): Promise<LLMResponse> {
    return this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      toolChoice,
      callType,
      thinkingEnabled,
    );
  }
}

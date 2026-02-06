// ─────────────────────────────────────────────────────────────
//  AI Provider — streams completions from any OpenAI-compatible
//  API (OpenAI, Azure OpenAI, Ollama, LM Studio, etc.)
//
//  Uses the official openai SDK which handles SSE parsing,
//  retries, and streaming out of the box.
// ─────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { ChatMessage, AiStreamCallbacks, TokenUsage } from "../types";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: config.ai.baseUrl,
      apiKey: config.ai.apiKey,
    });
  }
  return client;
}

/**
 * Build the messages array for the OpenAI chat completion API
 * from our stored ChatMessage objects.
 */
function toOpenAiMessages(
  history: ChatMessage[],
  systemPrompt?: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    msgs.push({ role: "system", content: systemPrompt });
  }

  for (const m of history) {
    msgs.push({ role: m.role, content: m.content });
  }

  return msgs;
}

/**
 * Stream a chat completion. Tokens are emitted one-by-one via
 * the `onToken` callback, allowing the WebSocket layer to push
 * them to the client in real time.
 *
 * An AbortController signal can be passed so the user can
 * cancel mid-stream (the "stop generating" button).
 */
export async function streamCompletion(
  history: ChatMessage[],
  callbacks: AiStreamCallbacks,
  options: {
    systemPrompt?: string;
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  const openai = getClient();

  const messages = toOpenAiMessages(history, options.systemPrompt);

  try {
    const stream = await openai.chat.completions.create(
      {
        model: config.ai.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: options.signal }
    );

    let fullText = "";
    let usage: TokenUsage | undefined;

    for await (const chunk of stream) {
      // Check abort between chunks
      if (options.signal?.aborted) {
        logger.info("Stream aborted by client");
        break;
      }

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        callbacks.onToken(delta);
      }

      // The final chunk may contain usage stats
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    }

    callbacks.onComplete(fullText, usage);
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") {
      logger.info("Stream aborted");
      return;
    }
    logger.error("AI stream error", { error: (err as Error).message });
    callbacks.onError(err as Error);
  }
}

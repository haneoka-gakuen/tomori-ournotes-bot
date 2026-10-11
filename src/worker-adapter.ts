import { AdapterError, createHaneokaProvider, type Fetcher, type Locale, type PublicReply } from "./provider.js";
import { labels } from "./messages.js";

export interface QueryProvider {
  query(command: string, options?: { signal: AbortSignal }): Promise<PublicReply | undefined>;
}

/** The host supplies an authenticated, deduplicated QQ message session. */
export interface ReplySession {
  readonly scene: string;
  readonly canReply: boolean;
  readonly messageId: string | undefined;
  reply(message: { text: string; image?: { url: string } }): Promise<{ ok: boolean }>;
}

export interface BotConfig {
  locale: Locale;
  images: boolean;
}

export interface WorkerCommandOptions {
  locale?: Locale;
  images?: boolean;
  transport?: Fetcher;
  /** Operator-supplied public query service; never selected from incoming text. */
  provider?: QueryProvider;
}

const locales: readonly string[] = ["ja", "en", "zh-TW", "zh-CN", "ko"];

/** One bounded query followed by one passive reply, awaited by the host lifecycle. */
export function createWorkerCommandHandler(options: WorkerCommandOptions = {}) {
  return async function handle(input: {
    session: ReplySession;
    argText: string;
    ctx: { config?: Partial<BotConfig>; logger?: { warn(message: string, data?: unknown): void } };
  }): Promise<void> {
    const { session, ctx } = input;
    if (!session.canReply || !session.messageId || !["group", "c2c"].includes(session.scene)) return;
    const locale = ctx.config?.locale ?? options.locale ?? "ja";
    if (!locales.includes(locale)) throw new AdapterError("invalid_locale");
    const images = ctx.config?.images ?? options.images ?? false;
    let message: { text: string; image?: { url: string } };
    try {
      if (input.argText.length + 4 > 512) throw new AdapterError("command_too_long");
      const signal = AbortSignal.timeout(8000);
      const provider = options.provider ?? { query: createHaneokaProvider({ ...options, locale, signal }) };
      // Bound custom services too; they receive the signal to cancel their I/O.
      let onAbort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new AdapterError("query_timeout"));
        signal.addEventListener("abort", onAbort, { once: true });
      });
      let result: PublicReply | undefined;
      try {
        result = await Promise.race([provider.query(`/on ${input.argText}`, { signal }), aborted]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      if (!result) return;
      // Services are trusted, but this adapter forwards only the reply contract.
      const links = result.links.map((link) => {
        const url = new URL(link.url);
        if (url.protocol !== "https:" || url.username || url.password) throw new AdapterError("invalid_reply_url");
        return url.href;
      });
      const text = [result.text, ...links, "Haneoka · https://haneoka.org/"].join("\n");
      if (text.length > 3500) throw new AdapterError("reply_too_large");
      const image = images ? result.image : undefined;
      if (image) {
        const url = new URL(image.url);
        if (url.protocol !== "https:" || url.username || url.password) throw new AdapterError("invalid_reply_url");
      }
      message = { text, ...(image ? { image: { url: image.url } } : {}) };
    } catch (error) {
      const code = error instanceof AdapterError ? error.code : "query_failed";
      ctx.logger?.warn("haneoka_query_failed", { code });
      message = {
        text:
          code === "invalid_command" || code === "command_too_long"
            ? labels(locale).invalidCommand
            : labels(locale).unavailable,
      };
    }
    if (!session.canReply) return;
    // Explicit reply avoids framework return-value delivery falling back to send().
    const sent = await session.reply(message);
    if (!sent.ok) ctx.logger?.warn("haneoka_reply_failed");
  };
}

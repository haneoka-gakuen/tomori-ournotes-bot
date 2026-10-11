import { AdapterError } from "./provider.js";
import {
  createWorkerCommandHandler,
  type BotConfig,
  type QueryProvider,
  type ReplySession,
  type WorkerCommandOptions,
} from "./worker-adapter.js";

export interface QflarePluginOptions extends WorkerCommandOptions {
  /** Trusted host service declared as a dependency; fixed by the operator. */
  serviceName?: string;
}

/** Pass this structural definition to the host SDK's definePlugin(). */
export function createQflarePlugin(options: QflarePluginOptions = {}) {
  const serviceName = options.serviceName;
  if (serviceName !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(serviceName))
    throw new AdapterError("invalid_service");
  return {
    name: "haneoka",
    apiVersion: 1,
    displayName: "Haneoka",
    description: "Our Notes public song, chart, event and player queries",
    permissions: ["net" as const],
    ...(serviceName ? { depends: { [serviceName]: "*" } } : {}),
    defaultConfig: { locale: options.locale ?? "ja", images: options.images ?? false },
    configSchema: {
      type: "object",
      properties: {
        locale: { type: "string", enum: ["ja", "en", "zh-TW", "zh-CN", "ko"], default: "ja" },
        images: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    commands: {
      on: {
        description: "Our Notes",
        usage: "/on help",
        scenes: ["group" as const, "c2c" as const],
        async handler(input: {
          session: ReplySession;
          argText: string;
          ctx: {
            config?: Partial<BotConfig>;
            logger?: { warn(message: string, data?: unknown): void };
            service?<T>(name: string): T;
          };
        }): Promise<void> {
          const provider = serviceName
            ? {
                query: (...args: Parameters<QueryProvider["query"]>) => {
                  if (!input.ctx.service) throw new AdapterError("service_unavailable");
                  return input.ctx.service<QueryProvider>(serviceName).query(...args);
                },
              }
            : options.provider;
          await createWorkerCommandHandler({ ...options, ...(provider ? { provider } : {}) })(input);
        },
      },
    },
  };
}

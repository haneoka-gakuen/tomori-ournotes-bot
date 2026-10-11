# Tomori Our Notes bot

Public Our Notes queries for a serverless QQ bot. The package contains a data provider, a passive message handler and a QFlare plugin definition. It imports no Haneoka webpage or renderer.

## Build and use

From this package directory, run `npm install` and `npm run build`. For a local consumer, run `npm pack` and install the resulting tarball. No runtime dependencies are required. Node.js 22 or later supports the Fetch and abort APIs used by the provider.

In a QFlare plugin wrapper with the host's `@qqbot/sdk` available:

```ts
import { definePlugin } from "@qqbot/sdk";
import { createQflarePlugin } from "@haneoka/tomori-ournotes-bot/qflare";
export default definePlugin(createQflarePlugin({ locale: "en" }));
```

The definition matches QFlare SDK at `c64bda3fedcad3a2b707597d6561ea41c381de4c`. The wrapper belongs to a QFlare plugin project built by its plugin tooling; this monorepo package is not a standalone webhook server or a registered plugin market entry. QFlare supplies QQ signature verification, handshake, token refresh, event deduplication and passive reply sequencing. Its runtime is GPL; its SDK and plugin template are MIT. See the [project](https://github.com/QFlareBot/QFlareBot) and [plugin guide](https://qflarebot.github.io/plugin-guide).

## Commands

| Command | Parameters and result |
| --- | --- |
| `/on help` | Shows the command grammar. No arguments. |
| `/on song intl 100001` | `song <server> <ID>`. Title, band and official difficulty levels, preserving decimals. |
| `/on meta intl 100001 expert` | `meta <server> <ID> <difficulty>`. Chart level, notes, seconds and first BPM. |
| `/on chart intl 100001 expert` | `chart <server> <ID> <difficulty>`. Current-only PNG URL, height 720; image existence is checked by the consuming platform. |
| `/on event intl 1` | `event <server> <ID>`. Event title and available start/end timestamps in explicit UTC ISO form. This selects an event by ID, not automatically the current event. |
| `/on player jp 59336778464` | `player <region> <publicID>`. Public nickname, level, favorite card and profile page. |

Catalog servers: `jp`, `intl`, `jp-cbt`, `intl-cbt`. Player regions: `jp`, `tw`, `en`, `kr`; JP IDs are positive signed-int64 decimal strings. Intl IDs have 11 digits beginning with 2, 3 or 4 for TW, EN or KR. Catalog IDs are positive safe integers of at most 15 digits. Difficulties: `easy`, `normal`, `hard`, `expert`. Commands are case-sensitive, use whitespace separation and accept at most 512 characters. Extra or invalid arguments are rejected. User text cannot select a URL, arbitrary API path or service.

## Options and contracts

`createHaneokaProvider(options)` returns `(command: string) => Promise<PublicReply | undefined>` and performs reads against `https://haneoka.org`. Non-`/on` input returns undefined. Validation and protocol errors have `AdapterError.code`; transport and cancellation errors may propagate from the supplied transport. The message handler turns query failures into a short localized reply.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `locale` | `ja | en | zh-TW | zh-CN | ko` | `ja` | Catalog text and reply language; empty translated catalog slots use Japanese. |
| `transport` | `{ fetch(request: Request): Promise<Response> }` | global fetch | Trusted operator transport, including a read-only Worker HTTP service binding. Honor the request abort signal; preserve response headers. |
| `signal` | `AbortSignal` | absent | Caller cancellation, combined with the provider's 8-second timeout. |

Catalog reads resolve the live release using HEAD, then read only the selected entity and optional song-meta on that same release/source. Each JSON body is capped at 512 KiB. Requests send GET/HEAD only, with no cookie or Authorization header and redirect rejection. Player reads use the public records endpoint and return an explicit field whitelist. Song images use controlled `/assets/` paths. Chart image URLs use current data and are not presented as images of an older JSON snapshot.

`PublicReply` has `text: string`, `links: {title: string; url: string}[]`, optional `image: {url: string}`, optional `facts: Record<string, unknown>`, and `provenance: {provider: string; releaseId?: string; sourceId?: string; imageUsesCurrent?: boolean}`. Facts contain only projected public fields. The bot forwards text, links and an explicitly enabled image; it does not stringify facts or upstream payloads into messages.

`createWorkerCommandHandler(options)` accepts the provider's `locale` and `transport`, plus `images?: boolean` (default false) and `provider?: QueryProvider` (default Haneoka). It returns an async handler accepting `{session, argText, ctx}`. `argText` is the text after `/on`. `ctx.config` may override locale/images; optional `ctx.logger.warn` receives error codes only. The session supplies `scene`, `canReply`, `messageId` and `reply(message): Promise<{ok: boolean}>`. The host must authenticate and deduplicate the message before invoking the handler. Only group/C2C message sessions with passive reply permission are queried. Exactly one awaited `reply()` is attempted; no active-send fallback is used. URLs must use HTTPS without embedded credentials, reply text is capped at 3500 characters, and each query has an 8-second wait budget. QQ sending and media-upload timeouts belong to the host.

`QueryProvider` implements `query(command: string, options?: {signal: AbortSignal}): Promise<PublicReply | undefined>`. A selected public service may implement its own read contract. It must honor cancellation, use public data and return the reply contract. Its I/O and permissions remain the operator's responsibility.

`createQflarePlugin(options)` accepts handler options and `serviceName?: string`. Service names match `[a-z0-9][a-z0-9_-]{0,63}`, are fixed by the operator and are declared in QFlare `depends`. If selected, `ctx.service<QueryProvider>(serviceName)` supplies the provider for that request. A missing/disabled selected service returns an error reply; it is not silently replaced by another source. `provider` and `serviceName` together select the named service. The generated configuration exposes locale and images; the selected service and transport stay outside chat-controlled configuration.

```ts
// Worker-to-Worker HTTP reads, using a binding already configured by the operator.
const handler = createWorkerCommandHandler({
  locale: "en",
  transport: { fetch: (request) => env.PUBLIC_DATA.fetch(request) },
});
await handler({ session, argText, ctx });

// Optional operator choice: a QFlare public service plugin instead of HTTP.
export default definePlugin(createQflarePlugin({ serviceName: "public_query" }));
```

Images default off so the first connection can use plain passive text and URLs. Setting `images: true` lets QFlare upload the URL as QQ media; platform media access, permissions and message quotas must then be verified in the sandbox. Runtime logs should omit command bodies, player payloads and credentials.

## QQ activation

The operator supplies a QQ developer application with AppID and AppSecret through the host's secret management, a permitted test group/C2C user, selected message subscriptions and an HTTPS webhook domain reachable from QQ. The [official webhook](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html) and [signature](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html) contracts govern the connection. Verify the handshake, signed event, duplicate delivery, one passive reply and an image upload if enabled before expanding access. Formal bot publication follows the developer platform's application review. No game account is needed for these public queries.

See [Haneoka](https://haneoka.org/) and [API documentation](https://docs.haneoka.org/).

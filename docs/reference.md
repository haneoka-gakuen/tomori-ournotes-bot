# Reference

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

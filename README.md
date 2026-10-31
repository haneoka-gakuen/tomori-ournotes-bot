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

The definition matches QFlare SDK at `c64bda3fedcad3a2b707597d6561ea41c381de4c`. QFlare supplies QQ signature verification, handshake, token refresh, event deduplication and passive reply sequencing. Its runtime is GPL; its SDK and plugin template are MIT. See the [project](https://github.com/QFlareBot/QFlareBot) and [plugin guide](https://qflarebot.github.io/plugin-guide).

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

## Reference

Options, reply contracts and QQ setup are in [docs/reference.md](docs/reference.md).

## License

[MPL-2.0](LICENSE).

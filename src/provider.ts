import { labels } from "./messages.js";
/** Public data provider shared by Workers and QQ plugin hosts. */
export type CatalogServer = "jp" | "intl" | "jp-cbt" | "intl-cbt";
export type GameRegion = "jp" | "tw" | "en" | "kr";
export type Locale = "ja" | "en" | "zh-TW" | "zh-CN" | "ko";
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
export interface PublicReply {
  text: string;
  links: Array<{ title: string; url: string }>;
  image?: { url: string };
  facts?: Record<string, unknown>;
  provenance: {
    provider: string;
    releaseId?: string;
    sourceId?: string;
    imageUsesCurrent?: boolean;
  };
}
export class AdapterError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const ORIGIN = "https://haneoka.org";
const SERVERS = ["jp", "intl", "jp-cbt", "intl-cbt"];
const REGIONS = ["jp", "tw", "en", "kr"];
const DIFFICULTIES = ["easy", "normal", "hard", "expert"];
const LOCALES = ["ja", "en", "zh-TW", "zh-CN", "ko"];
const MAX_BYTES = 512 * 1024;
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const number = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const safeText = (v: unknown): string => (typeof v === "string" ? v.replace(/[\x00-\x1f<>]/gu, " ").slice(0, 300) : "");
const positiveId = (v: string, max = 15) => new RegExp(`^[1-9][0-9]{0,${max - 1}}$`, "u").test(v);
const localized = (v: unknown, locale: Locale): string => {
  const a = Array.isArray(v) ? v : null;
  return safeText(a ? a[LOCALES.indexOf(locale)] || a[0] : v);
};
const ownAsset = (v: unknown): string | undefined => {
  if (
    typeof v !== "string" ||
    !v.startsWith("/assets/") ||
    v.includes("..") ||
    v.includes("\\") ||
    v.includes("?") ||
    v.includes("#")
  )
    return;
  const url = new URL(v, ORIGIN);
  if (url.origin !== ORIGIN || !url.pathname.startsWith("/assets/")) return;
  return url.href;
};
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    await response.body?.cancel();
    throw new AdapterError("invalid_content_type");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AdapterError("empty_response");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      if (!r.value) continue;
      size += r.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new AdapterError("body_too_large");
      }
      parts.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    data.set(p, offset);
    offset += p.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new AdapterError("invalid_json");
  }
}
const localizedNumber = (v: unknown, locale: Locale): number | null => {
  const value = Array.isArray(v) ? (v[LOCALES.indexOf(locale)] ?? v[0]) : v;
  const result = number(value);
  return result !== null && Math.abs(result) <= 8640000000000000 ? result : null;
};
interface Pin {
  releaseId: string;
  sourceId: string;
}
export function createHaneokaProvider(options: { transport?: Fetcher; locale?: Locale; signal?: AbortSignal } = {}) {
  const locale = options.locale ?? "ja";
  if (!LOCALES.includes(locale)) throw new AdapterError("invalid_locale");
  const transport: Fetcher = options.transport || {
    fetch: (request) => fetch(request),
  };
  async function request(path: string, signal: AbortSignal, method = "GET") {
    // Browser privacy fields are ignored by Workers, whose requests have no cookie jar.
    const init = {
      method,
      signal,
      redirect: "manual" as const,
      credentials: "omit" as const,
      referrerPolicy: "no-referrer" as const,
      headers: { Accept: "application/json" },
    };
    const r = await transport.fetch(new Request(ORIGIN + path, init));
    if (!r.ok) {
      await r.body?.cancel();
      throw new AdapterError(
        r.status === 404 ? "not_found" : r.status === 429 ? "rate_limited" : "provider_unavailable",
      );
    }
    return r;
  }
  async function pin(server: CatalogServer, signal: AbortSignal): Promise<Pin> {
    const r = await request(`/api/v1/servers/${server}/release?projection=identity`, signal, "HEAD");
    const releaseId = r.headers.get("x-haneoka-release-id") || "",
      sourceId = r.headers.get("x-haneoka-source-id") || "";
    await r.body?.cancel();
    if (!/^r-[a-f0-9]{20}$/u.test(releaseId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(sourceId))
      throw new AdapterError("invalid_release_identity");
    return { releaseId, sourceId };
  }
  async function entity(server: CatalogServer, path: string, p: Pin, signal: AbortSignal) {
    const r = await request(`/api/v1/servers/${server}/${path}?release=${p.releaseId}`, signal);
    if (r.headers.get("x-haneoka-release-id") !== p.releaseId || r.headers.get("x-haneoka-source-id") !== p.sourceId) {
      await r.body?.cancel();
      throw new AdapterError("release_mismatch");
    }
    return boundedJson(r);
  }
  return async function handleCommand(content: string): Promise<PublicReply | undefined> {
    if (content.length > 512) throw new AdapterError("command_too_long");
    const args = content.trim().split(/\s+/u);
    if (args.shift() !== "/on") return;
    const command = args.shift() || "help";
    if (command === "help" && !args.length)
      return {
        text: "/on song <jp|intl> <ID>\n/on meta <jp|intl> <ID> <easy|normal|hard|expert>\n/on chart <jp|intl> <ID> <difficulty>\n/on event <jp|intl> <ID>\n/on player <jp|tw|en|kr> <ID>",
        links: [],
        provenance: { provider: "haneoka" },
      };
    const server = args.shift() || "",
      identity = args.shift() || "";
    const timeout = AbortSignal.timeout(8000);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    if (command === "player") {
      if (
        !REGIONS.includes(server) ||
        !positiveId(identity, 19) ||
        BigInt(identity) > 9223372036854775807n ||
        (server !== "jp" &&
          !new RegExp(`^${server === "tw" ? "2" : server === "en" ? "3" : "4"}[0-9]{10}$`, "u").test(identity)) ||
        args.length
      )
        throw new AdapterError("invalid_command");
      const body = await boundedJson(await request(`/api/v1/game/records/${server}/players/${identity}`, signal));
      if (body.region !== server || body.profileId !== identity) throw new AdapterError("profile_mismatch");
      const p = obj(body.profile),
        card = obj(p.favoriteMemberCard);
      const fields = [
        safeText(p.name) || identity,
        number(p.level) !== null ? `${labels(locale).level} ${p.level}` : "",
        number(card.cardId) !== null ? `${labels(locale).favorite} ${card.cardId}` : "",
      ].filter(Boolean);
      return {
        text: fields.join(" · "),
        links: [
          {
            title: labels(locale).player,
            url: `${ORIGIN}/${locale}/player-profile/?region=${server}&profileId=${identity}`,
          },
        ],
        facts: {
          region: server,
          profileId: identity,
          name: safeText(p.name),
          level: number(p.level),
          favoriteMemberCardId: number(card.cardId),
          lastUpdatedAtMs: number(p.lastUpdatedAtMs),
        },
        provenance: { provider: "haneoka" },
      };
    }
    if (!SERVERS.includes(server) || !positiveId(identity) || !Number.isSafeInteger(Number(identity)))
      throw new AdapterError("invalid_command");
    const scoped = server as CatalogServer;
    if (command === "event") {
      if (args.length) throw new AdapterError("invalid_command");
      const p = await pin(scoped, signal);
      const event = await entity(scoped, `events/${identity}`, p, signal);
      if (String(event.id) !== identity) throw new AdapterError("event_mismatch");
      const title = localized(event.title, locale);
      const startAt = localizedNumber(event.startAt, locale);
      const endAt = localizedNumber(event.endAt, locale);
      const formatTime = (value: number | null) => (value === null ? "—" : new Date(value).toISOString());
      return {
        text: [title || `${labels(locale).event} ${identity}`, `${formatTime(startAt)} → ${formatTime(endAt)}`].join(
          "\n",
        ),
        links: [{ title: labels(locale).event, url: `${ORIGIN}/${scoped}/${locale}/events/${identity}/` }],
        facts: { eventId: Number(identity), title, startAtMs: startAt, endAtMs: endAt },
        provenance: { provider: "haneoka", ...p },
      };
    }
    const difficulty = args.shift();
    if (command === "chart") {
      if (!difficulty || !DIFFICULTIES.includes(difficulty) || args.length) throw new AdapterError("invalid_command");
      // Existing chart PNG route explicitly uses current, not a release query.
      const url = `${ORIGIN}/api/v1/servers/${scoped}/songs/${identity}/charts/${difficulty}/image.png?locale=${locale}&height=720&download=0`;
      return {
        text: `${labels(locale).chart} ${identity} ${difficulty.toUpperCase()}`,
        image: { url },
        links: [{ title: labels(locale).chart, url }],
        provenance: { provider: "haneoka", imageUsesCurrent: true },
      };
    }
    if (
      !["song", "meta"].includes(command) ||
      args.length ||
      (command === "song" && difficulty) ||
      (command === "meta" && (!difficulty || !DIFFICULTIES.includes(difficulty)))
    )
      throw new AdapterError("invalid_command");
    const p = await pin(scoped, signal),
      song = await entity(scoped, `songs/${identity}`, p, signal);
    if (Number(song.musicId) !== Number(identity)) throw new AdapterError("song_mismatch");
    const title = localized(song.musicTitle, locale),
      band = localized(song.bandName, locale);
    const links: PublicReply["links"] = [
      {
        title: labels(locale).song,
        url: `${ORIGIN}/${scoped}/${locale}/songs/${identity}/`,
      },
    ];
    if (command === "song") {
      const rows = Array.isArray(song.difficulty) ? song.difficulty.map(obj) : [];
      const levels = rows
        .map((r) => `${safeText(r.difficultyName).toUpperCase()} ${number(r.displayLevel) ?? "—"}`)
        .join(" / ");
      const image = ownAsset(song.jacketThumbUrl);
      return {
        text: [title, band, levels].filter(Boolean).join("\n"),
        links,
        ...(image ? { image: { url: image } } : {}),
        facts: {
          musicId: Number(identity),
          title,
          band,
          levels: rows.map((r) => ({
            difficulty: safeText(r.difficultyName),
            displayLevel: number(r.displayLevel),
          })),
        },
        provenance: { provider: "haneoka", ...p },
      };
    }
    const meta = await entity(scoped, `song-meta/${identity}`, p, signal),
      row = obj(meta[String(DIFFICULTIES.indexOf(difficulty!))]),
      chart = obj(row.chart);
    if (!Object.keys(chart).length) throw new AdapterError("meta_unavailable");
    const facts = {
      musicId: Number(identity),
      difficulty,
      displayLevel: number(chart.displayLevel),
      notes: number(chart.n),
      seconds: number(chart.time),
      bpm: number(chart.firstBpm),
      constant: number(obj(chart.difficultyEstimate).estimatedConstant),
    };
    links.push({
      title: "Meta",
      url: `${ORIGIN}/${scoped}/${locale}/song-meta/`,
    });
    return {
      text: [
        `${title} ${difficulty!.toUpperCase()}`,
        `Lv ${facts.displayLevel ?? "—"} · ${facts.notes ?? "—"} notes · ${facts.seconds ?? "—"}s · BPM ${facts.bpm ?? "—"}`,
      ].join("\n"),
      links,
      facts,
      provenance: { provider: "haneoka", ...p },
    };
  };
}

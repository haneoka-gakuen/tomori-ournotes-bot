import { definePlugin } from "@qqbot/sdk";
import { createQflarePlugin } from "@haneoka/tomori-ournotes-bot/qflare";

export default definePlugin(createQflarePlugin({ locale: "en" }));

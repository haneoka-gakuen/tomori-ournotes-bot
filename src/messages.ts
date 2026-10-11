import type { Locale } from "./provider.js";

const rows = {
  ja: [
    "レベル",
    "お気に入りカード",
    "プレイヤー",
    "譜面",
    "楽曲",
    "イベント",
    "コマンドを確認してください。/on help",
    "データを取得できませんでした。しばらくしてから再試行してください。",
  ],
  en: [
    "Level",
    "Favorite card",
    "Player",
    "Chart",
    "Song",
    "Event",
    "Check the command. /on help",
    "Data is unavailable. Please try again later.",
  ],
  "zh-TW": [
    "等級",
    "最愛卡牌",
    "玩家",
    "譜面",
    "歌曲",
    "活動",
    "請確認指令。/on help",
    "資料暫時無法取得，請稍後重試。",
  ],
  "zh-CN": ["等级", "收藏卡", "玩家", "谱面", "歌曲", "活动", "请确认指令。/on help", "暂时无法获取数据，请稍后重试。"],
  ko: [
    "레벨",
    "즐겨찾는 카드",
    "플레이어",
    "채보",
    "곡",
    "이벤트",
    "명령어를 확인하세요. /on help",
    "데이터를 가져올 수 없습니다. 잠시 후 다시 시도하세요.",
  ],
} as const;

export function labels(locale: Locale) {
  const [level, favorite, player, chart, song, event, invalidCommand, unavailable] = rows[locale];
  return { level, favorite, player, chart, song, event, invalidCommand, unavailable };
}

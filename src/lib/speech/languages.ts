export const LANGUAGES = [
  ['ja-JP', '日本語'], ['en-US', '英語（アメリカ）'], ['en-GB', '英語（イギリス）'],
  ['zh-CN', '中国語（簡体字）'], ['zh-TW', '中国語（繁体字）'], ['ko-KR', '韓国語'],
  ['fr-FR', 'フランス語'], ['de-DE', 'ドイツ語'], ['es-ES', 'スペイン語'],
  ['it-IT', 'イタリア語'], ['pt-BR', 'ポルトガル語（ブラジル）'], ['ru-RU', 'ロシア語'],
  ['vi-VN', 'ベトナム語'], ['th-TH', 'タイ語'], ['ar-SA', 'アラビア語'], ['hi-IN', 'ヒンディー語'],
] as const;

export function languageFields(value: { frontLanguage?: unknown; backLanguage?: unknown }) {
  const result: { frontLanguage?: string; backLanguage?: string } = {};
  for (const field of ['frontLanguage', 'backLanguage'] as const) {
    const language = value[field];
    if (language === undefined) continue;
    if (typeof language !== 'string' || language.length > 50) throw new Error('読み上げ言語は en-US や ja-JP の形式で指定してください。');
    try { result[field] = language.trim() ? Intl.getCanonicalLocales(language.trim())[0] : ''; }
    catch { throw new Error('読み上げ言語は en-US や ja-JP の形式で指定してください。'); }
  }
  return result;
}

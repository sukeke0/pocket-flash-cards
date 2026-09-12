import type { TextCardInput } from '../models';
import Papa from 'papaparse';
import { languageFields } from '../speech/languages';

export const MAX_IMPORT_CARDS = 1000;
export const MAX_IMPORT_CHARS = 1_000_000;
export type DelimiterOption = 'auto' | 'csv' | 'tsv';
export type HeaderOption = 'auto' | 'present' | 'none';
export interface ImportRow extends TextCardInput { line: number }
export interface ImportIssue { line: number; message: string }
export interface ImportPreview { format: 'csv' | 'tsv'; hasHeader: boolean; rows: ImportRow[]; issues: ImportIssue[] }
type Field = 'frontText' | 'backText' | 'tags' | 'notes' | 'frontLanguage' | 'backLanguage';
const aliases: Record<string, Field> = {
  frontlanguage: 'frontLanguage', backlanguage: 'backLanguage',
  '表面言語': 'frontLanguage', '表面の言語': 'frontLanguage', '表面の読み上げ言語': 'frontLanguage',
  '裏面言語': 'backLanguage', '裏面の言語': 'backLanguage', '裏面の読み上げ言語': 'backLanguage',
  front: 'frontText', fronttext: 'frontText', '表面': 'frontText', '問題': 'frontText',
  back: 'backText', backtext: 'backText', '裏面': 'backText', '答え': 'backText',
  tags: 'tags', tag: 'tags', 'タグ': 'tags', notes: 'notes', note: 'notes', 'メモ': 'notes',
};
export function parseTagNames(value: string): string[] {
  return [...new Set(value.split(/[,，、;；|]/).map(tag => tag.trim().normalize('NFC')).filter(Boolean))];
}
export function textCardKey(card: Pick<TextCardInput, 'frontText' | 'backText'>): string {
  return JSON.stringify([card.frontText.trim().normalize('NFC'), card.backText.trim().normalize('NFC')]);
}
export function countImportDuplicates(rows: TextCardInput[], existing: Pick<TextCardInput, 'frontText' | 'backText'>[]): number {
  const keys = new Set(existing.map(textCardKey));
  let duplicates = 0;
  for (const row of rows) {
    const key = textCardKey(row);
    if (keys.has(key)) duplicates++; else keys.add(key);
  }
  return duplicates;
}

/** Papa Parse handles CSV syntax; this adapter keeps physical line numbers for the UI. */
export function readRecords(text: string, delimiter: string): { records: { cells: string[]; line: number }[]; issues: ImportIssue[] } {
  const records: { cells: string[]; line: number }[] = [];
  const issues: ImportIssue[] = [];
  let cursor = 0;
  let line = 1;
  Papa.parse<string[]>(text, {
    delimiter, newline: '\n', header: false, dynamicTyping: false,
    // Do not skip here: empty physical lines still count toward error locations.
    skipEmptyLines: false,
    step(result, parser) {
      const cells = result.data.map(cell => cell.trim());
      for (const error of result.errors) issues.push({ line, message: error.code === 'MissingQuotes'
        ? '引用符が閉じていません。文章全体をコピーできているか確認してください。'
        : '引用符の位置が正しくありません。セル内の " は "" と書いてください。' });
      if (cells.some(Boolean)) records.push({ cells, line });
      line += (text.slice(cursor, result.meta.cursor).match(/\n/g) ?? []).length;
      cursor = result.meta.cursor;
      if (issues.length || records.length > MAX_IMPORT_CARDS + 1) parser.abort();
    },
  });
  return { records, issues };
}

export function parseDelimited(source: string, format: DelimiterOption = 'auto', header: HeaderOption = 'auto', commonTags = ''): ImportPreview {
  const empty = (message: string): ImportPreview => ({ format: format === 'tsv' ? 'tsv' : 'csv', hasHeader: false, rows: [], issues: [{ line: 1, message }] });
  if (source.length > MAX_IMPORT_CHARS) return empty('入力が大きすぎます。100万文字以内に分けてください。');
  let text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  // Accept one whole fenced block, never silently discard prose around it.
  const fenced = text.trim().match(/^```(?:csv|tsv|text)?\s*\n([\s\S]*?)\n```$/i);
  if (fenced) text = fenced[1];
  if (!text.trim()) return empty('CSVまたはTSVを貼り付けてください。');
  const tsv = readRecords(text, '\t');
  const detected = format === 'auto' ? ((tsv.records[0]?.cells.length ?? 0) >= 2 ? 'tsv' : 'csv') : format;
  const result = detected === 'tsv' ? tsv : readRecords(text, ',');
  const preview: ImportPreview = { format: detected, hasHeader: false, rows: [], issues: result.issues };
  if (result.issues.length || !result.records.length) return preview;
  const fields = result.records[0].cells.map(cell => { const key = cell.toLowerCase().trim(); return Object.hasOwn(aliases, key) ? aliases[key] : undefined; });
  const hasHeader = header === 'present' || (header === 'auto' && fields.includes('frontText') && fields.includes('backText'));
  preview.hasHeader = hasHeader;
  if (hasHeader && (!fields.includes('frontText') || !fields.includes('backText') || fields.some(field => !field) || new Set(fields).size !== fields.length)) {
    preview.issues.push({ line: result.records[0].line, message: 'ヘッダーは front, back, tags, notes, frontLanguage, backLanguageに対応しています。frontとbackは必須で、列名の重複はできません。' });
    return preview;
  }
  const records = hasHeader ? result.records.slice(1) : result.records;
  if (records.length > MAX_IMPORT_CARDS) return { ...preview, issues: [{ line: 1, message: '一度に追加できるのは1,000枚までです。入力を分けてください。' }] };
  if (!records.length) return { ...preview, issues: [{ line: 1, message: '追加するカードがありません。ヘッダーの下にカードを入力してください。' }] };
  const expected = hasHeader ? fields.length : records[0].cells.length;
  for (const record of records) {
    const cells = record.cells;
    if (cells.length < 2 || cells.length > (hasHeader ? 6 : 4) || cells.length !== expected) {
      preview.issues.push({ line: record.line, message: '列数が一致しません。通常は2〜4列、言語列を使う場合はヘッダー付きで最大6列にしてください。CSVでカンマを含むセルは " " で囲みます。' });
      continue;
    }
    const get = (field: Field, position: number) => cells[hasHeader ? fields.indexOf(field) : position] ?? '';
    const frontText = get('frontText', 0), backText = get('backText', 1);
    const tagNames = parseTagNames(get('tags', 2) + ',' + commonTags);
    if (!frontText || !backText) preview.issues.push({ line: record.line, message: '表面と裏面の両方を入力してください。' });
    else if (tagNames.some(tag => tag.length > 80)) preview.issues.push({ line: record.line, message: 'タグ名は1つ80文字以内にしてください。' });
    else {
      try {
        const languages = languageFields({ frontLanguage: hasHeader && fields.includes('frontLanguage') ? get('frontLanguage', -1) : undefined, backLanguage: hasHeader && fields.includes('backLanguage') ? get('backLanguage', -1) : undefined });
        preview.rows.push({ frontText, backText, tagNames, notes: get('notes', 3), line: record.line, ...languages });
      } catch (e) { preview.issues.push({ line: record.line, message: e instanceof Error ? e.message : '読み上げ言語が正しくありません。' }); }
    }
  }
  return preview;
}

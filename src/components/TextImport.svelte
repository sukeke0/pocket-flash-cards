<script lang="ts">
  import { tick } from 'svelte';
  import type { Card } from '../lib/models';
  import { repository } from '../lib/db/repository';
  import { parseDelimited, countImportDuplicates, MAX_IMPORT_CHARS, type DelimiterOption, type HeaderOption, type ImportPreview } from '../lib/transfer/delimited';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  export let cards: Card[];
  export let onclose: () => void;
  export let onimported: (result: { added: number; skipped: number; tagsCreated: number }) => void;
  let source = '';
  let format: DelimiterOption = 'auto';
  let header: HeaderOption = 'auto';
  let commonTags = '';
  let skipDuplicates = true;
  let preview: ImportPreview | null = null;
  let busy = false;
  let error = '';
  let copied = false;
  let previewHeading: HTMLHeadingElement;
  let showAll = false;
  $: duplicates = preview ? countImportDuplicates(preview.rows, cards) : 0;
  $: addCount = (preview?.rows.length ?? 0) - (skipDuplicates ? duplicates : 0);
  const example = 'front\tback\ttags\tnotes\tfrontLanguage\tbackLanguage\napple\tりんご\t英単語,名詞\t\ten-US\tja-JP\nrun\t走る\t英単語,動詞\t\ten-US\tja-JP';
  const csvExample = 'front,back,tags,notes,frontLanguage,backLanguage\napple,りんご,"英単語,名詞",,en-US,ja-JP\nrun,走る,"英単語,動詞",,en-US,ja-JP';
  const aiPrompt = '次の内容をフラッシュカード用のTSVに変換してください。1行目は front、back、tags、notes、frontLanguage、backLanguage の6列を実際のタブ文字で区切ってください。以降は1行につき1カード、表面と裏面は必須、タグはセル内でカンマ区切り、メモは任意です。frontLanguageとbackLanguageはそれぞれ表面と裏面の読み上げ言語です。en-US（英語・アメリカ）、en-GB（英語・イギリス）、ja-JP（日本語）、zh-CN（中国語・簡体字）、ko-KR（韓国語）などの言語コードを使ってください。言語が指定されていない場合は文章の言語に合わせ、不明なら空欄にしてください。言語コードはtagsとは別の列にしてください。空欄もタブで6列を維持してください。セル内に改行やタブがある場合はセル全体を半角ダブルクォートで囲み、セル内のダブルクォートは2つ重ねてください。画像・デッキ名・学習履歴の列は追加しないでください。1,000枚以内とし、Markdownの表や説明文は付けず、TSVのコードブロックを1つだけ出力してください。\n\n変換したい内容：';
  function invalidate() { preview = null; error = ''; showAll = false; }
  async function check() {
    error = ''; preview = parseDelimited(source, format, header, commonTags); showAll = false;
    await tick(); previewHeading?.focus(); previewHeading?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function importCards() {
    if (busy || !preview || preview.issues.length || !addCount) return;
    busy = true; error = '';
    try { onimported(await repository.importTextCards(preview.rows, skipDuplicates)); }
    catch (e) { error = e instanceof Error ? e.message : '追加できませんでした。空き容量を確認して再試行してください。'; }
    finally { busy = false; }
  }
  async function loadFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    invalidate(); busy = true;
    try {
      if (file.size > 4 * MAX_IMPORT_CHARS) throw new Error('ファイルが大きすぎます。分割して読み込んでください。');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error('UTF-8のCSV／TSVファイルを選んでください。文字コードをUTF-8で保存し直すと読み込めます。'); }
      if (text.length > MAX_IMPORT_CHARS) throw new Error('入力は100万文字以内にしてください。');
      source = text;
    } catch (e) { error = e instanceof Error ? e.message : 'UTF-8のCSV／TSVファイルを選んでください。'; }
    finally { busy = false; input.value = ''; }
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(aiPrompt); copied = true; }
    catch { error = 'コピーできませんでした。表示された依頼文を選択してコピーしてください。'; }
  }
</script>
<Modal title="まとめてカードを追加" {onclose} {busy}>
  <div class="stack text-import">
    <p class="muted small">生成AIや表計算アプリで作ったCSV／TSVを貼り付けて、最大1,000枚をまとめて追加できます。</p>
    <fieldset class="form-fields stack" disabled={busy}>
      <div>
        <p class="muted small" id="import-example-format">入力例：{format === 'csv' ? 'CSV（カンマ区切り）' : 'TSV（タブ区切り）'}</p>
        <label>CSV／TSVを貼り付け<textarea class="import-source" bind:value={source} oninput={invalidate} placeholder={format === 'csv' ? csvExample : example} aria-describedby="import-example-format import-tag-format" rows="9" spellcheck="false" autocapitalize="off" maxlength={MAX_IMPORT_CHARS + 1}></textarea></label>
        <p class="muted small" id="import-tag-format">複数タグはカンマで区切ります。<strong>CSVではタグ欄を半角ダブルクォートで囲んでください。</strong><br />CSV：<code>"英単語,名詞"</code> ／ TSV：<code>英単語,名詞</code><br />曲がった引用符「“ ”」は区切りに使えません。</p>
      </div>
      <div class="row between"><span class="muted small">表面・裏面は必須。タグ・メモ・両面の読み上げ言語も追加できます。</span><label class="file-button nowrap">ファイルを選択<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onchange={loadFile} /></label></div>
      <p class="muted small">言語を指定する場合は、1行目に frontLanguage・backLanguage の列名を付けてください。例：en-US（英語）、ja-JP（日本語）。空欄・省略は端末の標準言語です。</p>
      <div class="import-options"><label>区切り文字<select bind:value={format} onchange={invalidate}><option value="auto">自動判別</option><option value="tsv">TSV（タブ）</option><option value="csv">CSV（カンマ）</option></select></label><label>1行目の列名<select bind:value={header} onchange={invalidate}><option value="auto">自動判別</option><option value="present">あり</option><option value="none">なし</option></select></label></div>
      <label>すべてに付けるタグ <span class="muted small">任意</span><input bind:value={commonTags} oninput={invalidate} placeholder="例：英検準1級, 今日の単語" /></label>
      <label class="check-row"><input type="checkbox" bind:checked={skipDuplicates} /><span>登録済みと同じ内容のカードはスキップ<small class="muted">同じCSV／TSVを再度取り込むときの二重登録を防ぎます。表面・裏面の文章が両方一致すると重複と判定し、今回の入力内の重複もスキップします。言語やタグの違いは判定に含めず、既存カードは更新しません。</small></span></label>
      <button class="secondary full" disabled={!source.trim()} onclick={check}><Icon name="search" size={18} />取り込み内容を確認</button>
    </fieldset>
    {#if preview}
      <section class="import-preview" aria-label="取り込みプレビュー">
        <h3 bind:this={previewHeading} tabindex="-1">{preview.issues.length ? '入力内容を確認してください' : addCount + '枚を追加できます'}</h3>
        <p class="muted small">{preview.format.toUpperCase()} · ヘッダー{preview.hasHeader ? 'あり' : 'なし'}{#if duplicates} · 重複 {duplicates}枚{skipDuplicates ? 'をスキップ' : 'も追加'}{/if}</p>
        {#if preview.issues.length}<div class="error" role="alert"><p>まだ追加されていません。修正してもう一度確認してください。</p><ul>{#each preview.issues.slice(0, 10) as issue}<li>{issue.line}行目：{issue.message}</li>{/each}</ul>{#if preview.issues.length > 10}<p>ほか {preview.issues.length - 10}件のエラーがあります。</p>{/if}</div>
        {:else}
          <ol class="import-preview-list">{#each preview.rows.slice(0, showAll ? 100 : 5) as row}<li><span class="muted small">{row.line}行目</span><strong>{row.frontText}</strong><p>{row.backText}</p><p class="muted small">読み上げ：表面 {row.frontLanguage || '端末の標準言語'} ／ 裏面 {row.backLanguage || '端末の標準言語'}</p>{#if row.tagNames.length}<div class="chips">{#each row.tagNames as name}<span class="chip static tiny">{name}</span>{/each}</div>{/if}{#if row.notes}<small class="muted pre-wrap">メモ：{row.notes}</small>{/if}</li>{/each}</ol>
          {#if preview.rows.length > 5 && !showAll}<button class="text-button" onclick={() => showAll = true}>続きを確認（最大100枚）</button>{/if}
          {#if preview.rows.length > (showAll ? 100 : 5)}<p class="muted small">全{preview.rows.length}枚のうち{showAll ? 100 : 5}枚を表示しています。</p>{/if}
          {#if !addCount}<p class="notice">すべて重複しています。新しく追加されるカードはありません。</p>{/if}
          <button class="primary full import-confirm" disabled={busy || !addCount} onclick={importCards}>{busy ? '追加中…' : addCount + '枚のカードを追加'}</button>
        {/if}
      </section>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <details class="import-help"><summary>書式の例・生成AIへの依頼文</summary><div class="stack"><p>列名を付ければ、列の順番を変えられます。front・backは必須、tags・notes・frontLanguage・backLanguageは省略できます。日本語の列名「表面・裏面・タグ・メモ・表面の読み上げ言語・裏面の読み上げ言語」も使えます。</p><pre>{csvExample}</pre><p>列名なしの場合は表面・裏面・タグ・メモの順で2〜4列です。言語を使う場合は列名を付けてください。CSVでカンマや改行を含むセルは半角の " " で囲みます。TSVでもセル内のタブや改行は引用符で囲んでください。</p><p>ファイルはUTF-8に対応しています。画像もまとめて追加する場合は「その他 → ZIPで一括登録」を使ってください。</p><p>追加されたカードは未学習・デッキ未登録です。デッキへの追加は、登録後にデッキの「編集」から行えます。学習履歴やデッキを含む移行には「バックアップから復元」を使います。</p><label>生成AIへの依頼文<textarea readonly value={aiPrompt} rows="6"></textarea></label><button class="secondary" onclick={copyPrompt}>{copied ? '依頼文をコピーしました' : '依頼文をコピー'}</button></div></details>
  </div>
</Modal>

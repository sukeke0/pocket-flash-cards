<script lang="ts">
  import Modal from './Modal.svelte';
  export let onclose: () => void;
</script>
<Modal title="一括登録ファイルの作り方" {onclose}>
  <div class="stack import-help">
    <p>カード一覧と画像を用意し、まとめてZIPにしてください。</p>
    <h3>1. ファイルを配置する</h3>
    <pre>cards.csv<br />images/<br />  apple.jpg<br />  cat-front.png<br />  cat-back.png</pre>
    <p>一覧はUTF-8の cards.csv または cards.tsv にします。画像を使う場合は images フォルダーに入れてください。</p>
    <h3>2. カード一覧を書く</h3>
    <pre>front,back,frontImage,backImage,tags,notes<br />apple,りんご,apple.jpg,,"英単語,名詞",<br />cat,猫,cat-front.png,cat-back.png,"英単語,名詞",</pre>
    <p>front は表面、back は裏面です。列名は必須ですが、画像がある面は文章を空欄にできます。frontImage・backImage には画像のファイル名を書き、大文字・小文字も一致させてください。</p>
    <p>tags はカンマ区切りのタグ、notes はメモです。使わない列は省略できます。CSVでセルにカンマや改行を含める場合は、半角のダブルクォートで囲みます。</p>
    <p>TSVの場合も列名は同じです。列をタブで区切り、cards.tsv としてUTF-8で保存してください。</p>
    <p>読み上げ言語は frontLanguage・backLanguage 列で指定できます。例：表面 en-US（英語）、裏面 ja-JP（日本語）。省略すると端末の標準言語になります。</p>
    <h3>3. ZIPにまとめて登録する</h3>
    <p>カード一覧と images フォルダーを一緒にZIPにします。「追加用ZIPを選択」から読み込み、プレビューを確認して登録してください。</p>
    <p>1回1,000枚・ZIPは50MBまで。画像はJPEG・PNG・WebP・GIFに対応し、200KB未満に調整します。大きいGIFは静止画になります。</p>
    <p>既存のカード・デッキ・学習記録は保持します。同じZIPを再度登録すると、その分も新しいカードとして追加されます。</p>
  </div>
</Modal>

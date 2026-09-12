<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import type { Card, Snapshot } from './lib/models';
  import { repository } from './lib/db/repository';
  import StudySetup from './components/StudySetup.svelte';
  import { DEFAULT_STUDY_OPTIONS, type StudyOptions } from './lib/srs/session';
  import { cardsInDeck } from './lib/decks';
  import Home from './screens/Home.svelte';
  import Statistics from './screens/Statistics.svelte';
  import { calculateStatistics, localDateKey } from './lib/statistics';
  import { automaticCandidates, loadDeckSelection, saveDeckSelection, clearDeckSelection, type DeckSelection } from './lib/autoStudy';
  import { planStudyStart } from './lib/srs/session';
  import { DEFAULT_AUTO_STUDY_SETTINGS, loadAutoStudySettings, saveAutoStudySettings, clearAutoStudySettings, type AutoStudySettings } from './lib/autoStudySettings';
  import Cards from './screens/Cards.svelte';
  import Decks from './screens/Decks.svelte';
  import More from './screens/More.svelte';
  import Study from './screens/Study.svelte';
  import ReviewHistory from './components/ReviewHistory.svelte';
  import CardEditor from './components/CardEditor.svelte';
  import CardViewer from './components/CardViewer.svelte';
  import Icon from './components/Icon.svelte';
  import BackupReminder from './components/BackupReminder.svelte';
  import Modal from './components/Modal.svelte';
  import { shouldShowBackupReminder, recordBackupExecuted, recordBackupWarningShown, resetBackupReminder } from './lib/backupReminder';
  type Page = 'home' | 'decks' | 'cards' | 'statistics' | 'more';
  const navigation: { page: Page; label: string; icon: 'home' | 'decks' | 'cards' | 'more' }[] = [{ page: 'home', label: 'ホーム', icon: 'home' }, { page: 'decks', label: 'デッキ', icon: 'decks' }, { page: 'cards', label: 'カード', icon: 'cards' }, { page: 'more', label: 'その他', icon: 'more' }];
  let page: Page = 'home';
  let unassignedOnly = false;
  let focusBackup = false;
  let showBackupReminder = false;
  let data: Snapshot = { cards: [], tags: [], decks: [], reviews: [] };
  let loading = true;
  let statisticsDate = new Date();
  let selection: DeckSelection = null;
  let autoSettings = { ...DEFAULT_AUTO_STUDY_SETTINGS };
  let homeError = '';
  let studyNotice = '';
  // Recompute on data changes or local midnight, never just for navigation/renders.
  $: statistics = calculateStatistics(data.cards, data.reviews, statisticsDate);
  function selectDecks(value: DeckSelection, settings?: AutoStudySettings) {
    try {
      if (settings) saveAutoStudySettings(localStorage, settings);
      try { saveDeckSelection(localStorage, value); }
      catch (e) { if (settings) saveAutoStudySettings(localStorage, autoSettings); throw e; }
      selection = value; if (settings) autoSettings = settings; homeError = ''; return true;
    }
    catch { notify('学習設定を保存できませんでした。ブラウザの保存設定を確認してください。'); return false; }
  }
  async function resetApp(): Promise<string | undefined> {
    await repository.resetAllData();
    selection = null; homeError = ''; unassignedOnly = false;
    autoSettings = { ...DEFAULT_AUTO_STUDY_SETTINGS };
    showBackupReminder = false;
    try { resetBackupReminder(localStorage); } catch { /* Reminder storage is optional. */ }
    studying = null; configuring = null; viewer = null; historyCardId = null;
    studyNotice = '';
    current = undefined; editing = false;
    studyOptions = { ...DEFAULT_STUDY_OPTIONS, mode: 'deck', order: 'mastery' };
    try { clearDeckSelection(localStorage); clearAutoStudySettings(localStorage); }
    catch { return 'カードなどのデータはリセットしましたが、保存済みの学習設定を削除できませんでした。次回起動時にホームの学習オプションを設定し直してください。'; }
  }
  function startAutomatic() {
    homeError = '';
    const cards = automaticCandidates(data.cards, data.decks, selection);
    const options: StudyOptions = { ...DEFAULT_STUDY_OPTIONS, mode: 'automatic', order: 'mastery', dailyLimit: autoSettings.dailyLimit, repeatAgain: autoSettings.repeatNonEasy, repeatHard: autoSettings.repeatNonEasy };
    if (!cards.length) { homeError = '選択したデッキにカードがありません。出題対象を変更するか、デッキにカードを追加してください。'; return; }
    const plan = planStudyStart(cards, data.reviews, options);
    studying = { id: ++sessionId, cards, title: '自動学習', options: plan.options };
    studyNotice = plan.notice;
    window.scrollTo(0, 0);
  }
  let error = '';
  let editing = false;
  let current: Card | undefined;
  let viewer: { cards: Card[]; title: string; initialIndex: number } | null = null;
  let studying: { id: number; cards: Card[]; title: string; options: StudyOptions; deckId?: string } | null = null;
  let sessionId = 0;
  let configuring: { cards: Card[]; title: string; deckId?: string } | null = null;
  let studyOptions: StudyOptions = { ...DEFAULT_STUDY_OPTIONS, mode: 'deck', order: 'mastery' };
  $: setupDeck = data.decks.find(deck => deck.id === configuring?.deckId);
  $: cardsById = new Map(data.cards.map(card => [card.id, card]));
  $: setupCards = configuring?.deckId ? (setupDeck ? cardsInDeck(data.cards, setupDeck) : []) : (configuring?.cards ?? []).flatMap(card => { const latest = cardsById.get(card.id); return latest ? [latest] : []; });
  let historyCardId: string | null = null;
  $: historyCard = data.cards.find(card => card.id === historyCardId);
  let toast = '';
  let updateReady = false;
  let online = navigator.onLine;
  let timer: ReturnType<typeof setTimeout>;
  let updateSW: (reloadPage?: boolean) => Promise<void>;
  function notify(message: string) { toast = message; clearTimeout(timer); timer = setTimeout(() => toast = '', 3500); }
  function edit(card?: Card) { viewer = null; current = card; editing = true; }
  function view(cards: Card[], title: string, deckId?: string, initialIndex = 0) {
    if (!cards.length) return;
    viewer = { cards, title, initialIndex };
    if (deckId) void repository.touchDeck(deckId).catch(() => notify('デッキの利用日時を保存できませんでした。'));
  }
  function study(cards: Card[], title: string, deckId?: string) {
    studyOptions = { ...studyOptions, mode: 'deck', order: studyOptions.mode === 'automatic' ? 'mastery' : studyOptions.order, dailyLimit: undefined, repeatAgain: false, repeatHard: false };
    configuring = { cards, title, deckId };
  }
  function reopenStudySettings() {
    if (!studying) return;
    studyOptions = { ...studying.options };
    configuring = { cards: studying.cards, title: studying.title, deckId: studying.deckId };
  }
  function startStudy(options: StudyOptions) {
    if (!configuring) return;
    const { title, deckId } = configuring;
    const plan = planStudyStart(setupCards, data.reviews, options);
    if (!plan.count) { configuring = null; notify('対象のカードがありません。デッキにカードを追加してください。'); return; }
    studyOptions = { ...options };
    studying = { id: ++sessionId, cards: setupCards, title, options: plan.options, deckId };
    studyNotice = plan.notice;
    configuring = null;
    window.scrollTo(0, 0);
    if (deckId) void repository.touchDeck(deckId).catch(() => notify('デッキの利用日時を保存できませんでした。'));
  }
  onMount(() => {
    const recordOpening = () => {
      try { if (document.visibilityState === 'visible' && shouldShowBackupReminder(localStorage)) showBackupReminder = true; }
      catch { /* Some browsers deny access to localStorage itself. */ }
    };
    recordOpening();
    document.addEventListener('visibilitychange', recordOpening);
    try { selection = loadDeckSelection(localStorage); }
    catch { homeError = '出題対象の設定を読み込めなかったため、すべてのデッキを対象にしています。'; }
    try { autoSettings = loadAutoStudySettings(localStorage); }
    catch { homeError = '学習オプションを読み込めなかったため、初期設定を使います。'; }
    const refreshDay = () => { const next = new Date(); if (localDateKey(next) !== localDateKey(statisticsDate) || next.getTimezoneOffset() !== statisticsDate.getTimezoneOffset()) statisticsDate = next; };
    const dayTimer = setInterval(refreshDay, 30_000);
    document.addEventListener('visibilitychange', refreshDay);
    const subscription = repository.observe().subscribe({
      next(snapshot) { data = snapshot; loading = false; error = ''; },
      error() { loading = false; error = '端末のデータを読み込めませんでした。ストレージの空き容量とブラウザの設定を確認して再読み込みしてください。'; },
    });
    const route = () => {
      const [hash, query = ''] = window.location.hash.slice(1).split('?');
      page = hash === 'statistics' ? 'statistics' : navigation.find(item => item.page === hash)?.page ?? 'home';
      unassignedOnly = page === 'cards' && new URLSearchParams(query).get('filter') === 'unassigned';
      focusBackup = page === 'more' && new URLSearchParams(query).get('section') === 'backup';
      configuring = null; window.scrollTo(0, 0);
    };
    const connection = () => { online = navigator.onLine; };
    route();
    window.addEventListener('hashchange', route);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    updateSW = registerSW({
      onNeedRefresh() { updateReady = true; },
      onRegisterError() { notify('通信なしでの起動に必要なファイルを保存できませんでした。インターネットに接続して開き直してください。'); },
    });
    return () => { subscription.unsubscribe(); clearTimeout(timer); clearInterval(dayTimer); document.removeEventListener('visibilitychange', refreshDay); document.removeEventListener('visibilitychange', recordOpening); window.removeEventListener('hashchange', route); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  });
</script>
<div class="app-shell" class:studying={!!studying}>
  <div class="desktop-brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} width="30" height="30" alt="" /><span>Pocket Flash Cards</span><span class="muted small">自分のペースで、少しずつ。</span></div>
  <main id="main">
    {#if !online}<div class="offline-banner" role="status">オフライン · この端末のカードを利用できます</div>{/if}
    {#if updateReady && !studying}<div class="update-banner"><span>新しいバージョンがあります。</span><button class="text-button" disabled={editing || !!viewer || !!configuring} onclick={() => updateSW(true)}>更新する</button></div>{/if}
    {#if loading}<div class="empty loading" role="status">カードを読み込んでいます…</div>
    {:else if error}<div class="panel empty"><h1>読み込めませんでした</h1><p class="error" role="alert">{error}</p><button class="primary" onclick={() => location.reload()}>再読み込み</button></div>
    {:else if studying}{#key studying.id}<Study latestCards={data.cards} onedit={edit} cards={studying.cards} reviews={data.reviews} title={studying.title} options={studying.options} onsettings={reopenStudySettings} onclose={() => studying = null} onview={() => { if (studying) view(studying.cards, studying.title); studying = null; }} onhistory={card => historyCardId = card.id} />{/key}
    {:else if page === 'home'}<Home todayCount={statistics.today.cards} decks={data.decks} {selection} settings={autoSettings} onselect={selectDecks} onstart={startAutomatic} error={homeError} />
    {:else if page === 'statistics'}<Statistics allStatistics={statistics} cards={data.cards} reviews={data.reviews} decks={data.decks} tags={data.tags} now={statisticsDate} />
    {:else if page === 'cards'}<Cards cards={data.cards} decks={data.decks} tags={data.tags} {unassignedOnly} onfilterchange={value => window.location.hash = value ? 'cards?filter=unassigned' : 'cards'} onadd={() => edit()} onedit={edit} onview={(cards, title, index) => view(cards, title, undefined, index)} />
    {:else if page === 'decks'}<Decks cards={data.cards} decks={data.decks} tags={data.tags} onview={view} onstudy={study} onaddcards={() => window.location.hash = 'cards'} />
    {:else}<More snapshot={data} tags={data.tags} {focusBackup} onreset={resetApp} onbackupexecuted={() => { showBackupReminder = false; try { recordBackupExecuted(localStorage); } catch { /* Optional reminder storage. */ } }} />{/if}
  </main>
  {#if !studying}<nav class="bottom-nav" aria-label="メインナビゲーション">{#each navigation as item}{@const active = page === item.page || (page === 'statistics' && item.page === 'more')}<a href={`#${item.page}`} class:active aria-current={active ? 'page' : undefined}><Icon name={item.icon} size={23} /><span>{item.label}</span></a>{/each}</nav>{/if}
</div>
{#if editing}<CardEditor allowDelete={!studying} card={current} tags={data.tags} onclose={() => editing = false} onsaved={() => { editing = false; notify('変更を保存しました'); }} />{/if}
{#if viewer}<CardViewer cards={viewer.cards} title={viewer.title} initialIndex={viewer.initialIndex} tags={data.tags} onclose={() => viewer = null} onedit={edit} onhistory={card => historyCardId = card.id} />{/if}
{#if historyCard}<ReviewHistory card={historyCard} reviews={data.reviews} onclose={() => historyCardId = null} />{/if}
{#if configuring}<StudySetup cards={setupCards} reviews={data.reviews} title={setupDeck?.name ?? configuring.title} initialOptions={studyOptions} revising={!!studying} onclose={() => configuring = null} onstart={startStudy} />{/if}
{#if studyNotice}<Modal title="学習のお知らせ" onclose={() => studyNotice = ''}><div class="stack"><p class="pre-wrap">{studyNotice}</p><button class="primary full" onclick={() => studyNotice = ''}>学習を続ける</button></div></Modal>{/if}
{#if showBackupReminder && !loading && !error && !editing && !viewer && !configuring && !studying}<BackupReminder onshown={() => { try { recordBackupWarningShown(localStorage); } catch { /* Optional reminder storage. */ } }} onclose={() => showBackupReminder = false} onbackup={() => { showBackupReminder = false; window.location.hash = 'more?section=backup'; }} />{/if}
{#if toast}<div class="toast" role="status"><Icon name="check" size={18} />{toast}</div>{/if}

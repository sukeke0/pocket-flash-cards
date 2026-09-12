<script lang="ts">
  import type { Statistics } from '../lib/statistics';
  export let groups: Statistics['mastery'];
  export let total: number;
  const labels = { mastered: '定着', unmastered: '復習中', unlearned: '未学習' };
  const colors = { mastered: 'var(--mastered-color)', unmastered: 'var(--unmastered-color)', unlearned: 'var(--unlearned-color)' };
  $: stops = groups.map((group, index) => {
    const start = groups.slice(0, index).reduce((sum, item) => sum + item.percent, 0);
    return `${colors[group.key]} ${start}% ${start + group.percent}%`;
  }).join(', ');
  $: description = groups.map(group => `${labels[group.key]} ${Math.round(group.percent)}%`).join('、');
</script>
<div class="mastery-distribution">
  <dl class="today-statistics mastery-counts" aria-label="学習状況別のカード枚数">{#each groups as group}<div><dt><span class="mastery-dot" style:background={colors[group.key]}></span>{labels[group.key]}</dt><dd>{group.count.toLocaleString()}<small>枚</small></dd></div>{/each}</dl>
  <div class="mastery-pie" class:empty-pie={!total} style:background={total ? `conic-gradient(${stops})` : 'var(--search)'} role="img" aria-label={total ? `学習状況の割合：${description}` : '対象カードがないため割合はありません'}>{#if !total}<span>データなし</span>{/if}</div>
  <ul class="mastery-legend" aria-label="学習状況の割合">{#each groups as group}<li><span class="mastery-dot" style:background={colors[group.key]}></span><span class="grow">{labels[group.key]}</span><strong>{total ? `${Math.round(group.percent)}%` : '—'}</strong></li>{/each}</ul>
</div>

<script lang="ts">
  import { icons } from '../lib/icons';
  export let name: keyof typeof icons = 'cards';
  export let size = 24;
  $: definition = icons[name];
  $: [width, height, , , path] = definition.icon;
  $: paths = typeof path === 'string' ? [path] : path;
</script>
<svg class="fa-icon" data-icon={definition.iconName} width={size} height={size} viewBox={`0 0 ${width} ${height}`} fill="currentColor" aria-hidden="true" focusable="false">{#each paths as d}<path {d} />{/each}</svg>

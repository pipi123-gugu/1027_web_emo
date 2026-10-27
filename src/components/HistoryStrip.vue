<script setup>
import { EMOTIONS } from '../utils/emotionMap.js'

const props = defineProps({
  items: { type: Array, default: () => [] }
})
const emit = defineEmits(['pick', 'clear'])

function time(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function emo(k) {
  return EMOTIONS[k] || EMOTIONS.calm
}
</script>

<template>
  <section v-if="items.length" class="history card">
    <header class="head">
      <h3>情绪轨迹</h3>
      <button class="clear" @click="emit('clear')">清空</button>
    </header>
    <div class="chips">
      <button
        v-for="it in items"
        :key="it.id"
        class="chip"
        :style="{ '--c': emo(it.dominant).color }"
        :title="`${emo(it.dominant).label} · 置信度 ${Math.round(it.confidence * 100)}%`"
        @click="emit('pick', it)"
      >
        <span class="e">{{ emo(it.dominant).emoji }}</span>
        <span class="l">{{ emo(it.dominant).label }}</span>
        <span class="t">{{ time(it.at) }}</span>
      </button>
    </div>
    <p class="tip">点击任意一条可以回看那次识别结果与推荐</p>
  </section>
</template>

<style scoped>
.history { min-width: 0; }
.head { display: flex; align-items: center; justify-content: space-between; }
.head h3 { margin: 0; font-size: 14px; color: var(--ink, #12271d); }
.clear { border: none; background: none; font-size: 11px; color: #a0b5aa; cursor: pointer; }
.clear:hover { color: #d9534f; }
.chips { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;
  border-radius: 999px; border: 1px solid var(--line, #e2efe8); background: #f9fcfb;
  cursor: pointer; transition: .15s;
}
.chip:hover { border-color: var(--c); background: #fff; transform: translateY(-1px); }
.chip .e { font-size: 13px; }
.chip .l { font-size: 11px; font-weight: 600; color: var(--c); }
.chip .t { font-size: 10px; color: #a8bcb2; font-variant-numeric: tabular-nums; }
.tip { margin: 8px 0 0; font-size: 10px; color: #a8bcb2; }
</style>

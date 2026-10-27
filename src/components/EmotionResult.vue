<script setup>
import { computed } from 'vue'
import { EMOTIONS, EMOTION_KEYS } from '../utils/emotionMap.js'
import VaChart from './VaChart.vue'

const props = defineProps({
  result: { type: Object, default: null },
  advice: { type: String, default: '' }
})

const dominant = computed(() => (props.result ? EMOTIONS[props.result.dominant] : null))
const uncertain = computed(() => !!props.result && props.result.confidence < 0.4)

const bars = computed(() => {
  if (!props.result) return []
  return EMOTION_KEYS.map((k) => ({
    key: k,
    label: EMOTIONS[k].label,
    emoji: EMOTIONS[k].emoji,
    color: EMOTIONS[k].color,
    value: Math.round((props.result.scores[k] || 0) * 100)
  })).sort((a, b) => b.value - a.value)
})
</script>

<template>
  <section class="emotion card">
    <header class="head">
      <h3>情绪识别结果</h3>
      <span v-if="result" class="conf-pill" :style="{ color: dominant.color, background: dominant.color + '14' }">
        置信度 {{ Math.round(result.confidence * 100) }}%
      </span>
    </header>

    <div v-if="!result" class="empty">
      <div class="empty-ico">🙂</div>
      <p>还没有识别结果</p>
      <span>在左侧上传图片、开启摄像头，或直接点一张示例人脸。</span>
    </div>

    <template v-else>
      <div class="hero" :style="{ '--c': dominant.color }">
        <div class="emoji">{{ dominant.emoji }}</div>
        <div class="hero-txt">
          <div class="label">{{ dominant.label }}</div>
          <div class="desc">{{ dominant.desc }}</div>
        </div>
      </div>

      <ul class="bars">
        <li v-for="b in bars" :key="b.key">
          <span class="name">{{ b.emoji }} {{ b.label }}</span>
          <span class="track"><i :style="{ width: Math.max(b.value, 1) + '%', background: b.color }"></i></span>
          <span class="val">{{ b.value }}%</span>
        </li>
      </ul>

      <VaChart :scores="result.scores" />

      <p v-if="uncertain" class="notice">
        ⚖️ 这张人脸的情绪不够明确（置信度低于 40%），推荐结果已自动向「平静」倾斜，避免过度解读。
      </p>
      <p v-if="advice" class="advice">💡 {{ advice }}</p>
    </template>
  </section>
</template>

<style scoped>
.emotion { min-width: 0; overflow: hidden; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.head h3 { margin: 0; font-size: 15px; color: var(--ink, #12271d); }
.conf-pill { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }

.empty { text-align: center; padding: 28px 8px 18px; color: #8aa79a; }
.empty-ico { font-size: 40px; opacity: .55; }
.empty p { margin: 8px 0 4px; font-weight: 600; color: #5c8272; }
.empty span { font-size: 12px; line-height: 1.6; }

.hero {
  display: flex; align-items: center; gap: 14px; margin-top: 12px;
  padding: 14px 16px; border-radius: 16px;
  background: #f6fbf8;
  background: linear-gradient(120deg, color-mix(in srgb, var(--c) 16%, #ffffff), #ffffff 85%);
  border: 1px solid #e4f0e9;
  border-color: color-mix(in srgb, var(--c) 30%, #ffffff);
  transition: background .4s;
}
.emoji { font-size: 44px; line-height: 1; }
.hero-txt { min-width: 0; }
.label { font-size: 24px; font-weight: 800; color: var(--c); letter-spacing: .02em; }
.desc { font-size: 12px; color: #6b8a7c; margin-top: 2px; }

.bars { list-style: none; padding: 0; margin: 16px 0 0; }
.bars li { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 12px; }
.name { width: 74px; flex: none; color: #4a6b5c; }
.track { flex: 1; min-width: 0; height: 9px; background: #eef6f2; border-radius: 6px; overflow: hidden; }
.track i { display: block; height: 100%; border-radius: 6px; transition: width .45s ease; }
.val { width: 36px; text-align: right; color: #7d9a8c; font-variant-numeric: tabular-nums; }

.notice {
  margin: 12px 0 0; font-size: 12px; line-height: 1.6; color: #8a6d1f;
  background: #fffaeb; border: 1px solid #f7e6b8; padding: 9px 12px; border-radius: 12px;
}
.advice {
  margin: 10px 0 0; font-size: 12px; line-height: 1.7; color: #4a6b5c;
  background: #f4faf7; padding: 10px 12px; border-radius: 12px;
}
</style>

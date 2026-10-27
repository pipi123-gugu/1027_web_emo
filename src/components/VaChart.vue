<script setup>
import { computed } from 'vue'
import { EMOTIONS, EMOTION_KEYS, mixVA } from '../utils/emotionMap.js'

/**
 * Russell 环形情感模型（Valence–Arousal）
 * ---------------------------------------------------------------
 * 6 类情绪在「效价(横轴) × 唤醒度(纵轴)」平面上各有一个锚点，
 * 当前识别结果按概率加权平均得到一个连续坐标点 ——
 * 比单纯一条「开心 62%」更能说明「你现在处在什么状态」。
 */
const props = defineProps({
  scores: { type: Object, default: null }
})

const W = 320
const H = 240
const PAD = 30

const pt = computed(() => {
  if (!props.scores) return null
  const { valence, arousal } = mixVA(props.scores)
  return {
    v: valence,
    a: arousal,
    x: PAD + valence * (W - PAD * 2),
    y: H - PAD - arousal * (H - PAD * 2)
  }
})

const anchors = computed(() =>
  EMOTION_KEYS.map((k) => {
    const e = EMOTIONS[k]
    return {
      key: k,
      label: e.label,
      emoji: e.emoji,
      color: e.color,
      x: PAD + e.valence * (W - PAD * 2),
      y: H - PAD - e.arousal * (H - PAD * 2)
    }
  })
)

const grid = computed(() => {
  const xs = [0.25, 0.5, 0.75].map((r) => PAD + r * (W - PAD * 2))
  const ys = [0.25, 0.5, 0.75].map((r) => H - PAD - r * (H - PAD * 2))
  return { xs, ys }
})
</script>

<template>
  <div class="va" :class="{ empty: !pt }">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="情绪在效价唤醒度平面上的位置">
      <defs>
        <radialGradient id="vaGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" :stop-color="pt ? '#2ecc71' : '#cfd8d3'" stop-opacity=".28" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 画布 -->
      <rect :x="PAD - 10" :y="PAD - 10" :width="W - PAD * 2 + 20" :height="H - PAD * 2 + 20"
            rx="16" fill="#f7fbf9" stroke="#e3efe8" />

      <!-- 网格 -->
      <g stroke="#e6f1eb" stroke-width="1">
        <line v-for="x in grid.xs" :key="'x' + x" :x1="x" :y1="PAD - 6" :x2="x" :y2="H - PAD + 6" />
        <line v-for="y in grid.ys" :key="'y' + y" :x1="PAD - 6" :y1="y" :x2="W - PAD + 6" :y2="y" />
      </g>

      <!-- 坐标轴 -->
      <g stroke="#c9ded4" stroke-width="1.2">
        <line :x1="PAD - 8" :y1="H - PAD" :x2="W - PAD + 8" :y2="H - PAD" />
        <line :x1="PAD" :y1="PAD - 8" :x2="PAD" :y2="H - PAD + 8" />
      </g>
      <text :x="W - PAD + 6" :y="H - PAD + 16" text-anchor="end" class="axis">效价 →</text>
      <text :x="PAD - 6" :y="PAD - 12" text-anchor="start" class="axis">↑ 唤醒度</text>

      <!-- 情绪锚点 -->
      <g v-for="a in anchors" :key="a.key">
        <circle :cx="a.x" :cy="a.y" r="5" :fill="a.color" opacity=".22" />
        <text :x="a.x" :y="a.y + 4" text-anchor="middle" class="anchor-emoji">{{ a.emoji }}</text>
        <text :x="a.x" :y="a.y + 18" text-anchor="middle" class="anchor">{{ a.label }}</text>
      </g>

      <!-- 当前位置 -->
      <g v-if="pt">
        <circle :cx="pt.x" :cy="pt.y" r="26" fill="url(#vaGlow)" />
        <circle :cx="pt.x" :cy="pt.y" r="12" fill="none" stroke="#2ecc71" stroke-width="1.5" opacity=".45">
          <animate attributeName="r" values="10;18;10" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".5;.1;.5" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle :cx="pt.x" :cy="pt.y" r="7" fill="#fff" stroke="#2ecc71" stroke-width="3" />
      </g>
    </svg>
    <p class="cap">
      <template v-if="pt">
        效价 {{ (pt.v * 100).toFixed(0) }} · 唤醒 {{ (pt.a * 100).toFixed(0) }}
      </template>
      <template v-else>识别后显示你在情感平面上的位置</template>
    </p>
  </div>
</template>

<style scoped>
.va { margin-top: 12px; }
.va svg { width: 100%; height: auto; display: block; }
.axis { font-size: 9px; fill: #8aa79a; font-family: system-ui, sans-serif; }
.anchor { font-size: 8px; fill: #7d9a8c; font-family: system-ui, sans-serif; }
.anchor-emoji { font-size: 9px; }
.cap { margin: 6px 0 0; text-align: center; font-size: 11px; color: #8aa79a; }
.va.empty svg { opacity: .55; }
</style>

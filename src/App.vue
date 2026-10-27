<script setup>
import { ref, computed, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import CapturePanel from './components/CapturePanel.vue'
import EmotionResult from './components/EmotionResult.vue'
import SongList from './components/SongList.vue'
import PlayerBar from './components/PlayerBar.vue'
import HistoryStrip from './components/HistoryStrip.vue'
import { useRecommend } from './composables/useRecommend.js'
import { useHistory } from './composables/useHistory.js'
import { EMOTIONS } from './utils/emotionMap.js'
import { toggle, next, prev, player } from './composables/usePlayer.js'

const { songs, recommending, onlineError, usedOnline, advice, recommendFor } = useRecommend()
const { history, pushHistory, clearHistory } = useHistory()

const result = ref(null)

/* --------------------------- 情绪驱动的主题色 --------------------------- */
const accent = computed(() => (result.value ? EMOTIONS[result.value.dominant].color : '#2ecc71'))
const accentDeep = computed(() => (result.value ? EMOTIONS[result.value.dominant].deep : '#1f8f5a'))
watchEffect(() => {
  const root = document.documentElement.style
  root.setProperty('--accent', accent.value)
  root.setProperty('--accent-deep', accentDeep.value)
  root.setProperty('--accent-soft', accent.value + '26')
})

/* ------------------------------ 推荐触发控制 ------------------------------ */
// 摄像头连续识别时每帧都会回调，这里做「情绪变化 + 时间间隔」双重节流，
// 避免同一情绪反复打接口、也避免列表在眼前乱跳。
let debounceTimer = null
let lastEmotion = ''
let lastConf = 0
let lastRunAt = 0
let lastPushAt = 0

function onDetected(r) {
  result.value = r
  if (!r) {
    recommendFor(null)
    return
  }
  const now = Date.now()
  // 情绪历史：主导情绪变化或距上次记录超过 5s 才写，避免刷爆 localStorage
  if (r.dominant !== lastEmotion || now - lastPushAt > 5000) {
    pushHistory(r)
    lastPushAt = now
  }
  const changed = r.dominant !== lastEmotion
  const bigShift = Math.abs(r.confidence - lastConf) > 0.18
  if (!changed && !bigShift && now - lastRunAt < 4000) return

  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    lastEmotion = r.dominant
    lastConf = r.confidence
    lastRunAt = Date.now()
    recommendFor(result.value)
  }, 350)
}

function pickHistory(item) {
  const r = { scores: item.scores, dominant: item.dominant, confidence: item.confidence, box: null }
  result.value = r
  lastEmotion = ''
  recommendFor(r)
}

/* -------------------------------- 快捷键 -------------------------------- */
function onKey(e) {
  const tag = (e.target?.tagName || '').toLowerCase()
  if (['input', 'textarea', 'select'].includes(tag)) return
  if (!player.list.length) return
  if (e.code === 'Space') {
    e.preventDefault()
    toggle()
  } else if (e.code === 'ArrowRight' && e.altKey) {
    next()
  } else if (e.code === 'ArrowLeft' && e.altKey) {
    prev()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="app">
    <div class="aurora" aria-hidden="true"></div>

    <header class="topbar">
      <div class="brand">
        <span class="logo">🎵</span>
        <div class="brand-txt">
          <h1>情绪音乐</h1>
          <p>人脸情绪识别 · 端侧推理 · 双通道推荐</p>
        </div>
      </div>
      <div class="pills">
        <span class="pill" :class="{ on: usedOnline }">
          {{ usedOnline ? '在线曲库已接入' : '本地曲库模式' }}
        </span>
        <span class="pill ghost">face-api.js 本地推理</span>
      </div>
    </header>

    <main class="layout">
      <div class="col">
        <CapturePanel @detected="onDetected" />
      </div>
      <div class="col side">
        <EmotionResult :result="result" :advice="advice" />
        <HistoryStrip :items="history" @pick="pickHistory" @clear="clearHistory" />
      </div>
    </main>

    <SongList :songs="songs" :loading="recommending" :online-error="onlineError" />

    <details class="algo card">
      <summary>
        <span>📖 算法说明</span>
        <span class="sum-hint">情绪识别怎么做的？推荐为什么是这几首？</span>
      </summary>
      <div class="algo-body">
        <div>
          <h4>① 情绪识别（本地，无云端 API）</h4>
          <ol>
            <li><b>人脸定位</b>：TinyFaceDetector（轻量 SSD），416 / 320 / 224 三档输入尺寸逐级重试，提升暗脸与小脸召回。</li>
            <li><b>表情分类</b>：FaceExpressionNet 输出 7 类概率（neutral / happy / sad / angry / fearful / disgusted / surprised）。</li>
            <li><b>情绪融合</b>：7 类归并为 6 个标准情绪（开心/难过/愤怒/惊讶/恐惧/平静），同类概率累加，取最大值为<strong>主导情绪</strong>，其值即<strong>置信度</strong>。</li>
            <li><b>时序平滑</b>：连续帧用指数滑动平均（α=0.4）混合前后帧，摄像头场景下标签不再逐帧跳变。</li>
            <li><b>质量门控</b>：人脸占画面比例 &lt; 2% 或检测分 &lt; 0.4 时提示用户调整，而不是硬给结论。</li>
          </ol>
        </div>
        <div>
          <h4>② 歌曲推荐（v2）</h4>
          <p>对主导情绪 <code>E</code>、置信度 <code>c</code>，每首歌算两路分：</p>
          <ol>
            <li><b>情绪相似度</b> <code>match = SIMILARITY[E][歌曲情绪]</code>，对角为 1，相邻情绪衰减。</li>
            <li><b>氛围距离</b> 把 6 类情绪映射到「效价 × 唤醒度」二维平面，用欧氏距离算 <code>va</code>，避免「类别对了但感觉不对」。</li>
            <li><b>合成</b> <code>score = (0.7·match + 0.3·va) × (0.75 + 0.25·c)</code>，置信度低时结果自然摊平。</li>
            <li><b>多样性重排</b> MMR：<code>λ·score + (1-λ)·(1-与已选最大相似度)</code>，λ=0.78，防止 12 首全是同一情绪。</li>
            <li><b>双通道素材</b>：本地曲库可离线播放；在线部分按情绪用 2 组关键词并行检索、去重，8s 超时自动降级。</li>
          </ol>
        </div>
      </div>
    </details>

    <footer class="foot">
      纯前端推理 · Vue3 + face-api.js · 摄像头需 https 或 localhost · 在线歌曲经本地代理调用网易云音乐接口
      <br />
      快捷键：空格 播放/暂停 · Alt + ← / → 切歌
    </footer>

    <PlayerBar />
  </div>
</template>

<style scoped>
.app {
  max-width: 1180px; width: 100%; margin: 0 auto;
  padding: 20px 16px 120px; position: relative; z-index: 1;
}

.aurora {
  position: fixed; inset: -20% -10% auto -10%; height: 62vh; z-index: -1; pointer-events: none;
  background:
    radial-gradient(46% 46% at 18% 22%, var(--accent-soft), transparent 70%),
    radial-gradient(40% 40% at 82% 10%, #cfeaffaa, transparent 72%);
  filter: blur(12px);
  transition: background .6s ease;
}

.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 12px; }
.logo {
  font-size: 26px; width: 46px; height: 46px; border-radius: 15px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--accent), var(--accent-deep));
  box-shadow: 0 10px 24px var(--accent-soft);
  transition: background .4s;
}
.topbar h1 { margin: 0; font-size: 21px; letter-spacing: .01em; color: #12271d; }
.topbar p { margin: 3px 0 0; font-size: 12px; color: #7d9a8c; }
.pills { display: flex; gap: 8px; flex-wrap: wrap; }
.pill {
  font-size: 11px; padding: 6px 12px; border-radius: 999px; font-weight: 600;
  background: #eef7f2; color: #7d9a8c;
}
.pill.on { background: #e4f8ee; color: #1f8f5a; }
.pill.ghost { background: #fff; border: 1px solid var(--line); }

.layout {
  display: grid; grid-template-columns: minmax(340px, 1.08fr) minmax(0, 1fr);
  gap: 16px; margin-top: 18px; align-items: start;
}
.layout > * { min-width: 0; }
.side { display: flex; flex-direction: column; gap: 16px; }

.algo { margin-top: 16px; }
.algo summary {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  cursor: pointer; font-weight: 700; font-size: 14px; color: #1c3a2c; list-style: none;
}
.algo summary::-webkit-details-marker { display: none; }
.sum-hint { font-size: 11px; font-weight: 500; color: #a0b5aa; }
.algo-body { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 14px; }
.algo-body h4 { margin: 0 0 8px; font-size: 13px; color: var(--accent-deep); }
.algo-body p { margin: 0 0 6px; font-size: 12px; color: #4a6b5c; }
.algo-body ol { margin: 0; padding-left: 18px; color: #4a6b5c; font-size: 12px; line-height: 1.75; }
.algo-body li { margin-bottom: 4px; }
.algo-body code {
  background: #eef7f2; padding: 1px 5px; border-radius: 5px; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.foot { margin-top: 20px; text-align: center; font-size: 11px; color: #a0b5aa; line-height: 1.8; }

@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
  .algo-body { grid-template-columns: 1fr; }
}
</style>

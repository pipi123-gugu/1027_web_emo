<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { useEmotion, resetSmoothing } from '../composables/useEmotion.js'
import { EMOTIONS, EMOTION_KEYS } from '../utils/emotionMap.js'

const emit = defineEmits(['detected'])

// 一键演示用示例人脸（已生成到 public/demos/，覆盖 6 种情绪）
// 用 BASE_URL 拼路径，保证部署到 GitHub Pages 子路径时也能取到图
const BASE = import.meta.env.BASE_URL
// 示例图的版本号：图片内容一改就把它 +1。
// 原因是文件名固定（demo-fear.png），浏览器/CDN 会把旧图缓存住、不回来问，
// 换成带版本号的 URL 才能让老访客立刻拿到新图（2026-10-30 换了恐惧图 → v2）。
const DEMO_VER = 'v2'
// 提示：恐惧那张是「胸腔以上、张嘴惊叫」的构图——太近的特写虽然人眼一看就是恐惧，
// 但 TinyFaceDetector 只能框到眉眼到嘴，且表情网在 320/224 尺度会翻成「惊讶」。
// 现在这张在 416/320/224 三个尺度下都稳定输出 fearful。
const DEMOS = EMOTION_KEYS.map((k) => ({
  key: k,
  label: EMOTIONS[k].label,
  emoji: EMOTIONS[k].emoji,
  color: EMOTIONS[k].color,
  src: `${BASE}demos/demo-${k}.png?${DEMO_VER}`
}))

const { loading, loadError, loadModels, detect } = useEmotion()

const mode = ref('image') // image | video | camera | photo
const videoRef = ref(null)
const imgRef = ref(null)
const canvasRef = ref(null)
const stream = ref(null)
const photoTaken = ref(false)

const detecting = ref(false)
const live = ref(false)
const hasMedia = ref(false)
const status = ref('上传一张人脸照片，或点下面的「示例」直接体验')
const error = ref('')
const hint = ref('')

let rafId = 0
let lastTick = 0
let missCount = 0
let objectUrl = ''

const showVideo = computed(() => mode.value !== 'image' && !(mode.value === 'photo' && photoTaken.value))
const showImage = computed(() => mode.value === 'image' || (mode.value === 'photo' && photoTaken.value))
const canLive = computed(() => mode.value === 'camera' || mode.value === 'photo' || mode.value === 'video')

function activeMediaEl() {
  if (mode.value === 'image' || (mode.value === 'photo' && photoTaken.value)) return imgRef.value
  return videoRef.value
}

function clearObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
}

function stopCamera() {
  stopLive()
  if (stream.value) {
    stream.value.getTracks().forEach((t) => t.stop())
    stream.value = null
  }
  if (videoRef.value) videoRef.value.srcObject = null
}

async function switchMode(m) {
  if (m === mode.value) return
  stopCamera()
  clearObjectUrl()
  resetSmoothing()
  mode.value = m
  photoTaken.value = false
  hasMedia.value = false
  error.value = ''
  hint.value = ''
  clearOverlay()
  emit('detected', null)
  if (m === 'image') status.value = '上传一张人脸照片，或点下面的「示例」直接体验'
  else if (m === 'video') status.value = '上传一段含人脸的视频，可开启实时追踪'
  else if (m === 'camera') {
    status.value = '正在开启摄像头…'
    await startCamera()
  } else if (m === 'photo') {
    status.value = '开启摄像头后点击「📸 拍照识别」'
    await startCamera()
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = '当前环境不支持摄像头（需 https 或 localhost，并使用现代浏览器）'
    return
  }
  try {
    error.value = ''
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    })
    stream.value = s
    await new Promise((resolve) => {
      const v = videoRef.value
      v.srcObject = s
      v.onloadedmetadata = () => resolve()
      v.play().catch(() => {})
    })
    status.value = '摄像头已开启，正在实时识别（默认每 0.25s 一次）'
    hasMedia.value = true
    startLive()
  } catch (e) {
    const msg = e?.name === 'NotAllowedError'
      ? '摄像头权限被拒绝，请在浏览器地址栏的权限设置里允许后重试'
      : '无法访问摄像头：' + (e?.message || e)
    error.value = msg + '（需 https 或 localhost 环境）'
  }
}

function onImageFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  stopCamera()
  clearObjectUrl()
  resetSmoothing()
  photoTaken.value = false
  objectUrl = URL.createObjectURL(f)
  const img = imgRef.value
  hasMedia.value = true
  img.onload = () => {
    status.value = '图片已加载，识别中…'
    runDetect()
  }
  img.src = objectUrl
}

// 一键演示：直接使用内置示例人脸进行识别
function useDemo(d) {
  stopCamera()
  clearObjectUrl()
  resetSmoothing()
  mode.value = 'image'
  error.value = ''
  hint.value = ''
  photoTaken.value = false
  const img = imgRef.value
  hasMedia.value = true
  img.onload = () => {
    status.value = `示例「${d.label}」，识别中…`
    runDetect()
  }
  img.src = d.src
}

function onVideoFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  stopCamera()
  clearObjectUrl()
  resetSmoothing()
  objectUrl = URL.createObjectURL(f)
  const v = videoRef.value
  v.src = objectUrl
  v.loop = true
  hasMedia.value = true
  v.onloadeddata = () => {
    status.value = '视频已加载，点击「识别当前帧」或开启实时追踪'
    v.pause()
    v.currentTime = 0
  }
}

async function runDetect({ liveMode = false } = {}) {
  const el = activeMediaEl()
  if (!el) {
    error.value = '没有可识别的画面'
    return
  }
  // 等媒体就绪（避免 video 元数据还没到就检测）
  if (el.tagName === 'VIDEO' && el.readyState < 2) {
    await new Promise((r) => { el.onloadeddata = r })
  }
  if (el.tagName === 'IMG' && !el.complete) {
    await new Promise((r) => { el.onload = r })
  }

  detecting.value = true
  error.value = ''
  try {
    // 连续帧用 alpha=0.4 做平滑；单张图片不做平滑，避免残留上一次结果
    const res = await detect(el, { alpha: liveMode ? 0.4 : 1 })
    if (!res) {
      missCount++
      clearOverlay()
      if (!liveMode) {
        hint.value = ''
        status.value = '未检测到人脸，换一张正脸清晰的照片试试'
        emit('detected', null)
      } else if (missCount > 6) {
        status.value = '画面里找不到人脸，把脸放进取景框中间试试'
      }
      return
    }
    missCount = 0
    hint.value = res.hint || ''
    drawOverlay(res)
    const info = EMOTIONS[res.dominant]
    status.value = `识别到 ${info.emoji} ${info.label} · 置信度 ${(res.confidence * 100).toFixed(0)}%`
    emit('detected', res)
  } catch (e) {
    error.value = '识别出错：' + (e?.message || e)
  } finally {
    detecting.value = false
  }
}

/* ---------------------------- 实时追踪循环 ---------------------------- */
function startLive() {
  if (live.value) return
  live.value = true
  lastTick = 0
  const tick = (ts) => {
    if (!live.value) return
    if (ts - lastTick > 250 && !detecting.value) {
      lastTick = ts
      runDetect({ liveMode: true })
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function stopLive() {
  live.value = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

function toggleLive() {
  if (live.value) {
    stopLive()
    status.value = '已暂停实时追踪'
    return
  }
  if (mode.value === 'video' && videoRef.value) videoRef.value.play().catch(() => {})
  startLive()
  status.value = '实时追踪中（约每 0.25s 一次）'
}

function takePhotoAndDetect() {
  const v = videoRef.value
  if (!v || v.readyState < 2) {
    error.value = '摄像头还没准备好，稍等一下再拍'
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = v.videoWidth
  canvas.height = v.videoHeight
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/png')
  stopLive()
  resetSmoothing()
  const img = imgRef.value
  photoTaken.value = true
  hasMedia.value = true
  img.onload = () => {
    status.value = '已拍照，识别中…'
    runDetect()
  }
  img.src = url
}

/* ------------------------------ 画框叠加 ------------------------------ */
function clearOverlay() {
  const c = canvasRef.value
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function drawOverlay(res) {
  const media = activeMediaEl()
  const c = canvasRef.value
  if (!media || !c || !res?.box) return

  const W = media.clientWidth
  const H = media.clientHeight
  if (!W || !H) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  c.style.position = 'absolute'
  c.style.left = media.offsetLeft + 'px'
  c.style.top = media.offsetTop + 'px'
  c.style.width = W + 'px'
  c.style.height = H + 'px'
  c.width = Math.round(W * dpr)
  c.height = Math.round(H * dpr)

  const ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const iw = media.videoWidth || media.naturalWidth || W
  const ih = media.videoHeight || media.naturalHeight || H
  const sx = W / iw
  const sy = H / ih
  const { x, y, width, height } = res.box
  const bx = x * sx
  const by = y * sy
  const bw = width * sx
  const bh = height * sy
  const color = EMOTIONS[res.dominant]?.color || '#2ecc71'

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.35)'
  ctx.shadowBlur = 8
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  roundRectPath(ctx, bx, by, bw, bh, 14)
  ctx.stroke()

  // 四角加粗，视觉上更聚焦
  ctx.shadowBlur = 0
  ctx.lineWidth = 4
  const corner = Math.min(bw, bh) * 0.22
  const corners = [
    [bx, by, 1, 1],
    [bx + bw, by, -1, 1],
    [bx, by + bh, 1, -1],
    [bx + bw, by + bh, -1, -1]
  ]
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(cx + dx * corner, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + dy * corner)
    ctx.stroke()
  }

  // 标签胶囊
  const label = `${EMOTIONS[res.dominant]?.label || ''} ${(res.confidence * 100).toFixed(0)}%`
  ctx.font = '600 13px system-ui, -apple-system, sans-serif'
  const tw = ctx.measureText(label).width
  const px = Math.min(Math.max(bx, 4), Math.max(W - tw - 20, 4))
  const py = Math.max(by - 30, 4)
  ctx.fillStyle = color
  roundRectPath(ctx, px, py, tw + 18, 22, 11)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(label, px + 9, py + 15)
  ctx.restore()
}

/* -------------------------------- 生命周期 -------------------------------- */
onMounted(() => {
  // 进入页面就在后台把模型拉下来，用户点「示例」时几乎无等待
  loadModels().catch(() => {})
  const key = new URLSearchParams(location.search).get('demo')
  if (!key) return
  const d = DEMOS.find((x) => x.key === key)
  if (d) setTimeout(() => useDemo(d), 300)
})

onBeforeUnmount(() => {
  stopCamera()
  clearObjectUrl()
})

// 切换回图片模式时把画布清掉
defineExpose({ runDetect })
</script>

<template>
  <section class="capture card">
    <div class="tabs" role="tablist" aria-label="人脸输入方式">
      <button role="tab" :aria-selected="mode === 'image'" :class="{ active: mode === 'image' }" @click="switchMode('image')">
        <span class="ico">🖼️</span>图片
      </button>
      <button role="tab" :aria-selected="mode === 'video'" :class="{ active: mode === 'video' }" @click="switchMode('video')">
        <span class="ico">🎞️</span>视频
      </button>
      <button role="tab" :aria-selected="mode === 'camera'" :class="{ active: mode === 'camera' }" @click="switchMode('camera')">
        <span class="ico">📷</span>摄像头
      </button>
      <button role="tab" :aria-selected="mode === 'photo'" :class="{ active: mode === 'photo' }" @click="switchMode('photo')">
        <span class="ico">📸</span>拍照
      </button>
    </div>

    <div class="media-wrap">
      <video ref="videoRef" playsinline muted v-show="showVideo"></video>
      <img ref="imgRef" alt="人脸输入画面" v-show="showImage" />
      <canvas ref="canvasRef" class="overlay"></canvas>
      <div v-if="!hasMedia" class="placeholder">
        <span>🖼️</span>
        <p>选择图片或开始拍摄</p>
      </div>
      <span v-if="live" class="live-dot" title="实时追踪中">LIVE</span>
    </div>

    <div class="controls">
      <template v-if="mode === 'image'">
        <label class="btn primary">
          📂 选择图片
          <input type="file" accept="image/*" hidden @change="onImageFile" />
        </label>
        <span class="tip">或直接用下面的示例人脸</span>
      </template>

      <template v-else-if="mode === 'video'">
        <label class="btn primary">
          📂 选择视频
          <input type="file" accept="video/*" hidden @change="onVideoFile" />
        </label>
        <button class="btn" :disabled="!videoRef?.src" @click="runDetect()">🔍 识别当前帧</button>
        <button class="btn" :class="{ on: live }" :disabled="!videoRef?.src" @click="toggleLive">
          {{ live ? '⏸ 停止追踪' : '🔁 实时追踪' }}
        </button>
      </template>

      <template v-else>
        <button v-if="!stream" class="btn primary" @click="startCamera">🔌 开启摄像头</button>
        <button v-else class="btn" @click="stopCamera">⏹ 关闭摄像头</button>
        <button class="btn" :disabled="!stream" @click="runDetect()">🔍 识别当前帧</button>
        <button class="btn" :class="{ on: live }" :disabled="!stream" @click="toggleLive">
          {{ live ? '⏸ 停止追踪' : '🔁 实时追踪' }}
        </button>
        <button v-if="mode === 'photo'" class="btn accent" :disabled="!stream" @click="takePhotoAndDetect">
          📸 拍照识别
        </button>
      </template>
    </div>

    <div v-if="mode === 'image'" class="demos">
      <button
        v-for="d in DEMOS"
        :key="d.key"
        class="demo-chip"
        :style="{ '--c': d.color }"
        :aria-label="`使用${d.label}示例人脸`"
        @click="useDemo(d)"
      >
        <img :src="d.src" :alt="d.label" loading="lazy" />
        <span>{{ d.emoji }} {{ d.label }}</span>
      </button>
    </div>

    <p class="status" :class="{ err: !!error }">
      <span v-if="detecting || loading">⏳ {{ loading ? '模型加载中…' : '识别中…' }}</span>
      <span v-else-if="error">⚠️ {{ error }}</span>
      <span v-else>💡 {{ status }}</span>
    </p>
    <p v-if="hint && !error" class="status hintline">🔎 {{ hint }}</p>
    <p v-if="loadError" class="status err">⚠️ {{ loadError }}</p>
  </section>
</template>

<style scoped>
.capture { min-width: 0; }

.tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.tabs button {
  flex: 1; min-width: 76px; padding: 9px 6px; border: 1px solid transparent; border-radius: 14px;
  background: #eef7f2; color: #3d6b55; font-weight: 600; font-size: 13px; cursor: pointer;
  transition: .18s; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
}
.tabs button:hover { background: #e2f3ea; }
.tabs button.active {
  background: linear-gradient(135deg, var(--accent, #2ecc71), var(--accent-deep, #1f8f5a));
  color: #fff; box-shadow: 0 6px 16px rgba(31, 143, 90, .25);
}
.ico { font-size: 14px; }

.media-wrap {
  position: relative; width: 100%; aspect-ratio: 4 / 3;
  background: radial-gradient(circle at 50% 40%, #16352a, #0d1f18 70%);
  border-radius: 18px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.media-wrap video,
.media-wrap img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.placeholder { color: #6f9a85; text-align: center; font-size: 13px; }
.placeholder span { font-size: 34px; opacity: .8; }
.overlay { position: absolute; pointer-events: none; }
.live-dot {
  position: absolute; top: 10px; left: 10px; font-size: 10px; font-weight: 700; letter-spacing: .08em;
  color: #fff; background: #ef4444; padding: 3px 8px; border-radius: 999px;
  animation: blink 1.6s infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

.controls { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; align-items: center; }
.btn {
  padding: 9px 15px; border: 1px solid var(--line, #e2efe8); border-radius: 13px; background: #fff;
  color: #234; font-weight: 600; font-size: 13px; cursor: pointer; transition: .16s;
}
.btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(20, 70, 45, .1); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn.primary { background: linear-gradient(135deg, var(--accent, #2ecc71), var(--accent-deep, #1f8f5a)); border-color: transparent; color: #fff; }
.btn.accent { background: #0ea5a5; border-color: transparent; color: #fff; }
.btn.on { background: #fff1f1; border-color: #f5b5b5; color: #c0392b; }
.tip { font-size: 12px; color: #8aa79a; }

.demos { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 14px; }
.demo-chip {
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 4px;
  border: 1px solid var(--line, #e2efe8); border-radius: 14px; background: #fff; cursor: pointer;
  transition: .16s;
}
.demo-chip:hover { border-color: var(--c); transform: translateY(-2px); box-shadow: 0 8px 18px rgba(20, 70, 45, .12); }
.demo-chip img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; }
.demo-chip span { font-size: 11px; font-weight: 600; color: var(--c); white-space: nowrap; }

.status { margin: 12px 0 0; font-size: 13px; color: #4a7a63; line-height: 1.5; }
.status.err { color: #d9534f; }
.hintline { margin-top: 4px; color: #b8860b; font-size: 12px; }

@media (max-width: 520px) {
  .demos { grid-template-columns: repeat(3, 1fr); }
}
</style>

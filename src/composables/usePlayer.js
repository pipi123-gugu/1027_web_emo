import { reactive, readonly } from 'vue'

/**
 * 全局播放器（单例）
 * ---------------------------------------------------------------
 * v1 的音频只是一个 `v-show=false` 的 <audio controls>，用户看不到进度、
 * 不能拖拽、不能切歌。这里把播放状态提到模块级单例：
 *   · 只创建一个 Audio 实例，切歌/暂停/上一首/下一首都在这里管；
 *   · 组件通过 readonly(state) 读取，通过导出的方法修改（单一数据源）；
 *   · 支持进度拖拽、音量、单曲循环、播放失败自动跳过。
 */

const state = reactive({
  list: [],
  index: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  loopOne: false,
  error: ''
})

let audio = null

function ensureAudio() {
  if (audio || typeof window === 'undefined') return audio
  audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = state.volume

  audio.addEventListener('timeupdate', () => {
    state.currentTime = audio.currentTime || 0
  })
  audio.addEventListener('durationchange', () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0
  })
  audio.addEventListener('play', () => { state.playing = true })
  audio.addEventListener('pause', () => { state.playing = false })
  audio.addEventListener('ended', () => {
    if (state.loopOne) {
      audio.currentTime = 0
      audio.play().catch(() => {})
    } else {
      next()
    }
  })
  audio.addEventListener('error', () => {
    const cur = currentSong()
    if (cur) cur.failed = true
    state.error = '这首歌暂时无法播放，已自动跳过'
    // 单曲失败时不要死循环，直接跳过
    setTimeout(() => { if (state.list.length > 1) next() }, 400)
  })
  return audio
}

function currentSong() {
  return state.list[state.index] || null
}

/** 载入播放列表并定位到某一首 */
export function playSong(song, list) {
  if (!song) return
  if (list && list.length) state.list = list
  const idx = state.list.findIndex((s) => s.id === song.id)
  const a = ensureAudio()
  if (!a) return

  if (idx === state.index) {
    toggle()
    return
  }
  state.index = idx >= 0 ? idx : 0
  state.error = ''
  state.currentTime = 0
  state.duration = 0
  a.src = song.src
  a.play().catch(() => {
    state.error = '浏览器拦截了自动播放，请再点一次播放'
  })
}

export function toggle() {
  const a = ensureAudio()
  if (!a || state.index < 0) return
  if (!a.src) {
    const s = currentSong()
    if (s) a.src = s.src
  }
  if (a.paused) a.play().catch(() => {})
  else a.pause()
}

export function next() {
  if (!state.list.length) return
  const nextIdx = (state.index + 1) % state.list.length
  const song = state.list[nextIdx]
  const a = ensureAudio()
  if (!a) return
  state.index = nextIdx
  state.currentTime = 0
  a.src = song.src
  a.play().catch(() => {})
}

export function prev() {
  if (!state.list.length) return
  // 播放超过 3 秒时，先回到本曲开头（符合主流播放器习惯）
  const a = ensureAudio()
  if (a && a.currentTime > 3) {
    a.currentTime = 0
    return
  }
  const prevIdx = (state.index - 1 + state.list.length) % state.list.length
  const song = state.list[prevIdx]
  if (!a) return
  state.index = prevIdx
  state.currentTime = 0
  a.src = song.src
  a.play().catch(() => {})
}

export function seek(seconds) {
  const a = ensureAudio()
  if (!a) return
  const t = Math.max(0, Math.min(seconds, state.duration || 0))
  if (Number.isFinite(t)) a.currentTime = t
}

export function setVolume(v) {
  const val = Math.max(0, Math.min(1, Number(v)))
  state.volume = val
  const a = ensureAudio()
  if (a) a.volume = val
}

export function toggleLoop() {
  state.loopOne = !state.loopOne
}

export function stop() {
  const a = ensureAudio()
  if (a) {
    a.pause()
    a.removeAttribute('src')
  }
  state.playing = false
  state.currentTime = 0
  state.duration = 0
}

export function current() {
  return currentSong()
}

export const player = readonly(state)

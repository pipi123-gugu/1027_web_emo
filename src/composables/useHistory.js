import { ref, watch } from 'vue'

/**
 * 本地持久化：情绪识别历史 + 歌曲收藏
 * ---------------------------------------------------------------
 * 都存 localStorage，刷新页面不丢，也不涉及任何账号/后端。
 * 历史只保留最近 8 条（含 6 类概率，便于回看时直接复原图表）。
 */

const HISTORY_KEY = 'emotion-music:history:v1'
const FAV_KEY = 'emotion-music:favorites:v1'
const MAX_HISTORY = 8

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式下可能不可写，忽略即可 */
  }
}

const history = ref(read(HISTORY_KEY, []))
const favorites = ref(read(FAV_KEY, []))

watch(history, (v) => write(HISTORY_KEY, v), { deep: true })
watch(favorites, (v) => write(FAV_KEY, v), { deep: true })

export function useHistory() {
  function pushHistory(result) {
    if (!result) return
    const item = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      at: Date.now(),
      dominant: result.dominant,
      confidence: +Number(result.confidence || 0).toFixed(3),
      scores: { ...result.scores }
    }
    // 与上一条完全相同的主导情绪且间隔 < 5s 时不重复记录（连续识别去重）
    const last = history.value[0]
    if (last && last.dominant === item.dominant && item.at - last.at < 5000) {
      last.at = item.at
      last.confidence = item.confidence
      last.scores = item.scores
      history.value = [...history.value]
      return
    }
    history.value = [item, ...history.value].slice(0, MAX_HISTORY)
  }

  function clearHistory() {
    history.value = []
  }

  function isFav(id) {
    return favorites.value.includes(id)
  }

  function toggleFav(id) {
    if (!id) return
    favorites.value = isFav(id)
      ? favorites.value.filter((x) => x !== id)
      : [id, ...favorites.value]
  }

  return { history, favorites, pushHistory, clearHistory, isFav, toggleFav }
}

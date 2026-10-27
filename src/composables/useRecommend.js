import { ref } from 'vue'
import { LOCAL_SONGS } from '../data/songs.js'
import { recommend, adviceOf } from '../utils/recommend.js'
import { ONLINE_KEYWORDS, EMOTIONS } from '../utils/emotionMap.js'

/**
 * 歌曲推荐：融合「本地曲库」与「在线 API」（v2）
 * ---------------------------------------------------------------
 * v1 只用一个关键词检索，结果窄、容易重复；且没有超时控制，网络卡住时
 * 界面会一直转圈。v2 的处理：
 *   · 每个情绪给 2 个检索词并行请求，合并去重后取前 N 首，广度更好；
 *   · 8s 超时 + AbortController，失败立即降级为纯本地曲库；
 *   · 同一次会话内按情绪做内存缓存，重复识别同一情绪不再打网络。
 */

const MAX_ONLINE = 10
const TIMEOUT = 8000

export function useRecommend() {
  const songs = ref([])
  const recommending = ref(false)
  const onlineError = ref('')
  const usedOnline = ref(false)
  const advice = ref('')
  const cache = new Map()

  async function fetchByKeyword(keyword, emotion, signal) {
    const url = `/api/music?keyword=${encodeURIComponent(keyword)}&limit=8&emotion=${emotion}`
    const r = await fetch(url, { signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const data = await r.json()
    if (!data?.ok || !Array.isArray(data.songs)) throw new Error('返回格式异常')
    return data.songs
  }

  async function loadOnline(dominant) {
    const keywords = ONLINE_KEYWORDS[dominant] || [dominant]
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT)
    try {
      const settled = await Promise.all(
        keywords.map((kw) =>
          fetchByKeyword(kw, dominant, controller.signal)
            .then((songs) => ({ ok: true, songs }))
            .catch((error) => ({ ok: false, error }))
        )
      )
      // 全部失败才向上抛：GitHub Pages 这类纯静态托管没有 /api，会拿到 404
      const success = settled.filter((x) => x.ok)
      if (!success.length) throw settled[0].error

      const groups = success.map((x) => x.songs)
      const seen = new Set()
      const seenTitle = new Set()
      const merged = []
      const titleKey = (s) =>
        String(s.title || '').replace(/[（(\[【].*?[)）\]】]/g, '').replace(/\s+/g, '').toLowerCase()
      // 交错合并：保证每组关键词都有机会进入前列，而不是被第一组刷满
      const maxLen = Math.max(0, ...groups.map((g) => g.length))
      for (let i = 0; i < maxLen; i++) {
        for (const g of groups) {
          const s = g[i]
          if (!s || seen.has(s.id)) continue
          // 同一首歌常被不同关键词搜到，按「ID + 歌名」双去重
          const tk = titleKey(s)
          if (seenTitle.has(tk)) continue
          seen.add(s.id)
          seenTitle.add(tk)
          merged.push(s)
          if (merged.length >= MAX_ONLINE) break
        }
        if (merged.length >= MAX_ONLINE) break
      }
      return merged
    } finally {
      clearTimeout(timer)
    }
  }

  async function recommendFor(emotionResult, { topN = 12, useOnline = true } = {}) {
    if (!emotionResult) {
      songs.value = []
      advice.value = ''
      return []
    }
    const { dominant, confidence } = emotionResult
    advice.value = adviceOf(dominant)
    recommending.value = true
    onlineError.value = ''
    usedOnline.value = false

    let onlineSongs = []
    if (useOnline) {
      if (cache.has(dominant)) {
        onlineSongs = cache.get(dominant)
        usedOnline.value = onlineSongs.length > 0
      } else {
        try {
          onlineSongs = await loadOnline(dominant)
          cache.set(dominant, onlineSongs)
          usedOnline.value = onlineSongs.length > 0
          if (!onlineSongs.length) onlineError.value = '在线歌曲暂无结果，已使用本地曲库。'
        } catch (e) {
          const aborted = e?.name === 'AbortError'
          const missingApi = /HTTP 40[45]/.test(String(e?.message || ''))
          onlineError.value = aborted
            ? '在线歌曲请求超时（8s），已回退本地曲库。'
            : missingApi
              ? '当前是静态托管（如 GitHub Pages），没有在线歌曲接口，已使用完整可离线播放的本地曲库。'
              : '在线歌曲接口异常，已回退本地曲库。'
        }
      }
    }

    songs.value = recommend(dominant, confidence, LOCAL_SONGS, onlineSongs, topN)
    recommending.value = false
    return songs.value
  }

  return { songs, recommending, onlineError, usedOnline, advice, recommendFor, EMOTIONS }
}

/**
 * 歌曲推荐算法（v2）
 * ---------------------------------------------------------------
 * v1 只用「情绪相似度矩阵 × 置信度」，问题是：
 *   a) 同一种情绪的本地曲目会整段霸占列表，听完很单调；
 *   b) 在线歌曲被强制标成 match=1，导致在线结果永远排在本地之前；
 *   c) 只有分数，没有「为什么推荐这首」的解释。
 *
 * v2 的三处升级：
 *   1) 双通道打分   base = 0.7 × 情绪相似度 + 0.3 × 效价/唤醒度距离
 *                  score = base × (0.75 + 0.25 × 置信度)
 *      —— 除了「类别相近」，还要求「氛围真的接近」，排序更贴近体感。
 *   2) MMR 多样性重排（Maximal Marginal Relevance）
 *      在「高分」和「别老是同一个情绪」之间取平衡，避免 12 首全是同一种。
 *   3) 每首歌附一条推荐理由，界面上可读，也方便讲清算法。
 */

import { EMOTIONS, EMOTION_KEYS } from './emotionMap.js'

// 情绪相似度矩阵（音乐情感邻接关系，0~1）
export const SIMILARITY = {
  joy:      { joy: 1.0, surprise: 0.6, calm: 0.4, sad: 0.15, anger: 0.1, fear: 0.1 },
  sad:      { sad: 1.0, fear: 0.7, calm: 0.4, surprise: 0.2, joy: 0.15, anger: 0.1 },
  anger:    { anger: 1.0, surprise: 0.5, joy: 0.3, calm: 0.15, fear: 0.2, sad: 0.15 },
  surprise: { surprise: 1.0, joy: 0.6, anger: 0.5, calm: 0.3, fear: 0.25, sad: 0.2 },
  fear:     { fear: 1.0, sad: 0.7, calm: 0.45, surprise: 0.25, anger: 0.2, joy: 0.1 },
  calm:     { calm: 1.0, sad: 0.5, fear: 0.45, joy: 0.4, surprise: 0.3, anger: 0.15 }
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0))

/** 歌曲的情绪坐标：优先用歌曲自带的 valence/energy，其次退回情绪中心点 */
function vaOf(song) {
  const emo = EMOTIONS[song.emotion] || EMOTIONS.calm
  return {
    valence: typeof song.valence === 'number' ? song.valence : emo.valence,
    arousal: typeof song.energy === 'number' ? song.energy : emo.arousal
  }
}

/** 效价/唤醒度相似度：归一化欧氏距离（二维最大距离 √2 ≈ 1.414） */
function vaSimilarity(target, song) {
  const p = vaOf(song)
  const d = Math.hypot(p.valence - target.valence, p.arousal - target.arousal)
  return clamp01(1 - d / 1.414)
}

/** 标题/歌手归一化，用于跨来源去重（在线搜索结果常与本地曲库重复） */
function dedupeKey(song) {
  const t = String(song.title || '').replace(/[（(\[【].*?[)）\]】]/g, '').replace(/\s+/g, '').toLowerCase()
  const a = String(song.artist || '').replace(/\s+/g, '').toLowerCase()
  return `${t}|${a}`
}

function reasonOf(s, emotion) {
  if (s.emotion === emotion && s.source === 'online') return '同频新歌'
  if (s.match >= 0.99) return '情绪高度吻合'
  if (s.match >= 0.55) return '情绪相近，衔接自然'
  if (s.va >= 0.85) return '氛围接近'
  if (s.match >= 0.3) return '轻微反差，换换心情'
  return '提神醒脑'
}

/**
 * 核心推荐函数
 * @param {string} emotion 主导情绪 key
 * @param {number} confidence 置信度 0~1
 * @param {Array} localSongs 本地曲库
 * @param {Array} onlineSongs 在线歌曲（已带 emotion 标签）
 * @param {number} topN 返回数量
 * @param {{diversity?:number}} opts diversity=MMR 的 λ，越大越重分数
 */
export function recommend(emotion, confidence, localSongs = [], onlineSongs = [], topN = 12, opts = {}) {
  const e = SIMILARITY[emotion] ? emotion : 'calm'
  const target = EMOTIONS[e]
  const c = clamp01(confidence)
  const confWeight = 0.75 + 0.25 * c
  const lambda = typeof opts.diversity === 'number' ? opts.diversity : 0.78

  const seen = new Set()
  const pool = []

  const push = (song, source) => {
    const key = dedupeKey(song)
    if (seen.has(key)) return
    seen.add(key)
    const songEmotion = EMOTIONS[song.emotion] ? song.emotion : e
    // 在线歌曲只是「按情绪关键词搜到的」，并没有真正分析音频情绪，
    // 因此匹配度封顶 0.92：既排在前面，又不会把本地精准匹配的曲目挤掉。
    const match = songEmotion === e
      ? (source === 'online' ? 0.92 : 1)
      : (SIMILARITY[e][songEmotion] ?? 0)
    const va = vaSimilarity(target, song)
    const base = 0.7 * match + 0.3 * va
    pool.push({
      ...song,
      source,
      emotion: songEmotion,
      match: +match.toFixed(3),
      va: +va.toFixed(3),
      score: +(base * confWeight).toFixed(4)
    })
  }

  for (const s of localSongs) push(s, 'local')
  for (const s of onlineSongs) push(s, 'online')

  // 兜底：一条都没匹配到时用平静歌单顶上，保证页面不空
  if (!pool.length) {
    return localSongs
      .filter((s) => s.emotion === 'calm')
      .slice(0, topN)
      .map((s) => ({ ...s, source: 'local', match: 1, va: 1, score: 1, reason: '默认舒缓歌单' }))
  }

  // MMR 重排：每轮选「分数高且与已选歌曲情绪差异大」的那一首
  const picked = []
  const rest = pool.slice()
  while (picked.length < Math.min(topN, pool.length) && rest.length) {
    let bestIdx = 0
    let bestVal = -Infinity
    for (let i = 0; i < rest.length; i++) {
      const cand = rest[i]
      let maxSim = 0
      for (const p of picked) {
        maxSim = Math.max(maxSim, SIMILARITY[p.emotion]?.[cand.emotion] ?? 0)
      }
      const value = lambda * cand.score + (1 - lambda) * (1 - maxSim)
      if (value > bestVal) {
        bestVal = value
        bestIdx = i
      }
    }
    picked.push(rest.splice(bestIdx, 1)[0])
  }

  return picked.map((s) => ({ ...s, reason: reasonOf(s, e) }))
}

/** 供界面展示：给当前情绪挑一句「情绪建议」 */
export function adviceOf(emotion) {
  return EMOTIONS[emotion]?.advice || EMOTIONS.calm.advice
}

export { EMOTION_KEYS }

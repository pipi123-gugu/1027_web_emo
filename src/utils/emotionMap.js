/**
 * 情绪映射与元数据
 * ---------------------------------------------------------------
 * 本地情绪识别使用 face-api.js 的 FaceExpressionNet，输出 7 类概率：
 *   neutral(平静) happy(开心) sad(难过) angry(愤怒)
 *   fearful(恐惧) disgusted(厌恶) surprised(惊讶)
 *
 * 为便于「按情绪推荐歌曲」，我们把这 7 类归并到 6 个标准情绪（canonical）：
 *   joy 开心 / sad 难过 / anger 愤怒 / surprise 惊讶 / fear 恐惧 / calm 平静
 *
 * 归并规则（face-api 原始类 -> 标准情绪）：
 *   happy -> joy      sad -> sad        angry -> anger
 *   surprised -> surprise   fearful -> fear
 *   disgusted -> anger      （厌恶与愤怒在音乐取向上接近，归为愤怒）
 *   neutral -> calm
 *
 * 每种标准情绪额外带一组「心理学坐标」：
 *   valence 效价（0=极度消极，1=极度积极）
 *   arousal 唤醒度（0=极度松弛，1=极度亢奋）
 * 有了这组坐标，推荐算法就能做人脸情绪与歌曲之间的「二维距离」计算，
 * 前端也能画出 Russell 环形情感模型（circumplex）图。
 */

// 1) face-api 7 类 -> 标准情绪 key
export const FACEAPI_TO_CANON = {
  happy: 'joy',
  sad: 'sad',
  angry: 'anger',
  surprised: 'surprise',
  fearful: 'fear',
  disgusted: 'anger',
  neutral: 'calm'
}

// 2) 标准情绪的展示元数据
//    keywords = 在线检索词（多个关键词并行搜索，避免单一关键词结果过窄）
export const EMOTIONS = {
  joy: {
    key: 'joy',
    label: '开心',
    emoji: '😊',
    color: '#2ecc71',
    deep: '#1f8f5a',
    desc: '欢快、明亮、节奏感强',
    advice: '此刻适合让节奏再快一点：明亮的大调流行、Disco、Funk 都能把好心情延续下去。',
    valence: 0.84,
    arousal: 0.72,
    keywords: ['快乐 华语 流行', '轻快 阳光 英文歌']
  },
  sad: {
    key: 'sad',
    label: '难过',
    emoji: '😢',
    color: '#3b82f6',
    deep: '#1d4ed8',
    desc: '舒缓、低沉、抒情',
    advice: '先别急着振作，慢速抒情与钢琴独奏是很好的情绪出口，把低落听完再往前走。',
    valence: 0.24,
    arousal: 0.28,
    keywords: ['伤感 华语 情歌', '钢琴 抒情 纯音乐']
  },
  anger: {
    key: 'anger',
    label: '愤怒',
    emoji: '😠',
    color: '#ef4444',
    deep: '#b91c1c',
    desc: '强烈、爆发、摇滚/电子',
    advice: '愤怒需要出口而不是压抑：高能量摇滚、说唱与电子会把张力安全地释放掉。',
    valence: 0.22,
    arousal: 0.88,
    keywords: ['摇滚 燃 电音', '说唱 硬核 燃']
  },
  surprise: {
    key: 'surprise',
    label: '惊讶',
    emoji: '😲',
    color: '#f59e0b',
    deep: '#b45309',
    desc: '新奇、跳跃、律动',
    advice: '惊讶是低持续、高唤醒的情绪，适合用节奏跳跃、编制新奇的曲子接住这份新鲜感。',
    valence: 0.58,
    arousal: 0.86,
    keywords: ['电子 律动 新奇', '节奏感 强 神曲']
  },
  fear: {
    key: 'fear',
    label: '恐惧',
    emoji: '😨',
    color: '#8b5cf6',
    deep: '#6d28d9',
    desc: '悬疑、空灵、氛围',
    advice: '恐惧往往伴着不确定感，空灵氛围与低频铺底的音乐能提供包裹感，也更容易放松下来。',
    valence: 0.18,
    arousal: 0.66,
    keywords: ['空灵 悬疑 氛围', '暗黑 氛围 纯音乐']
  },
  calm: {
    key: 'calm',
    label: '平静',
    emoji: '😌',
    color: '#14b8a6',
    deep: '#0f766e',
    desc: '松弛、Lo-Fi、轻音乐',
    advice: '平静是很好的学习/工作状态，Lo-Fi、环境音与轻钢琴能帮你把这份专注维持得更久。',
    valence: 0.62,
    arousal: 0.18,
    keywords: ['轻音乐 放松 Lo-Fi', '安静 治愈 钢琴']
  }
}

export const EMOTION_KEYS = Object.keys(EMOTIONS)

// 3) 在线歌曲搜索关键词（数组：每个情绪给 2 组，并行检索后合并去重）
export const ONLINE_KEYWORDS = Object.fromEntries(
  EMOTION_KEYS.map((k) => [k, EMOTIONS[k].keywords])
)

// 兼容旧调用
export const ONLINE_KEYWORD = Object.fromEntries(
  EMOTION_KEYS.map((k) => [k, EMOTIONS[k].keywords[0]])
)

/**
 * 把 face-api 的 7 类概率融合成标准情绪的得分向量。
 * @param {{neutral:number,happy:number,sad:number,angry:number,fearful:number,disgusted:number,surprised:number}} expr
 * @returns {{scores:Object, dominant:string, confidence:number}}
 */
export function fuseExpressions(expr) {
  const scores = {}
  for (const k of EMOTION_KEYS) scores[k] = 0
  // 逐类累加（同一标准情绪可能来自多个 face-api 类，如 anger 来自 angry+disgusted）
  for (const [faceKey, prob] of Object.entries(expr || {})) {
    const canon = FACEAPI_TO_CANON[faceKey]
    if (canon) scores[canon] += Number(prob) || 0
  }
  return pickDominant(scores)
}

/** 从得分向量里取最大值作为主导情绪，其值即置信度 */
export function pickDominant(scores) {
  let dominant = 'calm'
  let confidence = 0
  for (const [k, v] of Object.entries(scores || {})) {
    if (v > confidence) {
      confidence = v
      dominant = k
    }
  }
  return { scores, dominant, confidence }
}

/**
 * 由得分向量算出「连续」的效价 / 唤醒度坐标（各情绪坐标按概率加权平均）。
 * 这样即使主导情绪在 joy/calm 之间摇摆，二维图上的点也会平滑移动。
 */
export function mixVA(scores) {
  let sum = 0
  let v = 0
  let a = 0
  for (const k of EMOTION_KEYS) {
    const p = Number(scores?.[k]) || 0
    if (!p) continue
    sum += p
    v += p * EMOTIONS[k].valence
    a += p * EMOTIONS[k].arousal
  }
  if (!sum) return { valence: 0.5, arousal: 0.5 }
  return { valence: v / sum, arousal: a / sum }
}

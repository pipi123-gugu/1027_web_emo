import { ref } from 'vue'
import * as faceapi from 'face-api.js'
import { fuseExpressions, EMOTION_KEYS } from '../utils/emotionMap.js'

/**
 * 本地人脸情绪识别（v2）
 * ---------------------------------------------------------------
 * 使用 face-api.js（基于 TensorFlow.js）在浏览器端完成：
 *   1) TinyFaceDetector 定位人脸
 *   2) FaceExpressionNet 输出 7 类表情概率
 * 全程本地推理，不调用任何云端情绪 API。
 *
 * v2 相比 v1 的三处增强：
 *   · 时序平滑（EMA）：单帧结果抖得厉害，用指数滑动平均把「上一帧」和
 *     「这一帧」按 alpha 混合，摄像头连续识别时标签不再乱跳。
 *   · 质量门控：人脸太小 / 检测分太低时给出「靠近一点 / 光线不足」的提示，
 *     而不是硬给一个不靠谱的结论。
 *   · 多尺度重试沿用 v1 的 416/320/224 三档，兼顾大图清晰度与暗脸召回。
 */

// BASE_URL 由构建配置决定：根路径部署是 '/'，GitHub Pages 子路径部署是 './'
const MODELS_URL = import.meta.env.BASE_URL + 'models'
const ATTEMPTS = [
  { inputSize: 416, scoreThreshold: 0.3 },
  { inputSize: 320, scoreThreshold: 0.25 },
  { inputSize: 224, scoreThreshold: 0.2 }
]

// 模块级状态：模型只加载一次，平滑窗口跨组件保留
let modelsLoaded = false
let loadingPromise = null
let smoothed = null

/** 切换图片/视频源时清掉平滑历史，避免上一次的人脸影响这一张 */
export function resetSmoothing() {
  smoothed = null
}

export function useEmotion() {
  const loading = ref(false)
  const loadError = ref('')
  const ready = ref(modelsLoaded)

  async function loadModels() {
    if (modelsLoaded) {
      ready.value = true
      return true
    }
    if (loadingPromise) return loadingPromise
    loading.value = true
    loadError.value = ''
    loadingPromise = (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODELS_URL)
        ])
        modelsLoaded = true
        ready.value = true
        return true
      } catch (e) {
        loadError.value = '模型加载失败：' + (e?.message || e)
        return false
      } finally {
        loading.value = false
        loadingPromise = null
      }
    })()
    return loadingPromise
  }

  /**
   * 对输入媒体做情绪识别
   * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} input
   * @param {{alpha?:number}} opts alpha：平滑系数，1=不平滑，0.35~0.5 适合连续帧
   * @returns {Promise<null|{scores:Object,dominant:string,confidence:number,box:Object,hint:string,quality:number}>}
   */
  async function detect(input, { alpha = 1 } = {}) {
    if (!modelsLoaded) {
      const ok = await loadModels()
      if (!ok) throw new Error(loadError.value || '模型加载失败')
    }

    let detection = null
    for (const opt of ATTEMPTS) {
      detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions(opt))
        .withFaceExpressions()
      if (detection) break
    }
    if (!detection) {
      smoothed = null
      return null
    }

    const raw = fuseExpressions(detection.expressions)

    // —— 时序平滑 ——
    if (!smoothed || alpha >= 1) {
      smoothed = { ...raw.scores }
    } else {
      const next = {}
      let sum = 0
      for (const k of EMOTION_KEYS) {
        const prev = smoothed[k] || 0
        const cur = raw.scores[k] || 0
        next[k] = prev * (1 - alpha) + cur * alpha
        sum += next[k]
      }
      // 归一化，保证 6 类概率和仍为 1
      if (sum > 0) for (const k of EMOTION_KEYS) next[k] /= sum
      smoothed = next
    }
    const fused = fuseExpressionsFromScores(smoothed)

    const box = detection.detection?.box || null
    const iw = input.videoWidth || input.naturalWidth || input.width || 0
    const ih = input.videoHeight || input.naturalHeight || input.height || 0
    const ratio = box && iw && ih ? (box.width * box.height) / (iw * ih) : 0

    let hint = ''
    if (ratio && ratio < 0.02) hint = '人脸偏小，靠近一点识别更准'
    else if (detection.detection?.score < 0.4) hint = '光线偏暗或角度不理想，可换个方向'

    return {
      scores: smoothed,
      dominant: fused.dominant,
      confidence: fused.confidence,
      box,
      hint,
      quality: +Number(detection.detection?.score || 0).toFixed(2),
      faceRatio: +ratio.toFixed(3)
    }
  }

  return { loading, loadError, ready, loadModels, detect }
}

/** 本地小工具：从得分向量直接取最大值（避免和 fuseExpressions 的原始类混淆） */
function fuseExpressionsFromScores(scores) {
  let dominant = 'calm'
  let confidence = 0
  for (const [k, v] of Object.entries(scores || {})) {
    if (v > confidence) {
      confidence = v
      dominant = k
    }
  }
  return { dominant, confidence }
}

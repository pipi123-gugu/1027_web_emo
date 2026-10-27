/**
 * 网易云音乐代理（开发 / 生产共用）
 * ---------------------------------------------------------------
 * v1 的代理逻辑在 vite.config.js 和 server.js 里各写了一份，改一处就得同步另一处。
 * v2 抽成这个模块，两边都 import 同一套实现，行为完全一致：
 *
 *   GET /api/music?keyword=&limit=&emotion=  搜索歌曲（带专辑封面）
 *   GET /api/play?id=                        音频流（透传 Range，支持拖动进度）
 *   GET /api/img?u=                          专辑封面代理（仅放行网易云域名）
 *
 * 另加了两点工程改进：
 *   · 内存 TTL 缓存：同一情绪/关键词 5 分钟内不重复打上游，翻页/重试更快；
 *   · 上游超时 + 一次重试：网易云偶发 403/502，重试能救回大部分请求。
 */

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
export const REF = 'https://music.163.com/'
const IMG_HOSTS = ['music.126.net', '126.net', 'music.163.com']

const MUSIC_TTL = 5 * 60 * 1000
const MAX_CACHE = 300
const musicCache = new Map()
const coverCache = new Map()

export function isAllowedImg(u) {
  try {
    const h = new URL(u).hostname
    return IMG_HOSTS.some((d) => h === d || h.endsWith('.' + d))
  } catch {
    return false
  }
}

function cacheGet(map, key) {
  const hit = map.get(key)
  if (!hit) return null
  if (Date.now() > hit.exp) {
    map.delete(key)
    return null
  }
  return hit.data
}

function cacheSet(map, key, data, ttl) {
  if (map.size > MAX_CACHE) map.clear()
  map.set(key, { exp: Date.now() + ttl, data })
}

/** 带超时 + 一次重试的 JSON 请求 */
async function fetchJson(url, options = {}, retries = 1) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) })
      if (!r.ok) throw new Error('upstream HTTP ' + r.status)
      return await r.json()
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

/**
 * 批量取专辑封面
 * 搜索接口只返回 album.picId，真正的封面 URL 在 v3/song/detail 的 al.picUrl。
 * 单曲封面按 id 永久缓存（同一首歌的封面不会变）。
 */
async function fetchCovers(ids) {
  const map = {}
  const missing = []
  for (const id of ids) {
    const cached = coverCache.get(String(id))
    if (cached) map[id] = cached
    else missing.push(id)
  }
  if (!missing.length) return map

  try {
    const c = JSON.stringify(missing.map((id) => ({ id })))
    const d = await fetchJson(`https://music.163.com/api/v3/song/detail?c=${encodeURIComponent(c)}`, {
      headers: { 'User-Agent': UA, Referer: REF }
    })
    for (const s of d?.songs || []) {
      const pic = s?.al?.picUrl
      if (pic) {
        map[s.id] = pic
        coverCache.set(String(s.id), pic)
      }
    }
  } catch {
    /* 封面失败不影响主流程 */
  }
  return map
}

/** 搜索歌曲 */
export async function searchMusic({ keyword = '', limit = 10, emotion = '' } = {}) {
  const kw = String(keyword).slice(0, 60)
  const lim = Math.max(1, Math.min(Number(limit) || 10, 20))
  const key = `${kw}|${lim}|${emotion}`

  const cached = cacheGet(musicCache, key)
  if (cached) return { ...cached, cached: true }

  const body = new URLSearchParams({
    s: kw,
    type: '1',
    limit: String(lim),
    offset: '0'
  }).toString()

  const data = await fetchJson('https://music.163.com/api/search/get/web', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: REF,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  const raw = data?.result?.songs || []

  // 结果清洗：网易云搜索会混入播客、合集、超长音频，
  // 按「时长 60s~10min + 标题不过长 + 标题去重」过滤，避免推荐里出现奇怪条目。
  const seenTitle = new Set()
  const clean = []
  for (const s of raw) {
    const ms = Number(s.duration) || 0
    const name = String(s.name || '').trim()
    if (!name || name.length > 40) continue
    if (ms < 60_000 || ms > 600_000) continue
    const key = name.replace(/[（(\[【].*?[)）\]】]/g, '').replace(/\s+/g, '').toLowerCase()
    if (seenTitle.has(key)) continue
    seenTitle.add(key)
    clean.push(s)
  }

  const covers = await fetchCovers(clean.map((s) => s.id))

  const songs = clean.map((s) => {
    const pic = covers[s.id] || s.album?.picUrl || ''
    return {
      id: 'netease-' + s.id,
      neteaseId: s.id,
      title: s.name,
      artist: (s.artists || []).map((a) => a.name).join(' / ') || '未知歌手',
      album: s.album?.name || '',
      duration: Math.round((s.duration || 0) / 1000),
      emotion,
      source: 'online',
      cover: pic ? pic + (pic.includes('?') ? '&' : '?') + 'param=200y200' : '',
      src: `/api/play?id=${s.id}`
    }
  })

  const out = { ok: true, keyword: kw, count: songs.length, songs }
  cacheSet(musicCache, key, out, MUSIC_TTL)
  return out
}

/** 音频流：透传 Range，让 <audio> 可以任意拖动进度 */
export async function fetchAudio(id, range) {
  if (!id || !/^\d+$/.test(String(id))) return { status: 400, text: 'invalid id' }
  const headers = { 'User-Agent': UA, Referer: REF }
  if (range) headers.Range = range

  const upstream = await fetch(
    `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(id)}.mp3`,
    { headers, redirect: 'follow' }
  )
  if (!upstream.ok || !upstream.body) {
    return { status: 502, text: 'upstream error' }
  }
  return {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Content-Length': upstream.headers.get('content-length') || '',
      'Content-Range': upstream.headers.get('content-range') || '',
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
      'Cache-Control': 'public, max-age=3600'
    },
    body: upstream.body
  }
}

/** 封面图代理 */
export async function fetchImage(u) {
  if (!isAllowedImg(u)) return { status: 403, text: 'forbidden host' }
  const upstream = await fetch(u, {
    headers: { 'User-Agent': UA, Referer: REF },
    signal: AbortSignal.timeout(15000)
  })
  if (!upstream.ok || !upstream.body) return { status: 502, text: 'upstream error' }
  return {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
      'Content-Length': upstream.headers.get('content-length') || '',
      'Cache-Control': 'public, max-age=86400'
    },
    body: upstream.body
  }
}

/** 把结果写进 Node 原生 res（dev 中间件与生产服务器共用） */
export async function sendTo(res, result) {
  res.statusCode = result.status
  for (const [k, v] of Object.entries(result.headers || {})) {
    if (v) res.setHeader(k, v)
  }
  if (result.json !== undefined) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(result.json))
    return
  }
  if (result.body) {
    const { Readable } = await import('node:stream')
    Readable.fromWeb(result.body).pipe(res)
    return
  }
  res.end(result.text || '')
}

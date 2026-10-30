/**
 * 在线曲库的「无服务器兜底」通道
 * ---------------------------------------------------------------
 * 为什么需要这个文件？
 *   GitHub Pages / OSS / Vercel 静态托管只发文件、不跑 Node 进程，
 *   所以项目里的 /api/music 代理在这些地方根本不存在：前端 fetch('/api/music')
 *   实际打到 https://<用户>.github.io/api/music，返回的是 404 的 HTML。
 *
 * 而网易云的搜索接口不允许浏览器跨域直连（没有 CORS 头、还要校验 Referer），
 * 所以「完全不用服务器」是拿不到搜索结果的。
 *
 * 这里的折中方案：
 *   1) 搜索：走 api.vkeys.cn（第三方公开代理，响应带 CORS 头，返回网易云元数据）
 *   2) 播放：用网易云官方的 outer url（https://music.163.com/song/media/outer/url?id=x.mp3），
 *      它是一个 302 到 CDN 的直链，<audio> 标签不需要 CORS，因此可以跨域播放
 *
 * 已知限制（也是为什么它只是「兜底」而不是主通道）：
 *   · 依赖第三方服务，随时可能限流或下线；
 *   · 接口不给时长，列表里显示 --:--；
 *   · VIP / 下架歌曲的 outer url 会返回 404，表现为「这首歌暂时无法播放」自动跳过。
 *
 * 想彻底摆脱第三方依赖，就把 server/api.js 那套代理部署到免费 Serverless
 * （Cloudflare Workers 最合适），再用 VITE_API_BASE 指向它，详见 README。
 */

// 关掉这个开关，静态托管就会退回「只有本地曲库」的老行为
export const PUBLIC_FALLBACK = true

const PUBLIC_SEARCH = 'https://api.vkeys.cn/v2/music/netease'
const OUTER_URL = (id) => `https://music.163.com/song/media/outer/url?id=${id}.mp3`

/** 网易云封面给的是 http://p3.music.126.net/...，https 页面里会被当混合内容拦掉，统一升级 */
function httpsify(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (u.startsWith('//')) return 'https:' + u
  return u.replace(/^http:\/\//i, 'https://')
}

/**
 * 直连公共接口搜索
 * @param {string} keyword 检索词
 * @param {string} emotion 标准情绪 key（原样带上，推荐算法要用）
 * @param {AbortSignal} signal 超时中断
 * @param {number} limit 条数
 * @returns {Promise<Array>} 与 server/api.js 一致结构的歌曲数组
 */
export async function searchPublic(keyword, emotion, signal, limit = 8) {
  const url = `${PUBLIC_SEARCH}?word=${encodeURIComponent(keyword)}&num=${limit}`
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error('公共接口 HTTP ' + r.status)
  const data = await r.json()
  const list = Array.isArray(data?.data) ? data.data : []
  if (!list.length) throw new Error('公共接口无结果')

  const songs = []
  for (const s of list) {
    const name = String(s.song || '').trim()
    if (!name || name.length > 40) continue
    const id = Number(s.id)
    if (!id) continue
    songs.push({
      id: 'netease-' + id,
      neteaseId: id,
      title: name,
      artist: String(s.singer || '未知歌手').trim(),
      album: String(s.album || '').trim(),
      duration: 0, // 公共接口不返回时长，列表显示 --:--
      emotion,
      source: 'online',
      cover: httpsify(s.cover),
      src: OUTER_URL(id)
    })
  }
  return songs
}

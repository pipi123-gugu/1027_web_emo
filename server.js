/**
 * 生产环境服务器
 * ---------------------------------------------------------------
 * 职责：托管 dist/ 静态站点 + 同源在线歌曲代理（/api/music、/api/play、/api/img）。
 * 用法：npm run build → node server.js → 打开 http://localhost:3000
 * 也可部署到任意能跑 Node 的主机（设置 PORT / HOST 环境变量）。
 *
 * v2 改进：
 *   · 代理逻辑与 vite 开发服务器共用 server/api.js，不再两份代码；
 *   · 文本类资源自动 gzip（bundle 724KB → 约 200KB），首屏明显更快；
 *   · 带 hash 的 /assets/* 走 immutable 长缓存，index.html 走 no-cache，
 *     避免用户刷新后仍拿到旧版本；
 *   · 路径越界返回 403，未知 API 返回 JSON 404，不再一律回退 index.html。
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { extname, join, normalize, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchMusic, fetchAudio, fetchImage, sendTo } from './server/api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 兼容两种目录约定：本地开发用 dist/，线上部署包用 site/
const DIST = existsSync(join(__dirname, 'dist')) ? join(__dirname, 'dist') : join(__dirname, 'site')
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream'
}

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map'])

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/') rel = '/index.html'
  let file = normalize(join(DIST, rel))
  // 防目录穿越
  if (!file.startsWith(DIST + sep) && file !== join(DIST, 'index.html')) {
    res.statusCode = 403
    return res.end('forbidden')
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')

  const ext = extname(file).toLowerCase()
  const stat = statSync(file)

  // ETag：用「体积 + 修改时间（秒）」拼一个弱校验值。
  // 有了它，no-cache 的静态资源只是多一次 304 空响应，几乎不耗流量。
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs / 1000).toString(16)}"`
  const inm = req.headers['if-none-match']
  res.setHeader('ETag', etag)

  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (rel.startsWith('/assets/')) {
    // 文件名里带内容 hash，内容一变文件名就变，可以放心长缓存
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache')
  } else {
    // 示例图 / 模型 / 音频这类文件名固定不变的资源：
    // 之前给的是 max-age=86400，换图后用户的浏览器会拿着旧图缓存 24 小时不回来问，
    // 表现为「服务端已更新但页面没变」。改成 no-cache（每次带 ETag 校验），
    // 内容没变是 304，内容变了立刻拿到新文件。
    res.setHeader('Cache-Control', 'no-cache')
  }

  // 协商缓存命中：直接 304，不传 body
  if (inm && inm === etag) {
    res.statusCode = 304
    return res.end()
  }

  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
  if (acceptsGzip && COMPRESSIBLE.has(ext) && stat.size > 1024) {
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Vary', 'Accept-Encoding')
    createReadStream(file).pipe(createGzip({ level: 6 })).pipe(res)
    return
  }

  res.setHeader('Content-Length', stat.size)
  createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const { pathname } = url

  try {
    if (pathname === '/healthz') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      return res.end('ok')
    }

    if (pathname === '/api/music') {
      const data = await searchMusic({
        keyword: url.searchParams.get('keyword') || '',
        limit: url.searchParams.get('limit') || 10,
        emotion: url.searchParams.get('emotion') || ''
      })
      return sendTo(res, { status: 200, json: data })
    }

    if (pathname === '/api/play') {
      const out = await fetchAudio(url.searchParams.get('id'), req.headers.range)
      return sendTo(res, out)
    }

    if (pathname === '/api/img') {
      const out = await fetchImage(url.searchParams.get('u') || '')
      return sendTo(res, out)
    }

    if (pathname.startsWith('/api/')) {
      return sendTo(res, { status: 404, json: { ok: false, error: 'unknown api' } })
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      return res.end('method not allowed')
    }

    serveStatic(req, res, url)
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`\n  情绪音乐已启动：http://localhost:${PORT}\n  静态目录：${DIST}\n`)
})

// 容器环境里优雅退出，避免端口占用
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)))
}

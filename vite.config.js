import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { searchMusic, fetchAudio, fetchImage, sendTo } from './server/api.js'

/**
 * 开发服务器的在线歌曲代理
 * ---------------------------------------------------------------
 * 逻辑全部来自 server/api.js（生产 server.js 用的是同一份实现），
 * 这里只做「把 Node 原生 req/res 接到共用处理器」的胶水。
 *
 *   /api/music?keyword=&limit=&emotion=
 *   /api/play?id=
 *   /api/img?u=
 */

function neteaseProxyPlugin() {
  return {
    name: 'netease-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        try {
          if (url.pathname === '/api/music') {
            const data = await searchMusic({
              keyword: url.searchParams.get('keyword') || '',
              limit: url.searchParams.get('limit') || 10,
              emotion: url.searchParams.get('emotion') || ''
            })
            return sendTo(res, { status: 200, json: data })
          }
          if (url.pathname === '/api/play') {
            const out = await fetchAudio(url.searchParams.get('id'), req.headers.range)
            return sendTo(res, out)
          }
          if (url.pathname === '/api/img') {
            const out = await fetchImage(url.searchParams.get('u') || '')
            return sendTo(res, out)
          }
          return sendTo(res, { status: 404, json: { ok: false, error: 'unknown api' } })
        } catch (e) {
          return sendTo(res, {
            status: 500,
            json: { ok: false, error: String(e?.message || e) }
          })
        }
      })
    }
  }
}

export default defineConfig({
  // GitHub Pages 是子路径站点（https://<user>.github.io/<repo>/），
  // 构建时用 VITE_BASE=./ 生成相对路径，本地与 workbuddy 部署仍用根路径。
  base: process.env.VITE_BASE || '/',
  plugins: [vue(), neteaseProxyPlugin()],
  server: { host: true, port: 5173 },
  build: {
    // 模型权重和歌曲都在 public/ 原样拷贝，提醒压缩工具不要处理
    assetsInlineLimit: 4096
  }
})

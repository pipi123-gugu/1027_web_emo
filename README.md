# 情绪音乐 · 基于人脸情绪识别的歌曲推荐系统

> 技术栈：**HTML5 + CSS3 + JavaScript + Vue3**，人脸情绪识别在**浏览器本地**完成（face-api.js / TensorFlow.js），歌曲来源为「本地曲库 + 在线音乐 API」双通道。
> 当前版本 **v2**：在 v1 可用版本的基础上，重做了识别稳定性、推荐算法、播放器与界面。

---

## 一、功能概览

- **4 种人脸获取方式**：🖼️ 上传图片 / 🎞️ 上传视频 / 📷 实时摄像头 / 📸 拍照
- **实时追踪**：摄像头与视频支持约 4 帧/秒的连续识别，人脸框会跟随移动
- **本地情绪识别**：不调用任何云端情绪 API，模型与推理全部在端侧
- **情绪可视化**：6 类概率条 + Russell「效价 × 唤醒度」二维情感图（含连续坐标）
- **情绪自适应主题**：界面强调色随识别到的情绪实时变化（开心绿 / 难过蓝 / 愤怒红……）
- **双通道推荐**：本地曲库（可完全离线播放）+ 网易云在线搜索，并带「推荐理由」标签
- **完整播放器**：底部固定播放条，支持进度拖拽、上/下一首、音量、单曲循环
- **情绪轨迹**：最近 8 次识别记录（localStorage），点击可回看；歌曲可收藏
- **键盘可用**：空格播放/暂停，Alt + ← / → 切歌

---

## 二、情绪识别算法（本地 / 无云端 API）

使用 [`face-api.js`](https://github.com/justadudewhohacks/face-api.js)（基于 TensorFlow.js），全部在浏览器端运行。

**流程（`src/composables/useEmotion.js` + `src/utils/emotionMap.js`）：**

1. **人脸定位** — `TinyFaceDetector`（轻量 SSD MobileNet），**多尺度重试**：416 → 320 → 224，阈值 0.3 → 0.25 → 0.2，提升暗脸/小脸召回。
2. **表情分类** — `FaceExpressionNet`（CNN）输出 **7 类概率**：
   `neutral / happy / sad / angry / fearful / disgusted / surprised`。
3. **情绪融合** — 将 7 类归并为 6 个标准情绪：

   | face-api 原始类 | 标准情绪 |
   |---|---|
   | happy | 开心 joy |
   | sad | 难过 sad |
   | angry | 愤怒 anger |
   | surprised | 惊讶 surprise |
   | fearful | 恐惧 fear |
   | disgusted | 愤怒 anger（与愤怒在音乐取向上接近）|
   | neutral | 平静 calm |

   同类概率**累加**，取最大值作为**主导情绪**，其数值即为**置信度**。
4. **时序平滑（v2 新增）** — 连续帧用指数滑动平均（EMA，α=0.4）混合前后帧：
   `score_t = 0.6 × score_{t-1} + 0.4 × score_t`，再归一化。
   摄像头场景下标签不再逐帧乱跳；单张图片识别时 α=1，不做平滑。
5. **质量门控（v2 新增）** — 人脸占画面比例 < 2%，或检测分 < 0.4 时给出
   「靠近一点 / 光线偏暗」提示，而不是硬给一个不可靠的结论。
6. **置信度兜底** — 置信度 < 40% 时，界面明确提示「情绪不够明确」，
   推荐结果自动向「平静」倾斜。

> 模型权重位于 `public/models/`，页面加载时**后台预热**，点示例几乎无等待。

---

## 三、歌曲推荐算法（v2）

`src/utils/recommend.js` + `src/composables/useRecommend.js`

### 1. 双通道打分

```
match = SIMILARITY[E][歌曲情绪]                 // 情绪类别相似度，对角=1
va    = 1 - dist(歌曲VA, 情绪VA) / √2           // 效价-唤醒度二维距离
score = (0.7·match + 0.3·va) × (0.75 + 0.25·c)  // c = 置信度
```

- 「类别相近」之外再加「氛围接近」，避免出现「标签对了但听着不对」的推荐。
- 在线歌曲只是**按关键词搜到**的，并没有分析音频，因此 `match` 封顶 **0.92**，
  不会把本地精准匹配的曲目挤下去。

### 2. 多样性重排（MMR）

```
value = λ·score + (1-λ)·(1 - 该歌与已选歌曲的最大相似度)     λ = 0.78
```

每轮挑一首「分数高、且与已选歌曲情绪差异足够大」的，避免 12 首全是同一种情绪。

### 3. 情绪相似度矩阵

| | joy | sad | anger | surprise | fear | calm |
|---|---|---|---|---|---|---|
| **joy** | 1.0 | .15 | .10 | .60 | .10 | .40 |
| **sad** | .15 | 1.0 | .10 | .20 | .70 | .40 |
| **anger** | .30 | .15 | 1.0 | .50 | .20 | .15 |
| **surprise** | .60 | .20 | .50 | 1.0 | .25 | .30 |
| **fear** | .10 | .70 | .20 | .25 | 1.0 | .45 |
| **calm** | .40 | .50 | .15 | .30 | .45 | 1.0 |

### 4. 在线检索

- 每种情绪配置 **2 组关键词**，并行请求后**交错合并**，避免单一关键词结果太窄；
- 按「ID + 歌名」双去重，服务端还会过滤掉时长 < 60s 或 > 10min、标题过长的播客/合集；
- **8 秒超时**（AbortController），失败立即降级为纯本地曲库；
- 同一情绪在同一次会话内做内存缓存，重复识别不再打网络。

---

## 四、目录结构

```
face-music-recommender/
├─ index.html
├─ package.json
├─ vite.config.js            # Vue 插件 + /api 代理（复用 server/api.js）
├─ server.js                 # 生产服务器：静态托管 + /api 代理 + gzip + 缓存头
├─ server/
│  └─ api.js                 # 网易云代理唯一实现（dev/prod 共用）
├─ public/
│  ├─ models/                # face-api.js 模型权重
│  ├─ songs/                 # 本地歌曲（SoundHelix 免版权示例）
│  └─ demos/                 # 6 张示例人脸，用于一键演示
└─ src/
   ├─ main.js
   ├─ App.vue                # 总布局 / 主题同步 / 推荐节流 / 快捷键
   ├─ styles/main.css        # 设计变量与全局样式（--accent 由情绪驱动）
   ├─ utils/
   │  ├─ emotionMap.js       # 7→6 类映射、VA 坐标、情绪建议、mixVA()
   │  └─ recommend.js        # 双通道打分 + MMR 多样性重排 + 推荐理由
   ├─ data/songs.js          # 本地曲库（情绪标签 / valence / energy / 封面）
   ├─ composables/
   │  ├─ useEmotion.js       # 本地推理 + 时序平滑 + 质量门控
   │  ├─ useRecommend.js     # 多关键词在线检索 + 超时降级 + 会话缓存
   │  ├─ usePlayer.js        # 全局播放器单例（进度/音量/循环/自动跳转）
   │  └─ useHistory.js       # 情绪历史 + 收藏（localStorage）
   └─ components/
      ├─ CapturePanel.vue    # 4 种输入 + 实时追踪 + 人脸框叠加 + 示例
      ├─ EmotionResult.vue   # 主导情绪 + 概率条 + 情感图 + 情绪建议
      ├─ VaChart.vue         # Russell 环形情感模型 SVG
      ├─ SongList.vue        # 推荐列表（骨架屏/收藏/推荐理由）
      ├─ PlayerBar.vue       # 底部固定播放器
      └─ HistoryStrip.vue    # 情绪轨迹
```

---

## 五、运行方式

### 开发模式
```bash
npm install
npm run dev        # http://localhost:5173
```

### 生产模式（完整网站，含在线歌曲 API）
```bash
npm install
npm run build      # 产物在 dist/
npm start          # node server.js，打开 http://localhost:3000
```

`server.js` 同时托管静态站点并提供同源 `/api/music`、`/api/play`、`/api/img` 代理，
在线歌曲在生产环境同样可用。部署到云主机时设置环境变量 `PORT` 即可。

> ⚠️ **摄像头 / 拍照**需要安全上下文：`localhost` 或 `https`。直接双击 `index.html`（file://）无法使用摄像头。
> 若只做静态托管且不跑 `server.js`，在线歌曲会因 CORS 失败而自动回退到本地曲库，其余功能正常。

### 一键演示
- 进入「🖼️ 图片」模式，点 6 张示例缩略图中的任意一张即可识别；
- 也可用参数直达：`?demo=joy|sad|anger|surprise|fear|calm`。

---

## 六、接口说明

| 接口 | 说明 |
|---|---|
| `GET /api/music?keyword=&limit=&emotion=` | 搜索歌曲，返回含专辑封面的列表（5 分钟内存缓存） |
| `GET /api/play?id=` | 音频流，透传 `Range`，支持拖动进度 |
| `GET /api/img?u=<封面URL>` | 封面同源代理（仅放行 `music.126.net` / `126.net`） |
| `GET /healthz` | 健康检查 |

---

## 七、替换 / 扩展

- **本地歌曲**：把自己的音乐放进 `public/songs/`，在 `src/data/songs.js` 增补条目（含 `emotion`）。
- **换音乐平台**：只改 `server/api.js` 里的 `searchMusic` 与 `fetchAudio`，前后端不用动。
- **更多情绪**：在 `emotionMap.js` 的 `EMOTIONS`（含 `valence`/`arousal`/`keywords`）与
  `recommend.js` 的 `SIMILARITY` 中扩展即可，界面与情感图会自动适配。

---

## 八、已知限制

- 识别精度受光照、角度、遮挡影响；face-api.js 对夸张表情更敏感。
- 在线歌曲依赖网易云接口可用性，平台策略变动时可能失效，此时自动回退本地曲库。
- 本地示例曲目为免版权音乐，仅用于演示推荐逻辑，正式使用请替换为拥有版权的曲库。

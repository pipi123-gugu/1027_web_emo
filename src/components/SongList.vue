<script setup>
import { ref, computed, watch } from 'vue'
import { EMOTIONS } from '../utils/emotionMap.js'
import { playSong, toggle, player } from '../composables/usePlayer.js'
import { useHistory } from '../composables/useHistory.js'

const props = defineProps({
  songs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  onlineError: { type: String, default: '' }
})

const { isFav, toggleFav, favorites } = useHistory()
const onlyFav = ref(false)

const shown = computed(() =>
  onlyFav.value ? props.songs.filter((s) => favorites.value.includes(s.id)) : props.songs
)

const currentId = computed(() => player.list[player.index]?.id || '')

/**
 * 封面三级降级：
 *   1. 直连网易云 CDN   2. 失败走同源 /api/img 代理   3. 再失败用情绪配色块 + emoji
 */
const srcMap = ref({})
function coverOf(s) {
  return s.id in srcMap.value ? srcMap.value[s.id] : s.cover || ''
}
function onCoverError(s) {
  const cur = coverOf(s)
  if (cur && !cur.startsWith('/api/img')) {
    srcMap.value = { ...srcMap.value, [s.id]: '/api/img?u=' + encodeURIComponent(cur) }
  } else if (cur) {
    srcMap.value = { ...srcMap.value, [s.id]: '' }
  }
}

function fmt(sec) {
  if (!sec || !Number.isFinite(sec)) return '--:--'
  const m = Math.floor(sec / 60)
  const s = String(Math.floor(sec % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function onPlay(s) {
  if (currentId.value === s.id) toggle()
  else playSong(s, props.songs)
}

// 换一批推荐时重置封面缓存，避免旧歌曲的错误状态串台
watch(() => props.songs, () => { srcMap.value = {} })
</script>

<template>
  <section class="songs card">
    <header class="head">
      <h3>为你推荐的歌曲</h3>
      <div class="tools">
        <span class="count" v-if="songs.length">{{ songs.length }} 首</span>
        <button class="mini" :class="{ on: onlyFav }" @click="onlyFav = !onlyFav">
          {{ onlyFav ? '★ 仅看收藏' : '☆ 我的收藏' }}
        </button>
      </div>
    </header>

    <p v-if="onlineError" class="warn">⚠️ {{ onlineError }}</p>

    <!-- 骨架屏 -->
    <div v-if="loading" class="grid">
      <div v-for="i in 4" :key="i" class="sk">
        <div class="sk-cover"></div>
        <div class="sk-lines"><i></i><i></i></div>
      </div>
    </div>

    <p v-else-if="!songs.length" class="hint">识别情绪后，这里会自动生成匹配的歌曲。</p>
    <p v-else-if="!shown.length" class="hint">这个歌单里还没有收藏，点右侧的 ☆ 收藏几首试试。</p>

    <ul v-else class="grid">
      <li
        v-for="(s, i) in shown"
        :key="s.id"
        class="row"
        :class="{ active: currentId === s.id }"
        :style="{ '--c': EMOTIONS[s.emotion]?.color || '#2ecc71' }"
      >
        <button class="cover" @click="onPlay(s)" :aria-label="`播放 ${s.title}`">
          <img
            v-if="coverOf(s)"
            :src="coverOf(s)"
            :alt="s.title"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="onCoverError(s)"
          />
          <span v-else class="emoji">{{ EMOTIONS[s.emotion]?.emoji || '🎵' }}</span>
          <span class="mask">
            {{ currentId === s.id && player.playing ? '⏸' : '▶' }}
          </span>
          <span class="idx">{{ String(i + 1).padStart(2, '0') }}</span>
        </button>

        <div class="meta">
          <div class="title" :title="s.title">{{ s.title }}</div>
          <div class="artist" :title="s.artist">{{ s.artist }}</div>
          <div class="tags">
            <span class="tag" :class="s.source">{{ s.source === 'local' ? '本地' : '在线' }}</span>
            <span class="tag reason">{{ s.reason || '情绪匹配' }}</span>
          </div>
        </div>

        <div class="right">
          <button
            class="fav"
            :class="{ on: isFav(s.id) }"
            :aria-label="isFav(s.id) ? '取消收藏' : '收藏'"
            @click.stop="toggleFav(s.id)"
          >{{ isFav(s.id) ? '★' : '☆' }}</button>
          <span class="match">{{ Math.round((s.match ?? 0) * 100) }}%</span>
          <span class="dur">{{ fmt(s.duration) }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.songs { min-width: 0; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.head h3 { margin: 0; font-size: 15px; color: var(--ink, #12271d); }
.tools { display: flex; align-items: center; gap: 8px; }
.count { font-size: 11px; color: #8aa79a; }
.mini {
  font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 999px;
  border: 1px solid var(--line, #e2efe8); background: #fff; color: #5c8272; cursor: pointer;
}
.mini.on { background: #fff8e1; border-color: #f2d98a; color: #a1741a; }

.warn {
  color: #b8860b; font-size: 12px; background: #fffaf0; padding: 8px 12px;
  border-radius: 10px; border: 1px solid #f6e7c2; margin: 10px 0 0;
}
.hint { color: #8aa79a; font-size: 13px; padding: 18px 0; margin: 0; }

.grid { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 8px; grid-template-columns: 1fr; }
@media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; } }

.row {
  display: flex; align-items: center; gap: 11px; padding: 9px 10px;
  border-radius: 14px; background: #f7fbf9; border: 1px solid transparent;
  transition: .16s; min-width: 0; cursor: pointer;
}
.row:hover { background: #fff; border-color: var(--line, #e2efe8); box-shadow: 0 6px 16px rgba(20, 70, 45, .07); }
.row.active { background: #fff; border-color: var(--c); box-shadow: 0 6px 18px rgba(20, 70, 45, .1); }

.cover {
  position: relative; width: 50px; height: 50px; flex: none; border: none; padding: 0;
  border-radius: 12px; overflow: hidden; cursor: pointer;
  background: linear-gradient(135deg, var(--c), #17352a);
  display: flex; align-items: center; justify-content: center; color: #fff;
}
.cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.cover .emoji { position: relative; z-index: 1; font-size: 22px; }
.cover .mask {
  position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #fff; background: rgba(10, 60, 40, .45); opacity: 0; transition: .16s;
}
.row:hover .mask, .row.active .mask { opacity: 1; }
.cover .idx {
  position: absolute; left: 3px; top: 2px; z-index: 1; font-size: 9px;
  color: rgba(255, 255, 255, .85); text-shadow: 0 1px 2px rgba(0, 0, 0, .5);
}

.meta { flex: 1; min-width: 0; }
.title { font-weight: 600; font-size: 13px; color: #1c3a2c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.artist { font-size: 11px; color: #7d9a8c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.tag { font-size: 9px; padding: 1px 6px; border-radius: 999px; font-weight: 600; }
.tag.local { background: #e8f7ef; color: #1f8f5a; }
.tag.online { background: #e8f0fd; color: #2f6bd8; }
.tag.reason { background: #f1f4f2; color: #6b8a7c; font-weight: 500; }

.right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: none; }
.fav {
  border: none; background: none; cursor: pointer; font-size: 15px; line-height: 1;
  color: #c9d8d0; padding: 0; transition: .15s;
}
.fav:hover { color: #f0b429; transform: scale(1.12); }
.fav.on { color: #f0b429; }
.match { font-size: 10px; color: #8aa79a; font-variant-numeric: tabular-nums; }
.dur { font-size: 10px; color: #b3c5ba; font-variant-numeric: tabular-nums; }

/* 骨架屏 */
.sk { display: flex; gap: 11px; align-items: center; padding: 9px 10px; border-radius: 14px; background: #f7fbf9; }
.sk-cover { width: 50px; height: 50px; border-radius: 12px; flex: none; background: linear-gradient(90deg, #eef4f0, #e2ede7, #eef4f0); background-size: 200% 100%; animation: shimmer 1.3s infinite; }
.sk-lines { flex: 1; }
.sk-lines i { display: block; height: 9px; border-radius: 5px; background: linear-gradient(90deg, #eef4f0, #e2ede7, #eef4f0); background-size: 200% 100%; animation: shimmer 1.3s infinite; }
.sk-lines i:first-child { width: 62%; margin-bottom: 7px; }
.sk-lines i:last-child { width: 38%; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>

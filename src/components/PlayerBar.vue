<script setup>
import { computed, ref, watch } from 'vue'
import { player, toggle, next, prev, seek, setVolume, toggleLoop } from '../composables/usePlayer.js'
import { EMOTIONS } from '../utils/emotionMap.js'

/**
 * 底部固定播放器
 * 播放状态全部来自 usePlayer 的单例，这里只做展示与交互转发。
 */
const current = computed(() => player.list[player.index] || null)
const coverFail = ref(false)
const coverSrc = ref('')

watch(current, (s) => {
  coverFail.value = false
  coverSrc.value = s?.cover || ''
})

function fmt(sec) {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = String(Math.floor(sec % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function onSeek(e) {
  seek(Number(e.target.value))
}
function onVol(e) {
  setVolume(Number(e.target.value))
}

const accent = computed(() => EMOTIONS[current.value?.emotion]?.color || '#2ecc71')
</script>

<template>
  <transition name="rise">
    <div v-if="player.list.length" class="player" :style="{ '--c': accent }">
      <div class="track">
        <div class="cov">
          <img v-if="coverSrc && !coverFail" :src="coverSrc" alt="" referrerpolicy="no-referrer" @error="coverFail = true" />
          <span v-else>🎵</span>
        </div>
        <div class="txt">
          <div class="t">{{ current?.title || '未在播放' }}</div>
          <div class="a">
            {{ current?.artist || '—' }}
            <span v-if="player.error" class="err">· {{ player.error }}</span>
          </div>
        </div>
      </div>

      <div class="mid">
        <div class="btns">
          <button @click="prev" aria-label="上一首" title="上一首">⏮</button>
          <button class="play" @click="toggle" :aria-label="player.playing ? '暂停' : '播放'">
            {{ player.playing ? '⏸' : '▶' }}
          </button>
          <button @click="next" aria-label="下一首" title="下一首">⏭</button>
          <button class="loop" :class="{ on: player.loopOne }" @click="toggleLoop" aria-label="单曲循环" title="单曲循环">🔁</button>
        </div>
        <div class="prog">
          <span>{{ fmt(player.currentTime) }}</span>
          <input
            type="range" min="0" :max="Math.max(player.duration, 1)" step="0.5"
            :value="player.currentTime" aria-label="播放进度" @input="onSeek"
          />
          <span>{{ fmt(player.duration) }}</span>
        </div>
      </div>

      <div class="right">
        <span class="vico">🔊</span>
        <input class="vol" type="range" min="0" max="1" step="0.05" :value="player.volume" aria-label="音量" @input="onVol" />
      </div>
    </div>
  </transition>
</template>

<style scoped>
.player {
  position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%);
  width: min(1120px, calc(100% - 24px)); z-index: 40;
  display: flex; align-items: center; gap: 16px;
  padding: 10px 16px; border-radius: 18px;
  background: rgba(255, 255, 255, .82);
  backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, .9);
  box-shadow: 0 18px 44px rgba(14, 60, 40, .16), 0 0 0 1px rgba(20, 70, 45, .04);
}
.track { display: flex; align-items: center; gap: 10px; min-width: 0; width: 250px; flex: none; }
.cov {
  width: 42px; height: 42px; border-radius: 11px; flex: none; overflow: hidden;
  background: linear-gradient(135deg, var(--c), #17352a);
  display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff;
}
.cov img { width: 100%; height: 100%; object-fit: cover; display: block; }
.txt { min-width: 0; }
.t { font-size: 13px; font-weight: 600; color: #16352a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a { font-size: 11px; color: #7d9a8c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.err { color: #d97706; }

.mid { flex: 1; min-width: 0; }
.btns { display: flex; align-items: center; justify-content: center; gap: 6px; }
.btns button {
  border: none; background: none; cursor: pointer; font-size: 15px; line-height: 1;
  width: 30px; height: 30px; border-radius: 9px; color: #3d6b55; transition: .15s;
}
.btns button:hover { background: #eef7f2; }
.btns .play {
  width: 36px; height: 36px; border-radius: 50%; color: #fff; font-size: 13px;
  background: linear-gradient(135deg, var(--c), #17352a);
  box-shadow: 0 6px 14px rgba(20, 70, 45, .22);
}
.btns .loop.on { background: #eaf8f0; color: #1f8f5a; }

.prog { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.prog span { font-size: 10px; color: #8aa79a; font-variant-numeric: tabular-nums; width: 32px; text-align: center; flex: none; }
.prog input { flex: 1; min-width: 0; height: 4px; accent-color: var(--c); cursor: pointer; }

.right { display: flex; align-items: center; gap: 6px; width: 120px; flex: none; }
.vico { font-size: 12px; color: #8aa79a; }
.vol { flex: 1; min-width: 0; height: 4px; accent-color: var(--c); cursor: pointer; }

.rise-enter-active, .rise-leave-active { transition: .28s ease; }
.rise-enter-from, .rise-leave-to { opacity: 0; transform: translate(-50%, 16px); }

@media (max-width: 760px) {
  .player { flex-wrap: wrap; gap: 8px; padding: 8px 12px; bottom: 8px; }
  .track { width: 100%; }
  .right { display: none; }
  .prog span { width: 28px; }
}
</style>

/**
 * 本地曲库（已下载到 public/songs/，可离线播放）
 * 字段说明：
 *   id        唯一标识
 *   title     曲名
 *   artist    艺人
 *   emotion   标准情绪 key（见 utils/emotionMap.js）
 *   genre     风格
 *   valence   效价 0~1（越接近 1 越积极）
 *   energy    能量 0~1（越接近 1 越激烈）
 *   duration  时长（秒，约值）
 *   src       本地音频路径（public 下）
 *   cover     封面图（网易云音乐专辑封面 CDN，?param=200y200 取小图；
 *             加载失败时前端会自动改走 /api/img 代理，再失败则回退情绪配色方块）
 *
 * 说明：本地素材使用 SoundHelix 提供的免版权示例曲目，仅作演示，
 * 你可以用自己拥有版权的音乐替换 public/songs/ 下文件并同步修改本表。
 */
const P = '?param=200y200'
// 本地音频用 BASE_URL 拼接：根路径部署为 /songs/，GitHub Pages 子路径为 ./songs/
const A = import.meta.env.BASE_URL + 'songs/'

export const LOCAL_SONGS = [
  { id: 'local-1', title: 'Sunburst', artist: 'SoundHelix', emotion: 'joy', genre: 'Pop / Electronic', valence: 0.85, energy: 0.7, duration: 372, src: `${A}SoundHelix-Song-1.mp3`,
    cover: 'https://p1.music.126.net/dOF4wDHnRvtir8ACKnzbsA==/104453604655995.jpg' + P },
  { id: 'local-2', title: 'Midnight Echo', artist: 'SoundHelix', emotion: 'sad', genre: 'Ambient / Ballad', valence: 0.25, energy: 0.3, duration: 359, src: `${A}SoundHelix-Song-2.mp3`,
    cover: 'https://p1.music.126.net/CVp7eYequo1oG7Ay2L9EaQ==/109951162783431.jpg' + P },
  { id: 'local-3', title: 'Soft Rain', artist: 'SoundHelix', emotion: 'calm', genre: 'Lo-Fi / Chill', valence: 0.55, energy: 0.2, duration: 348, src: `${A}SoundHelix-Song-3.mp3`,
    cover: 'https://p1.music.126.net/_GEWg9rZSTiXfulyBq7gVA==/109951168645658825.jpg' + P },
  { id: 'local-4', title: 'Red Pulse', artist: 'SoundHelix', emotion: 'anger', genre: 'Rock / EDM', valence: 0.4, energy: 0.95, duration: 313, src: `${A}SoundHelix-Song-4.mp3`,
    cover: 'https://p2.music.126.net/_kyyJykAcZuvRlfFp9jNEw==/109951173207037655.jpg' + P },
  { id: 'local-5', title: 'Neon Rush', artist: 'SoundHelix', emotion: 'surprise', genre: 'Synthwave', valence: 0.7, energy: 0.8, duration: 389, src: `${A}SoundHelix-Song-5.mp3`,
    cover: 'https://p1.music.126.net/NZaSBXRVtVJTGy56Jtzzeg==/109951172054870631.jpg' + P },
  { id: 'local-6', title: 'Shadow Veil', artist: 'SoundHelix', emotion: 'fear', genre: 'Dark Ambient', valence: 0.2, energy: 0.35, duration: 320, src: `${A}SoundHelix-Song-6.mp3`,
    cover: 'https://p2.music.126.net/PiSoBZPyzfAdVCmlRabiNQ==/109951174117840895.jpg' + P },
  { id: 'local-7', title: 'Golden Hour', artist: 'SoundHelix', emotion: 'joy', genre: 'House / Disco', valence: 0.9, energy: 0.75, duration: 331, src: `${A}SoundHelix-Song-7.mp3`,
    cover: 'https://p1.music.126.net/KLOFDi06BBYF7VAuCv_lAw==/109951163449883394.jpg' + P },
  { id: 'local-8', title: 'Fading Light', artist: 'SoundHelix', emotion: 'sad', genre: 'Piano / Post-Rock', valence: 0.3, energy: 0.25, duration: 366, src: `${A}SoundHelix-Song-8.mp3`,
    cover: 'https://p1.music.126.net/HB7PW1l9ne0Trd3sIDKdqw==/109951163200274260.jpg' + P },
  { id: 'local-9', title: 'Still Water', artist: 'SoundHelix', emotion: 'calm', genre: 'Meditation', valence: 0.6, energy: 0.15, duration: 302, src: `${A}SoundHelix-Song-9.mp3`,
    cover: 'https://p1.music.126.net/puwBa-vaKWBsC9wtliGcUA==/109951170627160931.jpg' + P }
]

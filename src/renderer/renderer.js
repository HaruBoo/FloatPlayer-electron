// FloatPlayer (Electron版) レンダラープロセス
// macOS版(Swift/AppKit)と同じ機能構成を、1つのJS実行環境の中で完結させている。
// WKWebViewブリッジのような仕組みが不要な分、YouTube制御はシンプルになっている。

const state = {
  mode: 'youtube',
  videoId: null,
  chapters: [],
  ytPlayer: null,
  ytReady: false
};

// ---- モード切り替え --------------------------------------------------------

const sections = {
  youtube: document.getElementById('youtubeSection'),
  photo: document.getElementById('photoSection'),
  video: document.getElementById('videoSection')
};

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  Object.entries(sections).forEach(([key, el]) => {
    el.classList.toggle('active', key === mode);
  });

  // 裏に回ったYouTubeは一時停止、戻したら再開(WKWebView版と同じ挙動)
  if (state.ytPlayer && state.ytReady) {
    if (mode === 'youtube') state.ytPlayer.playVideo();
    else state.ytPlayer.pauseVideo();
  }
}

document.querySelectorAll('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

// ---- YouTube ---------------------------------------------------------------

function extractYouTubeId(input) {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
      return url.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

function loadYouTubeApiOnce() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

async function loadYouTube() {
  const id = extractYouTubeId(document.getElementById('youtubeInput').value);
  if (!id) return;

  state.videoId = id;
  state.chapters = [];
  window.floatplayer.updateChapters([]);
  document.getElementById('youtubeHint').classList.add('hidden');
  document.getElementById('youtubePlayerWrap').classList.remove('hidden');

  await loadYouTubeApiOnce();

  if (state.ytPlayer) {
    state.ytPlayer.loadVideoById(id);
  } else {
    state.ytPlayer = new YT.Player('youtubeFrame', {
      videoId: id,
      playerVars: { autoplay: 1, playsinline: 1, loop: 1, playlist: id },
      events: {
        onReady: () => {
          state.ytReady = true;
        }
      }
    });
  }

  fetchChapters(id);
}

document.getElementById('playButton').addEventListener('click', loadYouTube);
document.getElementById('youtubeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadYouTube();
});

window.floatplayer.onJumpToChapter((index) => {
  const chapter = state.chapters[index];
  if (!chapter || !state.ytPlayer) return;
  state.ytPlayer.seekTo(chapter.seconds, true);
  state.ytPlayer.playVideo();
});

// ---- チャプター抽出(YouTube Data API v3) -----------------------------------

function secondsFromTimestamp(text) {
  const parts = text.split(':').map((n) => parseInt(n, 10));
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function timeLabel(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function parseChaptersFromDescription(description) {
  const pattern = /^\(?(\d{1,2}(?::\d{2}){1,2})\)?\s*[-:–—]?\s*(.+)$/;
  const results = [];
  for (const rawLine of description.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(pattern);
    if (!match) continue;
    const seconds = secondsFromTimestamp(match[1]);
    const title = match[2].trim();
    if (seconds === null || !title) continue;
    results.push({ seconds, title, timeLabel: timeLabel(seconds) });
  }
  // 誤検出防止のため、最低2件そろって初めてチャプターとみなす(Swift版と同じ基準)
  return results.length >= 2 ? results : [];
}

async function fetchChapters(videoId) {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  if (!apiKey) return;
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const description = data.items?.[0]?.snippet?.description;
    if (!description) return;
    state.chapters = parseChaptersFromDescription(description);
    window.floatplayer.updateChapters(state.chapters);
  } catch (err) {
    console.error('[FloatPlayer] chapter fetch failed', err);
  }
}

// APIキーはローカルに保存し、次回以降は入力不要にする
const apiKeyInput = document.getElementById('apiKeyInput');
apiKeyInput.value = localStorage.getItem('floatplayer.apiKey') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('floatplayer.apiKey', apiKeyInput.value.trim());
});

// ---- 写真 --------------------------------------------------------------

function showPhoto(dataUrlOrPath) {
  const img = document.getElementById('photoImg');
  img.src = dataUrlOrPath;
  img.classList.remove('hidden');
  document.getElementById('photoHint').classList.add('hidden');
  setMode('photo');
}

document.getElementById('pickPhotoButton').addEventListener('click', async () => {
  const filePath = await window.floatplayer.pickPhoto();
  if (filePath) showPhoto(`file://${filePath}`);
});

document.getElementById('pastePhotoButton').addEventListener('click', async () => {
  const dataUrl = await window.floatplayer.readClipboardImage();
  if (dataUrl) showPhoto(dataUrl);
});

window.floatplayer.onPasteScreenshot(async () => {
  const dataUrl = await window.floatplayer.readClipboardImage();
  if (dataUrl) showPhoto(dataUrl);
});

// ---- 動画 --------------------------------------------------------------

function showVideo(filePath) {
  const video = document.getElementById('videoEl');
  video.src = `file://${filePath}`;
  video.classList.remove('hidden');
  document.getElementById('videoHint').classList.add('hidden');
  video.play();
  setMode('video');
}

document.getElementById('pickVideoButton').addEventListener('click', async () => {
  const filePath = await window.floatplayer.pickVideo();
  if (filePath) showVideo(filePath);
});

// ---- ドラッグ&ドロップ ------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm']);

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) {
    showVideo(file.path);
  } else {
    showPhoto(`file://${file.path}`);
  }
});

// ---- 透明度スライダー / クリックスルー ---------------------------------------

const mediaOpacitySlider = document.getElementById('mediaOpacitySlider');
const uiOpacitySlider = document.getElementById('uiOpacitySlider');

function applyMediaOpacity() {
  document.getElementById('content').style.opacity = mediaOpacitySlider.value;
}
function applyUiOpacity() {
  const v = uiOpacitySlider.value;
  document.getElementById('topBar').style.opacity = v;
  document.getElementById('bottomBar').style.opacity = v;
}
mediaOpacitySlider.addEventListener('input', applyMediaOpacity);
uiOpacitySlider.addEventListener('input', applyUiOpacity);

const clickThroughCheckbox = document.getElementById('clickThroughCheckbox');
clickThroughCheckbox.addEventListener('change', () => {
  window.floatplayer.setClickThrough(clickThroughCheckbox.checked);
});
window.floatplayer.onSetClickThrough((checked) => {
  clickThroughCheckbox.checked = checked;
});

// ---- UIの表示/非表示 --------------------------------------------------------

let uiHidden = false;
window.floatplayer.onToggleUIHidden(() => {
  uiHidden = !uiHidden;
  document.getElementById('topBar').classList.toggle('hidden', uiHidden);
  document.getElementById('bottomBar').classList.toggle('hidden', uiHidden);
  document.querySelectorAll('.field-row').forEach((el) => el.classList.toggle('hidden', uiHidden));
});

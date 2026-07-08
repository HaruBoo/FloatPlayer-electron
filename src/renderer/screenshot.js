// UIなし・画像だけのフローティングウィンドウ。
// 右クリックで閉じる/保存/コピーができる(Swift版のScreenshotFloatWindowと同じ操作感)。
// contextIsolation環境ではrequire()が使えないため、メニュー表示はIPC経由でmainプロセスに依頼する。

let currentDataUrl = null;

window.floatplayer.onScreenshotImage((filePath) => {
  const img = document.getElementById('shot');
  img.src = `file://${filePath}`;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    currentDataUrl = canvas.toDataURL('image/png');
  };
});

// クリップボード由来の画像はファイルパスが無いので、data URLをそのまま使う
window.floatplayer.onScreenshotImageDataUrl((dataUrl) => {
  document.getElementById('shot').src = dataUrl;
  currentDataUrl = dataUrl;
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.floatplayer.showScreenshotContextMenu(currentDataUrl);
});

// 見えているUIを増やさずに透明度を変えられるよう、スクロールで調整する
// (Swift版のonScrollOpacityと同じ操作感)
document.addEventListener('wheel', (e) => {
  e.preventDefault();
  window.floatplayer.setScreenshotOpacity(-e.deltaY * 0.001);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.floatplayer.closeScreenshotWindow();
});

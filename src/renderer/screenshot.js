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

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.floatplayer.showScreenshotContextMenu(currentDataUrl);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.floatplayer.closeScreenshotWindow();
});

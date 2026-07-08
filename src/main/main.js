const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, clipboard, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const chokidar = require('chokidar');

let mainWindow = null;
let tray = null;
let screenshotWatcher = null;
let screenshotFloatingEnabled = true;
let clipboardWatcherEnabled = false;
let clickThroughEnabled = false;
let clipboardWatcherTimer = null;
let lastClipboardImageDataUrl = null;
const floatingScreenshotWindows = new Set();

// ---- Main panel -----------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 280,
    minWidth: 260,
    minHeight: 180,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // macOSのFloatPlayer(Swift版)と同じく、アクティブな間だけ最前面に浮かせ、
  // 他のアプリを使っている間は背面に回す
  mainWindow.on('focus', () => mainWindow.setAlwaysOnTop(true, 'floating'));
  mainWindow.on('blur', () => mainWindow.setAlwaysOnTop(false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.show();
  mainWindow.focus();
}

// ---- Tray (メニューバー/システムトレイ) ------------------------------------

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'パネルを表示', click: showMainWindow },
    {
      label: 'クリックスルー',
      type: 'checkbox',
      checked: clickThroughEnabled,
      click: (item) => {
        clickThroughEnabled = item.checked;
        mainWindow?.webContents.send('set-click-through', item.checked);
        mainWindow?.setIgnoreMouseEvents(item.checked, { forward: true });
      }
    },
    {
      label: 'UIを表示/隠す',
      click: () => mainWindow?.webContents.send('toggle-ui-hidden')
    },
    { label: 'チャプター', enabled: false, submenu: [] },
    { type: 'separator' },
    {
      label: 'スクリーンショットを貼り付け',
      accelerator: 'CmdOrCtrl+Shift+V',
      click: () => mainWindow?.webContents.send('paste-screenshot')
    },
    {
      label: 'スクショを自動でフローティング表示',
      type: 'checkbox',
      checked: screenshotFloatingEnabled,
      click: (item) => {
        screenshotFloatingEnabled = item.checked;
        if (screenshotFloatingEnabled) {
          startScreenshotWatcher();
        } else {
          stopScreenshotWatcher();
        }
      }
    },
    {
      label: '→ Cmd+Shift+4等で撮ると自動で画像が浮きます',
      enabled: false
    },
    {
      label: 'クリップボードの画像も自動でフローティング表示',
      type: 'checkbox',
      checked: clipboardWatcherEnabled,
      click: (item) => {
        clipboardWatcherEnabled = item.checked;
        if (clipboardWatcherEnabled) {
          startClipboardWatcher();
        } else {
          stopClipboardWatcher();
        }
      }
    },
    {
      label: '→ Cmd+Ctrl+Shift+4等(保存せずコピー)にも反応します',
      enabled: false
    },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'renderer', 'assets', 'trayTemplate.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('FloatPlayer');
  tray.setContextMenu(buildTrayMenu());
}

function updateChaptersMenu(chapters) {
  const menu = buildTrayMenu();
  const chaptersItem = menu.items.find((item) => item.label === 'チャプター');
  if (!chaptersItem) return;
  if (!chapters || chapters.length === 0) {
    chaptersItem.enabled = false;
  } else {
    chaptersItem.enabled = true;
    chaptersItem.submenu = Menu.buildFromTemplate(
      chapters.map((chapter, index) => ({
        label: `${chapter.timeLabel}  ${chapter.title}`,
        click: () => mainWindow?.webContents.send('jump-to-chapter', index)
      }))
    );
  }
  tray.setContextMenu(menu);
}

// ---- スクリーンショット自動フローティング -----------------------------------

// macOS: `defaults read com.apple.screencapture location` でカスタム保存先を確認、
// Windows: Snipping Tool / Win+Shift+S の既定の保存先(Pictures/Screenshots)を見る
function screenshotDirectory() {
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('defaults', ['read', 'com.apple.screencapture', 'location'], {
        encoding: 'utf8'
      }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch {
      // 未設定(既定値)の場合はここに来る。Desktopにフォールバックする
    }
    return path.join(os.homedir(), 'Desktop');
  }
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Pictures', 'Screenshots');
  }
  return path.join(os.homedir(), 'Desktop');
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.heic', '.tiff', '.bmp']);

function startScreenshotWatcher() {
  stopScreenshotWatcher();
  const dir = screenshotDirectory();
  if (!fs.existsSync(dir)) {
    console.warn(`[FloatPlayer] screenshot directory not found, skipping watch: ${dir}`);
    return;
  }
  screenshotWatcher = chokidar.watch(dir, {
    depth: 0,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });
  screenshotWatcher.on('add', (filePath) => {
    const basename = path.basename(filePath);
    // スクリーンショットは書き込み中、"."で始まる一時的な隠しファイル名で
    // 現れてから最終的なファイル名にリネームされることがあるため対象から除く
    // (Swift版で実際に踏んだのと同じ競合状態)
    if (basename.startsWith('.')) return;
    if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return;
    createFloatingScreenshotWindow(filePath);
  });
}

function stopScreenshotWatcher() {
  screenshotWatcher?.close();
  screenshotWatcher = null;
}

// ---- クリップボードの画像を自動でフローティング -------------------------------

// Finderなどでファイルをコピーすると、そのファイルのアイコン画像がclipboard.readImage()で
// 拾われてしまうことがある。ファイル参照が乗っている場合は「ファイルコピー」とみなし、
// 画像コピーとしては扱わない。実機で確認したところ、macOSでファイルをコピーすると
// availableFormats()には 'text/uri-list' が乗る(NSPasteboardの生の型名ではなく
// Electron/Chromium側で正規化されたMIME形式の文字列になる)。'file'を含む形式名も
// 念のため見ておく(Windows側の挙動は実機未確認のため保険的なフォールバック)
function clipboardHasFileReference() {
  return clipboard.availableFormats().some(
    (format) => format === 'text/uri-list' || format.toLowerCase().includes('file')
  );
}

// Cmd+Ctrl+Shift+4等ファイル保存を伴わないスクリーンショットは、フォルダ監視では
// 検知できないためクリップボードの変化をポーリングして拾う。「スクショ由来」かを
// 判別するAPIは無いため、新しい画像がコピーされた時点で全て拾う(既定オフの追加機能)
function startClipboardWatcher() {
  stopClipboardWatcher();
  const initial = clipboardHasFileReference() ? null : clipboard.readImage();
  lastClipboardImageDataUrl = initial && !initial.isEmpty() ? initial.toDataURL() : null;
  clipboardWatcherTimer = setInterval(() => {
    if (clipboardHasFileReference()) return;
    const image = clipboard.readImage();
    if (image.isEmpty()) return;
    const dataUrl = image.toDataURL();
    if (dataUrl === lastClipboardImageDataUrl) return;
    lastClipboardImageDataUrl = dataUrl;
    createFloatingScreenshotWindowFromImage(image);
  }, 500);
}

function stopClipboardWatcher() {
  if (clipboardWatcherTimer) clearInterval(clipboardWatcherTimer);
  clipboardWatcherTimer = null;
}

let spawnIndex = 0;

function createFloatingScreenshotWindow(imagePath) {
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) return;
  const win = spawnFloatingScreenshotWindow(image);
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('screenshot-image', imagePath);
  });
}

// クリップボード由来の画像はファイルパスを持たないため、data URLとして直接渡す
function createFloatingScreenshotWindowFromImage(image) {
  if (image.isEmpty()) return;
  const win = spawnFloatingScreenshotWindow(image);
  const dataUrl = image.toDataURL();
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('screenshot-image-dataurl', dataUrl);
  });
}

function spawnFloatingScreenshotWindow(image) {
  const maxDimension = 420;
  const { width, height } = image.getSize();
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const winWidth = Math.round(width * scale);
  const winHeight = Math.round(height * scale);

  const display = screen.getPrimaryDisplay();
  const offset = (spawnIndex % 6) * 32;
  spawnIndex += 1;

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: display.workArea.x + 220 + offset,
    y: display.workArea.y + 120 + offset,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'screenshot.html'));

  // メインパネルと同じく、自分のウィンドウがアクティブな間だけ最前面に浮かせ、
  // 他のアプリを使っている間はその後ろに回るようにする
  win.on('focus', () => win.setAlwaysOnTop(true, 'floating'));
  win.on('blur', () => win.setAlwaysOnTop(false));

  floatingScreenshotWindows.add(win);
  win.on('closed', () => floatingScreenshotWindows.delete(win));
  return win;
}

// ---- IPC --------------------------------------------------------------

ipcMain.handle('pick-photo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'heic', 'gif', 'bmp'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('pick-video', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'webm'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-clipboard-image', () => {
  // Finderでファイルをコピーした場合、そのファイルのアイコンが誤って
  // 「貼り付け」されてしまわないよう、ファイル参照があるときは何もしない
  if (clipboardHasFileReference()) return null;
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  return image.toDataURL();
});

ipcMain.handle('save-image', async (_event, dataUrl) => {
  const result = await dialog.showSaveDialog({
    defaultPath: 'スクリーンショット.png',
    filters: [{ name: 'PNG', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return;
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
});

ipcMain.on('copy-image', (_event, dataUrl) => {
  clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
});

ipcMain.on('close-screenshot-window', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.on('show-screenshot-context-menu', (event, dataUrl) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const currentOpacity = win.getOpacity();
  const menu = Menu.buildFromTemplate([
    {
      label: '透明度',
      submenu: [1, 0.75, 0.5, 0.25].map((value) => ({
        label: `${Math.round(value * 100)}%`,
        type: 'radio',
        checked: Math.abs(currentOpacity - value) < 0.05,
        click: () => win.setOpacity(value)
      }))
    },
    { type: 'separator' },
    { label: '閉じる', click: () => win.close() },
    {
      label: '名前を付けて保存…',
      click: async () => {
        const result = await dialog.showSaveDialog(win, {
          defaultPath: 'スクリーンショット.png',
          filters: [{ name: 'PNG', extensions: ['png'] }]
        });
        if (result.canceled || !result.filePath || !dataUrl) return;
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
      }
    },
    {
      label: 'コピー',
      click: () => {
        if (!dataUrl) return;
        clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
      }
    }
  ]);
  menu.popup({ window: win });
});

// スクロールでの連続的な透明度調整(右クリックメニューのプリセットを補う)
ipcMain.on('adjust-screenshot-opacity', (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const next = win.getOpacity() + delta;
  win.setOpacity(Math.min(1, Math.max(0.15, next)));
});

ipcMain.on('update-chapters', (_event, chapters) => {
  updateChaptersMenu(chapters);
});

ipcMain.on('set-window-opacity-passthrough', (_event, ignore) => {
  mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  // パネル側のチェックボックスから変更された場合も、トレイのチェック状態を合わせる
  clickThroughEnabled = ignore;
  tray?.setContextMenu(buildTrayMenu());
});

// ---- App lifecycle ------------------------------------------------------

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  if (screenshotFloatingEnabled) startScreenshotWatcher();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMainWindow();
  });
});

// メニューバー/トレイ常駐アプリなので、最後のウィンドウを閉じてもアプリ自体は終了しない
app.on('window-all-closed', (event) => {
  event.preventDefault();
});

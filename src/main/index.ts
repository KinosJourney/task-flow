import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { closeDb } from './db/connection';
import { runMigrations } from './db/migrate';
import { runDbSelfCheck } from './db/selfCheck';
import { registerIpcHandlers } from './ipc';

/** 只跑数据库自检然后退出，用于 dev 与打包产物的自动化验收。 */
const selfCheckOnly = process.argv.includes('--selfcheck');

// 固定 userData 目录名：开发与打包各自独立且不随启动方式变化
app.setName(app.isPackaged ? 'TaskFlow' : 'TaskFlow Dev');

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'TaskFlow',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function bootstrap(): void {
  runMigrations();

  const check = runDbSelfCheck();
  console.log(
    `[db] selfcheck ${check.nativeModuleOk ? 'ok' : 'FAILED'} packaged=${check.packaged} ` +
      `journal=${check.journalMode} fk=${check.foreignKeys} writes=${check.writeCount} path=${check.dbPath}`,
  );

  if (selfCheckOnly) {
    app.exit(check.nativeModuleOk ? 0 : 1);
    return;
  }

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.whenReady().then(() => {
  try {
    bootstrap();
  } catch (error) {
    // 数据库/迁移失败时必须显式退出：否则没有窗口的 Electron 会静默挂住
    console.error('[main] 启动失败:', error);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  closeDb();
});

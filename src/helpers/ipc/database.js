const { ipcMain } = require("electron");

module.exports = function register(ctx) {
  // 数据库相关
  ipcMain.handle("save-transcription", (event, data) => {
    return ctx.databaseManager.saveTranscription(data);
  });

  ipcMain.handle("get-transcriptions", (event, limit, offset) => {
    return ctx.databaseManager.getTranscriptions(limit, offset);
  });

  ipcMain.handle("get-transcription", (event, id) => {
    return ctx.databaseManager.getTranscriptionById(id);
  });

  ipcMain.handle("delete-transcription", (event, id) => {
    return ctx.databaseManager.deleteTranscription(id);
  });

  ipcMain.handle("search-transcriptions", (event, query, limit) => {
    return ctx.databaseManager.searchTranscriptions(query, limit);
  });

  ipcMain.handle("get-transcription-stats", () => {
    return ctx.databaseManager.getTranscriptionStats();
  });

  ipcMain.handle("get-daily-stats", (event, days) => {
    return ctx.databaseManager.getDailyStats(days || 14);
  });

  ipcMain.handle("clear-all-transcriptions", () => {
    return ctx.databaseManager.clearAllTranscriptions();
  });

  // 设置相关
  ipcMain.handle("get-setting", (event, key, defaultValue) => {
    return ctx.databaseManager.getSetting(key, defaultValue);
  });

  ipcMain.handle("set-setting", (event, key, value) => {
    const result = ctx.databaseManager.setSetting(key, value);

    // 當變更自啟動設定時，同步更新系統自啟動狀態
    if (key === 'auto_start' || key === 'auto_start_minimized') {
      const autoStart = key === 'auto_start' ? value : ctx.databaseManager.getSetting('auto_start', false);
      const autoStartMinimized = key === 'auto_start_minimized' ? value : ctx.databaseManager.getSetting('auto_start_minimized', true);
      const { app } = require('electron');
      try {
        app.setLoginItemSettings({
          openAtLogin: !!autoStart,
          path: process.execPath,
          args: autoStartMinimized ? ["--hidden"] : []
        });
        if (ctx.logger && ctx.logger.info) {
          ctx.logger.info(`[AutoStart] 已更新自啟動設定: openAtLogin=${!!autoStart}, args=${autoStartMinimized ? '["--hidden"]' : '[]'}`);
        }
      } catch (e) {
        if (ctx.logger && ctx.logger.warn) {
          ctx.logger.warn("更新開機自啟動設定失敗:", e.message || e);
        }
      }
    }

    // 廣播設定變更到所有視窗（用於跨視窗同步）
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('setting-changed', { key, value });
      }
    });

    return result;
  });

  ipcMain.handle("get-all-settings", () => {
    return ctx.databaseManager.getAllSettings();
  });

  ipcMain.handle("get-settings", () => {
    return ctx.databaseManager.getAllSettings();
  });

  ipcMain.handle("save-setting", (event, key, value) => {
    return ctx.databaseManager.setSetting(key, value);
  });

  ipcMain.handle("reset-settings", () => {
    // TODO: 实现重置设置功能
    return ctx.databaseManager.resetSettings();
  });

  // =====================================================
  // 文件操作
  ipcMain.handle("export-transcriptions", (event, format) => {
    // TODO: 实现导出转录功能
    return { success: true, path: "" };
  });

  ipcMain.handle("import-settings", () => {
    // TODO: 实现导入设置功能
    return { success: true };
  });

  ipcMain.handle("export-settings", () => {
    // TODO: 实现导出设置功能
    return { success: true, path: "" };
  });
};

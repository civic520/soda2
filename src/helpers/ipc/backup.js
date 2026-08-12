const { ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { CLOUD_PROVIDERS, detectCloudFolders } = require("../cloudProviders");
const { exportBackupToDir, restoreBackupFromFile } = require("../backup");

module.exports = function register(ctx) {
  const db = ctx.databaseManager;

  ipcMain.handle("backup-detect-clouds", () => {
    return detectCloudFolders(CLOUD_PROVIDERS);
  });

  ipcMain.handle("backup-export", async (event, { dir, filename }) => {
    const dirPath = dir || "";
    const name = filename || `soda2-backup-latest.json`;
    const result = await exportBackupToDir({ databaseManager: db, dir: dirPath, filename: name });
    return result;
  });

  ipcMain.handle("backup-pick-folder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "選擇雲端同步資料夾",
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: filePaths[0] };
  });

  ipcMain.handle("backup-pick-file", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "選擇要還原的備份檔",
      properties: ["openFile"],
      filters: [{ name: "Soda2 備份", extensions: ["json"] }, { name: "所有檔案", extensions: ["*"] }],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: filePaths[0] };
  });

  ipcMain.handle("backup-import", async (event, { filePath, scope }) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: "file_not_found" };
    }
    return restoreBackupFromFile({ databaseManager: db, filePath, scope });
  });

  ipcMain.handle("backup-get-status", () => {
    const status = {
      backup_cloud_dir: db.getSetting("backup_cloud_dir", ""),
      backup_auto_enable: db.getSetting("backup_auto_enable", false),
      backup_last_auto: db.getSetting("backup_last_auto", null),
    };
    if (status.backup_cloud_dir && !fs.existsSync(status.backup_cloud_dir)) {
      status.backup_cloud_dir_valid = false;
    } else {
      status.backup_cloud_dir_valid = !!status.backup_cloud_dir;
    }
    return status;
  });

  ipcMain.handle("backup-set-config", (event, { key, value }) => {
    const allowed = ["backup_cloud_dir", "backup_auto_enable", "backup_last_auto"];
    if (!allowed.includes(key)) return { success: false, error: "invalid_key" };
    db.setSetting(key, value);
    return { success: true };
  });
};

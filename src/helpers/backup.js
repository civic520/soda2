const fs = require("fs");
const path = require("path");

const APP_ID = "soda2";

function buildBackupJson(databaseManager) {
  const settings = databaseManager.getAllSettings();
  const dictionary = databaseManager.exportDictionary();
  return {
    app: APP_ID,
    version: "1.0",
    exportedAt: new Date().toISOString(),
    settings,
    dictionary,
  };
}

async function exportBackupToDir({ databaseManager, dir, filename }) {
  try {
    let targetDir = dir;
    // 若目標是磁碟根目錄（如 G:\ 或 G:），自動放入 Soda2Backup 子資料夾，避免污染雲端根目錄
    if (typeof dir === "string" && /^[A-Za-z]:[\\/]?$/.test(dir.trim())) {
      targetDir = path.join(dir, "Soda2Backup");
    }
    await fs.promises.mkdir(targetDir, { recursive: true });
    const json = buildBackupJson(databaseManager);
    const filePath = path.join(targetDir, filename);
    await fs.promises.writeFile(filePath, JSON.stringify(json, null, 2), "utf8");
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

function restoreBackup({ databaseManager, json, scope }) {
  try {
    if (!json || json.app !== APP_ID) {
      return { success: false, error: "not_soda2_backup" };
    }
    const s = json.settings && typeof json.settings === "object" ? json.settings : {};
    const d = Array.isArray(json.dictionary) ? json.dictionary : [];

    if (scope === "all" || scope === "settings" || scope === "style" || scope === "words") {
      if (scope === "all" || scope === "settings") {
        for (const key of Object.keys(s)) {
          databaseManager.setSetting(key, s[key]);
        }
      }
      if (scope === "all" || scope === "style") {
        if (s.ai_style_settings !== undefined) {
          databaseManager.setSetting("ai_style_settings", s.ai_style_settings);
        }
      }
      if (scope === "all" || scope === "words") {
        if (s.custom_words !== undefined) {
          databaseManager.setSetting("custom_words", s.custom_words);
        }
        databaseManager.importDictionary(d, "replace");
      }
      return { success: true, scope };
    }
    return { success: false, error: "invalid_scope" };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

async function restoreBackupFromFile({ databaseManager, filePath, scope }) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const json = JSON.parse(raw);
    return restoreBackup({ databaseManager, json, scope });
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

module.exports = { APP_ID, buildBackupJson, exportBackupToDir, restoreBackup, restoreBackupFromFile };

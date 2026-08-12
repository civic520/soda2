# 備份與還原 + 雲端同步資料夾引導 設計文件

日期：2026-08-12
狀態：已批准

## 目標

新增「備份與還原」設定分頁：
1. 一鍵匯出所有使用者自訂資料為單一 JSON 備份檔
2. 支援可選範圍還原（全部/設定/風格與詞庫/熱詞與辭典）
3. 雲端空間下拉：選擇本機雲端同步資料夾（OneDrive/Google Drive/Dropbox/Box/iCloud/Nextcloud/自選），備份檔直接存入，雲端客戶端自動同步上傳
4. 設定引導介面：教使用者如何安裝各雲端客戶端並建立同步資料夾
5. 可選手動+自動備份（每天一次）

## 需備份的自訂資料（全部存於 DB）

- `settings` 表全部 key：含 `ai_style_settings`（主 prompt + 自訂修飾模式 customModes + 專業詞庫 customDictionaries）、`custom_words`（熱詞）、及其他所有設定
- `dictionary` 表：自訂詞典（original/replacement/category/enabled）

## 架構

### 1. `src/helpers/cloudProviders.js`（新增）
雲端服務靜態定義 + 本機資料夾偵測：

| id | 名稱 | 安裝依賴 | 偵測資料夾（Windows） | 下載/設定頁 |
|----|------|---------|----------------------|------------|
| onedrive | OneDrive | Windows 內建 / Microsoft 帳戶 | `~/OneDrive`、`~/OneDrive - Personal` | https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage |
| gdrive | Google Drive | 安裝 Google Drive for desktop | `~/Google Drive`、`~/My Drive` | https://www.google.com/drive/download/ |
| dropbox | Dropbox | 安裝 Dropbox 桌面版 | `~/Dropbox` | https://www.dropbox.com/install |
| box | Box | 安裝 Box Drive | `~/Box` | https://www.box.com/drive |
| icloud | iCloud Drive | 安裝 iCloud for Windows（Microsoft Store） | `~/iCloud Drive` | https://apps.microsoft.com/detail/9pkszqfnhj7t |
| nextcloud | Nextcloud | 安裝 Nextcloud 桌面版 | `~/Nextcloud` | https://nextcloud.com/install/ |

每個 provider 結構：
```js
{ id, name, installNote (i18n key), steps: [i18n keys], folderCandidates: [paths], downloadUrl }
```

### 2. `src/helpers/backup.js`（新增）
- `detectCloudFolders(providers)`：對每個 provider 檢查 folderCandidates 是否存在，回傳 `{ id, detected: bool, path: string|null }`
- `buildBackupJson(databaseManager)`：讀 `getAllSettings()` + `exportDictionary()`，組 `{ app: 'soda2', version, exportedAt, settings, dictionary }`
- `exportBackupToDir({ databaseManager, dir, filename })`：寫 JSON 到指定目錄（mkdir recursive），回傳 `{ success, path }`
- `restoreBackup({ databaseManager, json, scope })`：scope 為 `all` | `settings` | `style` | `words`
  - `all`：寫回全部 settings + dictionary(replace)
  - `settings`：只寫回 settings
  - `style`：只寫回 `ai_style_settings`
  - `words`：只寫回 `custom_words` + dictionary(replace)
- `restoreBackupFromFile({ databaseManager, filePath, scope })`：讀 JSON 後呼叫上面

### 3. IPC `src/helpers/ipc/backup.js`（新增）
- `ipcMain.handle("backup-detect-clouds")` → detectCloudFolders
- `ipcMain.handle("backup-export", ({ dir, filename, isManual }))` → exportBackupToDir
- `ipcMain.handle("backup-pick-folder")` → dialog.showOpenDialog({ properties: ['openDirectory'] })
- `ipcMain.handle("backup-pick-file")` → dialog.showOpenDialog({ properties: ['openFile'], filters: [json] })
- `ipcMain.handle("backup-import", ({ filePath, scope }))` → restoreBackupFromFile
- `ipcMain.handle("backup-get-status")` → 讀 `backup_cloud_dir` / `backup_auto_enable` / `backup_last_auto`
- `ipcMain.handle("backup-set-config", ({ key, value }))` → 寫 `backup_cloud_dir` / `backup_auto_enable` / `backup_last_auto`

### 4. preload 新增
```js
backupDetectClouds, backupExport, backupPickFolder, backupPickFile, backupImport, backupGetStatus, backupSetConfig
```

### 5. 設定頁「備份與還原」分頁（settings.jsx）
- SETTINGS_TABS 加 `{ id: 'backup', labelKey: 'settings.tabs.backup', icon: Database }`
- 內容：
  1. **雲端空間**：下拉列出偵測結果（每個 provider 顯示名稱 + ✅/⚠️ 狀態）+ 自選資料夾 + 「重新偵測」
  2. **設定引導**：選中未安裝 provider 時顯示設定卡（安裝依賴、步驟 1-2-3、下載連結按鈕、重新偵測）
  3. **立即備份**：按鈕 → `backup-export` 到選定雲端資料夾（`soda2-backup-latest.json`），toast 顯示路徑
  4. **另存本機**：`backup-pick-folder` 後 `backup-export`
  5. **自動備份**：開關 + 說明（每天一次）
  6. **還原**：`backup-pick-file` → 範圍勾選（全部/設定/風格詞庫/熱詞辭典）→ `backup-import` → 提示重新載入

### 6. 自動備份排程（main.js）
- 啟動時（startApp 內）：若 `backup_auto_enable` 且 `backup_cloud_dir` 存在，讀 `backup_last_auto`；若距上次 > 24h → 執行自動備份（`soda2-backup-<ts>.json`）→ 更新 `backup_last_auto`

### 7. i18n 三語
- `settings.tabs.backup`
- `settings.backup.*`（雲端空間、立即備份、另存本機、自動備份、還原、範圍、引導步驟、provider 名稱與安裝說明等）

## 錯誤處理
- 未選雲端資料夾時點「立即備份」→ 提示先選擇
- 雲端資料夾不存在（未安裝）→ 下拉顯示 ⚠️，引導安裝
- 還原 JSON 格式錯誤 / 非 soda2 備份 → 拒絕並提示
- `backup-export` 寫檔失敗 → 回傳 `{ success: false, error }`，toast 錯誤

## 測試
- `test/backup.test.js`：
  - buildBackupJson 含 settings + dictionary
  - restoreBackup 各 scope 只寫回對應資料
  - restoreBackup 非 soda2 JSON → 拒絕
  - exportBackupToDir 產生檔案且內容可解析
- `test/cloud-providers.test.js`：
  - detectCloudFolders 對不存在資料夾回傳 detected:false
  - 每個 provider 有 folderCandidates、steps、downloadUrl

## 範圍（非目標）
- 不備份錄音檔（audio/）
- 不做雲端 API 直傳（只寫本機同步資料夾）
- 不實作現有 TODO stub（export-transcriptions/export-settings）

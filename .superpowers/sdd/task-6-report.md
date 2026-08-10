# Task 6 Report: 主進程整合（main.js、ipcHandlers、IPC）

## Status: DONE

## 改動的檔案與位置

### 1. `main.js`
- **Line 145**: 新增 `const LlamaManager = require("./src/helpers/llamaManager");`（在 `const sherpaManager = new SherpaManager(logger)` 下方）
- **Line 155-156**: 新增 `const llamaManager = new LlamaManager(logger);` 與 `llamaManager.setDatabaseManager(databaseManager);`（在 `sherpaManager.setDatabaseManager(databaseManager)` 下方）
- **Line 228**: IPCHandlers 注入物件新增 `llamaManager,`（放在 `sherpaManager,` 後方）
- **Line 280-285**: 啟動時若 `asr_model_type === "qwen3_asr_gguf"` 則呼叫 `llamaManager.startServer()`，失敗僅 warn 不阻擋應用

### 2. `src/helpers/ipcHandlers.js`
- **Line 9**: 建構子新增 `this.llamaManager = managers.llamaManager;`（在 `this.sherpaManager` 後方）

### 3. `src/helpers/ipc/transcription.js`
- **Line 5-7**: 模組頂部（`module.exports` 上方）新增 `isGgufModel(ctx)` helper
- **Line 106-122**: `check-model-files` — GGUF 模式分派到 `llamaManager.checkModelFiles()`，server 狀態改用 `llamaManager.serverReady / serverProcess`
- **Line 124-128**: `get-download-progress` — GGUF 模式分派到 `llamaManager.getDownloadProgress()`
- **Line 130-142**: `download-models` — GGUF 模式先 `ensureLlamaBinary`（進度以 overall_progress 除二送出 `downloading-binary` stage）再 `ensureModelAvailable`
- **Line 145-150**: `transcribe-audio` — GGUF 模式分派到 `llamaManager.transcribeAudio(audioData, options)`
- **Line 375-380**: `check-model-exists` — `modelType === "qwen3_asr_gguf"` 時用 `llamaManager.checkModelFiles()`
- **Line 388-393**: `delete-model-files` — GGUF 模式分派到 `llamaManager.deleteModelFiles()`
- **Line 435-441**: `restart-sherpa-server` — GGUF 模式分派到 `llamaManager.restartServer()`

### 未改動
- `preload.js`：brief 註明無需改動（transcribeAudio 已存在）
- `download-model`（單數，現於 transcription.js:332）：舊 handler，preload 不使用，brief 註明不需改動
- `copy-model-to-custom`、`get-model-path`、`switch-model` 等其他 handler：brief 未要求改動

## 驗證結果

- `node --check main.js` → OK
- `node --check src/helpers/ipcHandlers.js` → OK
- `node --check src/helpers/ipc/transcription.js` → OK
- `node --check src/helpers/llamaManager.js` → OK
- eslint：`node_modules` 未安裝（專案無根目錄/`src/` 的 eslint config，僅 `web/eslint.config.js`），global eslint 無 config 無法有效 lint。與 Task 5 report 相同之既有環境限制。以 `node --check` 為主要驗證（brief 允許）。

## 介面核對
已核對 `src/helpers/llamaManager.js` 實際存在所有被呼叫的方法/屬性：
- `setDatabaseManager(databaseManager)` (L31)、`ensureLlamaBinary(cb)` (L188)、`ensureModelAvailable(cb)` (L210)、`checkModelFiles()` (L256)、`getDownloadProgress()` (L290)、`deleteModelFiles()` (L315)、`startServer()` (L411)、`stopServer()` (L480)、`restartServer()` (L490)、`transcribeAudio(audioBlob, options)` (L501)、`serverReady`、`serverProcess` 屬性

## 疑慮
1. `check-model-files` handler 原有的 `console.log` debug 輸出與舊註解被 brief 的精確程式碼取代（符合 brief）。
2. `restart-sherpa-server` 原本有 try/catch 與 logger 包覆，brief 的精確程式碼將其簡化為直接分派；`sherpaManager.restartServer()` / `llamaManager.restartServer()` 內部是否有錯誤處理需在 Task 9 手動驗證。
3. `download-models` GGUF 分支呼叫 `event.sender.send` — 若 sender 已摧毀（視窗關閉）可能拋錯；與 sherpa 既有路徑相同模式，維持一致。
4. brief 要求 require 放在 main.js 中部（manager 初始化區）而非頂部 require 區，已照 brief 精確放置。

## Commit
- `feat: wire llamaManager into main process and ipc dispatch`
- 僅 stage 三個程式碼檔：`main.js src/helpers/ipcHandlers.js src/helpers/ipc/transcription.js`（不含 .superpowers 報告與未追蹤檔案）

## 審查修正（Review Fix）

### Fix 1（Important）：`retranscribe-transcription` 未分派到 GGUF 後端
- **`src/helpers/llamaManager.js`**：新增 `transcribeFilePath(audioPath, options)` 方法（`transcribeAudio` 之後）。語意仿照 `sherpaManager.transcribeFilePath`，但走 llamaManager 自己的管道：未就緒時 `startServer()` → `fs.promises.readFile(audioPath)` → `transcribeAudio(blob, options)` → 回傳 `{ success, text, raw_text, confidence: result.confidence || 0.95, language: result.language || "zh-CN" }`。`fs` 原本即於檔案頂部 require，無需新增。
- **`src/helpers/ipc/transcription.js`**：`retranscribe-transcription` handler（原 L282）改為分派：
  ```javascript
  const result = isGgufModel(ctx)
    ? await ctx.llamaManager.transcribeFilePath(record.audio_path, options)
    : await ctx.sherpaManager.transcribeFilePath(record.audio_path, options);
  ```
  `isGgufModel` helper 已於檔案頂部（L5-7）定義，無需改動。

### Fix 2（Minor）：刪除 main.js 額外註解
- **`main.js`**（原 L280）：刪除 `// 若當前模型是 GGUF，啟動時同步初始化 llama-server（失敗不阻擋應用）`（brief 沒有，屬額外加註）。`if` 條件與 `.catch` 邏輯未動。

### 驗證
- `node --check src/helpers/llamaManager.js` / `src/helpers/ipc/transcription.js` / `main.js` → 全部 OK
- `node --test test/llama-manager.test.js` → 12/12 pass
- `transcribeFilePath` 未加測試（非必要；其路徑與既有 `transcribeAudio` 相同，HTTP 互動已有其他測試覆蓋）

### Commit
- 修正 commit：`fix: retranscribe dispatch to llama in gguf mode; drop extra comment in main.js`

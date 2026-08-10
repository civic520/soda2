# Final Review Fix Report — qwen3-asr-gguf

## Status
DONE

## Branch
`qwen3-asr-gguf`（未切換）

## 修正總覽

| 項目 | 嚴重度 | 檔案 | 方式 |
|------|--------|------|------|
| C1 | Critical | `src/helpers/llamaManager.js` | `startServer()` 加上 `initializationPromise` 並發去重；原邏輯改名 `_startServerInternal()` |
| C2 | Critical | `main.js` | `will-quit` handler 加入 `llamaManager.stopServer().catch(() => {})` |
| I1 | Important | `src/helpers/llamaManager.js` | 新增 `_persistAudio(blob)` helper；`transcribeAudio` 轉錄成功後持久化音訊並回傳 `audio_path` |
| I2 | Important | `llamaManager.js` + `transcription.js` | 統一單調遞增進度契約：binary overall 0-50、model overall 50-100、移除二次 `/2` |
| I3 | Important | `src/helpers/ipc/transcription.js` | `switch-model` 切換後停止非作用引擎（`_stopSherpaServer` / `stopServer`） |
| I4 | Important | `main.js` | GGUF 啟動前先 `checkModelFiles()`，僅模型已下載才 `startServer()` |

---

## C1: startServer() 無並發保護
`llamaManager.js`：

- 新增 `startServer()` wrapper，用 `this.initializationPromise` 去重；重疊呼叫回傳同一個 promise。
- 原 `startServer()` 內容改名 `_startServerInternal()`（保留 `if (this.serverProcess) return;`）。
- 成功後（`this.serverReady = true` 後）清空 `this.initializationPromise`；失敗時在 wrapper 的 `.catch` 清空，可重試。
- `stopServer()` 也清空 `this.initializationPromise`，避免「啟動中切走模型 → 再切回」回傳舊的 stale promise。
- 確認其他呼叫點（`restartServer`、`transcribeAudio`、`transcribeFilePath`、`main.js`）皆只是 `await startServer()`，不受影響。

## C2: 應用退出時 llama-server 不被停止
`main.js` `will-quit` handler：

```javascript
app.on("will-quit", () => {
  llamaManager.stopServer().catch(() => {});
  globalShortcut.unregisterAll();
  typelessManager.cleanup();
});
```

## I1: GGUF 轉錄永不持久化音訊
`llamaManager.js`：

- 新增 `_persistAudio(blob)`：寫入 `userData/audio/rec_<uuid>.wav`（`fs.promises.mkdir` + `fs.promises.writeFile`，背景執行），回傳目標路徑；失敗回 null。
- `transcribeAudio` 回傳前計算 `audio_path`：讀取 `save_audio` 設定（fallback `save_audio_files`，預設 true）；`options.no_persist` 或 `options.save_audio === false` 或 `save_audio` 關閉時回 null。與 sherpaManager 語意一致。

## I2: 下載進度契約壞掉
- `llamaManager.ensureLlamaBinary`：binary 階段 `overall_progress` 保持在 0-50（`progress/2`）；`finished` 從 100 改為 **50**。
- `llamaManager.ensureModelAvailable`：下載中 `overall_progress = 50 + pct/2`（落在 50-100）；`finished` 保持 100。
- `transcription.js` `download-models` GGUF 分支：移除 binary 回呼裡額外的 `/2`，直接轉發 `ensureLlamaBinary` 與 `ensureModelAvailable` 的事件。
- 結果：overall 單調遞增 0 → 50 → 100，不再出現 100% 跳回 0% 或最高 25%。

## I3: 切換模型不停止另一引擎
`transcription.js` `switch-model`：

- 寫 DB 後，新模型為 `qwen3_asr_gguf` → `await ctx.sherpaManager._stopSherpaServer()`（sherpaManager 實際方法名）；否則 → `await ctx.llamaManager.stopServer()`。
- 保留 `{ success: true }` 回傳結構。

## I4: GGUF 啟用時自動靜默下載 ~1.9GB
`main.js` GGUF 啟動邏輯：

- 改為 `llamaManager.checkModelFiles().then(...)`：`models_downloaded === true` 才 `startServer()`；否則 `logger.info` 等待使用者手動下載。
- 加 `.catch` 避免未處理 rejection。

---

## 測試

```
node --check src/helpers/llamaManager.js            → 通過（無輸出）
node --check main.js                                 → 通過（無輸出）
node --check src/helpers/ipc/transcription.js        → 通過（無輸出）

node --test test/llama-manager.test.js
  tests 19, pass 19, fail 0
  （既有 12 + 新增 7）

node --test test/streaming-model-download.test.js test/streaming-mode-support.test.js
  tests 7, pass 7, fail 0
```

新增測試（`test/llama-manager.test.js`）：
1. `startServer deduplicates concurrent calls (single spawn)` — mock 延遲 spawn，兩次 `startServer()` 只 spawn 一次。
2. `startServer resets initializationPromise after failure so it can be retried` — 失敗後可重試。
3. `_persistAudio writes blob into userData/audio and returns the path` — 持久化寫入與路徑。
4. `transcribeAudio returns null audio_path when save_audio disabled` — `save_audio=false` / `no_persist` → null。
5. `transcribeAudio persists audio_path when save_audio enabled` — 預設設定 → 非 null 且檔案存在。
6. `ensureLlamaBinary caps overall_progress at 50 for binary stage` — binary overall ≤ 50、finished = 50。
7. `ensureModelAvailable reports overall_progress in 50-100 range` — model overall ∈ [50,100]、finished = 100。

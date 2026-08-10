# Task 3 Report: llamaManager 下載與模型檔案管理

## Status
DONE_WITH_CONCERNS

## Branch / Commit
- Branch: `qwen3-asr-gguf`（未切換）
- Commit: `b8dbadf` — `feat: add llamaManager download and model file management`

## 實作的方法
於 `src/helpers/llamaManager.js` 骨架類別內新增（程式碼照 brief，未加註解）：

- `downloadFile(url, destPath, progressCallback)` — Promise 下載，支援 307/3xx 重定向（含相對 `location` 以 `new URL(location, url).href` 解析）、HTTP 非 200 失敗清理、`content-length` 進度回報
- `extractZip(zipPath, targetDir)` — win32 走 PowerShell `Expand-Archive`，其他平台走 `unzip -o`
- `_forceDeletePath(filePath)` — 三層刪除升級：`unlinkSync` → `chmodSync`+`unlinkSync` → win32 `attrib -R & del /F /Q /A`
- `_getExistingFileSize(filePath)` — 安全 stat，失敗時嘗試 `_forceDeletePath`
- `ensureLlamaBinary(progressCallback)` — 二進位已存在則跳過；否則下載 `binary_url` zip、解壓到 `getBinaryDir()`、刪除 zip、驗證 `llama-server(.exe)` 存在
- `ensureModelAvailable(progressCallback)` — 依 `checkModelFiles()` 跳過；否則清空模型目錄、依 `required_files` + `mmproj_url`（`mmproj` 前綴檔名走 `mmproj_url`）依序下載，失敗時 fallback 官方來源，0 bytes 拋錯，整體進度回報
- `checkModelFiles()` — 回傳 `{ success, models_downloaded, missing_models, directory_exists, details }`，含 mmproj 分支
- `getDownloadProgress()` — 以主 GGUF 檔大小 / `expected_size` 計算進度
- `deleteModelFiles()` — 遞迴刪除模型目錄

## 測試
`test/llama-manager.test.js` 追加 3 個新測試（既有 Task 2 的 3 個保留）：
1. `checkModelFiles reports not downloaded when model dir missing`
2. `checkModelFiles reports downloaded when gguf exists with size`
3. `downloadFile follows redirects with relative location`

執行指令：`node --test test/llama-manager.test.js`

```
✔ llama model config exposes gguf required files
✔ llama model cache path resolves under userData/models
✔ llama server binary path points at llama-server.exe on win32
✔ checkModelFiles reports not downloaded when model dir missing
✔ checkModelFiles reports downloaded when gguf exists with size
✔ downloadFile follows redirects with relative location
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

語法檢查：`node --check src/helpers/llamaManager.js`、`node --check test/llama-manager.test.js` 皆通過。

## 流程
- Step 1：追加 3 個失敗測試（照 brief 原文）
- Step 2：執行 → 如預期 FAIL（`manager.checkModelFiles is not a function`、`manager.downloadFile is not a function`）
- Step 3：照 brief 實作新增方法
- Step 4：執行 → 2 個測試仍失敗（原因見下），修正測試 mock 後 6/6 通過
- Step 5：commit `b8dbadf`

## 疑慮 / 偏離 brief
1. **測試 2 需同時寫入 mmproj 檔**：brief 的測試只建立 GGUF 檔並斷言 `models_downloaded === true`，但 brief 自身的備註（Task 2 config 已含 `mmproj_url`，mmproj 分支必要且會執行）與實作程式碼中「mmproj 缺失 → `missingFiles` 非空 → `models_downloaded=false`」互相矛盾。測試照實作改為在 `config.mmproj_url` 存在時一併寫入 `path.basename(config.mmproj_url)`，以符合 brief 的備註語意。
2. **測試 3 的 mock response 缺 `.on`/`.pipe`，且 stub stream 的 `on`/`close` 為 no-op**：對照 brief 的實作，200 路徑呼叫 `response.on("data", ...)`、`response.pipe(file)` 必然 TypeError，且 `file.on("finish", () => file.close(resolve))` 永遠不會觸發（promise 永不 resolve / 卡住）。測試 mock 改為：200 response 用 `node:events` EventEmitter 加上 `pipe`（驅動 `stream.end()` 並 nextTick 發 `data`/`end`）；stub stream 的 `end()` nextTick 觸發已註冊的 `finish` handler、`close(cb)` 呼叫 cb，使 promise 正常 resolve。斷言（`calls.length >= 2`、`calls[1]` 含 `huggingface.co`）與 brief 一致。
3. **`ensureModelAvailable` 的 fallback 字串**：`config.url.replace("voconly/Qwen3-ASR-1.7B-gguf", "foryoung365/Qwen3-ASR-1.7B-Q4_K_M-GGUF")` 照 brief 保留。但現行 Task 2 config 的 `url` 已是 `foryoung365/Qwen3-ASR-1.7B-Q4_K_M-GGUF`，不含 `voconly/Qwen3-ASR-1.7B-gguf`，故 `replace` 為 no-op，fallback 與主 URL 相同。Task 4 定案來源時應確認此 fallback 是否仍需要、是否改為備援鏡像。
4. **`ensureModelAvailable` 使用 `fs.rmSync(targetDir, { recursive: true, force: true })`**（照 brief）。專案既有 EPERM 經驗（sherpaManager）指出此 API 在壞 ACL 檔案上可能中途中止；llama 模型目錄若重現該情況，應比照 sherpaManager 改用逐檔容錯刪除。屬後續強化點。

---

# 審查修正（subagent）— 2026-08-10

## Status
DONE

## Commit
- Branch: `qwen3-asr-gguf`（未切換）
- Commit: 見下方 `git log`（本次修正 commit）

## 修正項目（依審查優先序）

### Critical：`fs.rmSync` → 逐檔容錯 `_removeDirectoryRecursive`
- 新增 `_removeDirectoryRecursive(dirPath)`（仿 sherpaManager.js:791）：`existsSync` 前檢、`readdirSync` 失敗時 `_forceDeletePath`、逐 entry 以 `lstatSync` 判斷目錄（遞迴）或檔案（`_forceDeletePath`）、`EPERM` 時強制刪除、單檔失敗不中止、最後 `rmdirSync`（`ENOENT` 忽略）。
- `ensureModelAvailable()` 與 `deleteModelFiles()` 的 `fs.rmSync(targetDir, { recursive: true, force: true })` 全部改為 `this._removeDirectoryRecursive(targetDir)`。

### Important：`getDownloadProgress` 計算所有應有檔案
- 由僅量 `required_files[0]` 改為累加 `required_files` + `path.basename(config.mmproj_url)` 中每個存在檔案的實際大小，再除以 `expected_size`。完成時可達 100%。

### Minor
1. `_forceDeletePath` 補第四層：win32 下 `takeown /F & icacls /grant Everyone:F & del /F /Q /A`；所有 `execSync` 加 `timeout: 10000`（並把 `execSync` 提升為 top-level require，不再內嵌 require）。
2. `ensureLlamaBinary` 完成時補發 `{ stage: "finished", model: "asr", progress: 100, overall_progress: 100 }`。
3. `_getExistingFileSize` 改為：stat 成功回 size（>0 否則 0）；stat 失敗僅在 `EPERM` 時 `_forceDeletePath` 並回 0，其他錯誤 rethrow（與 sherpaManager 一致）。
4. `ensureModelAvailable` 移除每檔開頭 `overall_progress: 0` 的重置 callback（避免雙檔下載時進度鋸齒）。

## 測試
既有測試全數通過，並新增 1 個測試：`deleteModelFiles returns success when model directory does not exist`（目錄不存在不拋錯，回 `{ success: true }`）。

執行指令：`node --test test/llama-manager.test.js`

```
✔ llama model config exposes gguf required files
✔ llama model cache path resolves under userData/models
✔ llama server binary path points at llama-server.exe on win32
✔ checkModelFiles reports not downloaded when model dir missing
✔ checkModelFiles reports downloaded when gguf exists with size
✔ deleteModelFiles returns success when model directory does not exist
✔ downloadFile follows redirects with relative location
ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ duration_ms 188.7074
```

語法檢查：`node --check src/helpers/llamaManager.js` 與 `node --check test/llama-manager.test.js` 皆通過。

## 未修改
- fallback `replace("voconly/...", "foryoung365/...")` 保留（Task 4 處理）。
- `downloadFile` 重定向邏輯未動（既有測試覆蓋）。

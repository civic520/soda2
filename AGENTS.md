# AGENTS.md

此文件为在此代码库中工作的AI助手提供指导。

## 项目管理

- **GitHub Project**: https://github.com/users/username/projects/2
- 所有任务、功能开发和Bug跟踪都在项目看板中管理
- 开发进度和里程碑规划可在项目看板中查看

## 非标准构建命令

- `pnpm run dev` - 同时运行渲染进程(Vite)和主进程(Electron)
- `pnpm run dev:renderer` - Vite开发服务器必须从`src/`目录运行(不是根目录)
- `pnpm run build:renderer` - 任何Electron构建命令之前都必须先执行此命令
- `pnpm run prepare:python` - 下载并准备嵌入式Python环境(包含所有依赖)
- `pnpm run prepare:python:info` - 查看嵌入式Python环境信息
- `pnpm run test:python` - 测试嵌入式Python环境是否正常工作
- `pnpm run test:python:info` - 显示Python环境测试详细信息
- `pnpm run clean` - 清理构建文件和Python环境
- 所有构建命令(`build:mac`, `build:win`, `build:linux`)现在自动执行`prepare:python`

## 关键架构模式

### FunASR服务器通信
- Python服务器(`funasr_server.py`)通过stdin/stdout进行JSON消息通信
- 音频转录前必须启动服务器(由`funasrManager.js`处理)
- 音频文件在系统临时目录创建，不在项目目录
- FunASR模型下载到用户数据目录，不是项目目录
- 支持模型自动下载和状态监控(`download_models.py`)
- 模型缺失时提供优雅的错误处理和下载提示
- 新增模型文件检查机制，避免未下载模型时的初始化错误

### IPC架构(非标准)
- 所有Electron IPC处理器集中在`src/helpers/ipcHandlers.js`
- F2热键使用自定义双击检测，带发送者跟踪以防止内存泄漏
- 录音状态通过`hotkeyManager.js`在主进程和渲染进程间同步
- 新增模型管理IPC接口：`check-model-files`, `download-models`, `get-download-progress`
- 模型下载进度通过`model-download-progress`事件实时推送

### 窗口管理
- 主窗口和控制面板是独立的BrowserWindow实例
- 历史窗口加载`src/history.html`(与主应用分离的入口点)
- 所有窗口使用`preload.js`进行安全API暴露

### 数据库架构
- 使用better-sqlite3，自定义架构在`src/helpers/database.js`
- 转录表同时存储raw_text(FunASR)和processed_text(AI优化)
- 设置在键值表中JSON序列化存储

## 项目特定约定

### 文件组织
- `src/helpers/`中的文件是管理器类(不是工具函数)
- `src/hooks/`中的钩子遵循Electron集成的自定义模式
- Python脚本(`funasr_server.py`, `download_models.py`)在项目根目录，不在src/
- `scripts/`目录包含构建时脚本：
  - `prepare-embedded-python.js` - 嵌入式Python环境准备
  - `test-embedded-python.js` - Python环境测试和验证
- `python/`目录包含嵌入式Python运行时(构建时生成，在.gitignore中)

### 环境变量
- `ELECTRON_USER_DATA`由主进程设置，供Python脚本日志使用
- AI API配置通过应用内设置面板进行配置
- 开发模式通过`NODE_ENV=development`检测

### CSS架构
- 使用Tailwind 4.x，带中文字体优化
- 自定义CSS类：`.chinese-content`、`.chinese-title`、`.status-text`
- 硬编码WCAG 2.1兼容的对比度比例在CSS变量中
- Electron特定类：`.draggable`、`.non-draggable`

### 音频处理
- 音频以WAV格式在临时文件中处理
- FunASR处理VAD(语音活动检测)和标点恢复
- AI文本处理在FunASR转录完成后进行

### 日志管理
- 必须使用`src/helpers/logManager.js`而非console.log
- 应用日志和FunASR日志分别存储在用户数据目录
- 提供`logFunASR()`方法专门记录FunASR相关日志
- 日志以JSON格式存储，支持结构化查询
- 嵌入式Python环境通过`ELECTRON_USER_DATA`环境变量获取日志路径

## 关键注意事项

### 路径解析
- Vite配置使用`src/`作为基础目录，影响所有相对导入
- 生产构建引用`app.asar.unpacked`中的Python脚本和嵌入式Python环境
- 资源路径从src目录使用`../assets`
- 嵌入式Python环境路径：
  - 开发模式：`项目根目录/python/bin/python3.11`
  - 生产模式：`process.resourcesPath/app.asar.unpacked/python/bin/python3.11`

### Python集成
- 使用完全隔离的嵌入式Python环境(Python 3.11.6)
- 嵌入式环境包含所有必需依赖：numpy<2, torch==2.0.1, torchaudio==2.0.2, librosa>=0.11.0, funasr>=1.2.7
- FunASR安装需要特定模型版本(v2.0.4)
- Python进程生成使用`windowsHide: true`选项
- 完全隔离的环境变量设置：PYTHONHOME, PYTHONPATH, PYTHONDONTWRITEBYTECODE
- 清除系统Python环境变量干扰：PYTHONUSERBASE, PYTHONSTARTUP, VIRTUAL_ENV
- macOS代码签名权限配置支持Python扩展和JIT编译(`entitlements.mac.plist`)

### 状态管理
- 无外部状态库 - 使用React hooks配合Electron IPC
- 录音状态必须在进程间手动同步
- 窗口可见性状态影响热键注册

### 开发vs生产环境
- 开发模式有2秒延迟等待Vite启动
- 生产模式使用嵌入式Python环境，无需系统Python依赖
- 日志文件位置在开发和生产构建中不同
- 构建流程自动准备嵌入式Python环境和模型文件
- 构建产物包含完整的Python运行时(约1GB+)

## 新增功能架构

### 嵌入式Python环境
- 基于python-build-standalone项目的独立Python运行时
- 支持macOS ARM64和x86_64架构自动检测
- 包含完整的科学计算栈：numpy, torch, librosa等
- 构建时自动下载、安装和验证所有依赖
- 生产环境完全独立，不依赖系统Python

### 模型管理系统
- 三个核心模型：ASR(语音识别)、VAD(语音活动检测)、PUNC(标点恢复)
- 模型文件检查机制，支持大小和完整性验证
- 并行下载所有模型，支持实时进度显示
- 模型缺失时的优雅降级和用户提示
- 模型状态指示器组件提供可视化反馈

### 构建系统增强
- macOS代码签名和公证支持
- 嵌入式Python环境自动打包
- 构建前自动准备Python环境和依赖验证
- 支持清理命令移除Python环境和构建缓存

## Session Anchored Summary

### Goal
Fix startup crash (404 on model files) + fix whisper download failures + fix hotkey not stopping recording

### Hotkey Toggle Critical Context (DO NOT BREAK)
- `typelessManager.js:91-94`: gap uses `lastToggleTime` (not `lastKeyDownTime`) — auto-repeat keydowns must NOT reset the gap timer; this ensures missed-keyup recovers within one press
- `App.jsx:1162-1173`: stop listener checks `recordingStartedRef` (synchronous) instead of `isRecordingNormalRef.current` (React-render-driven) — IPC race condition fix
- `App.jsx:1139-1141`: `recordingStartedRef` resets to `false` when `isRecording` becomes false via other paths

### Download Critical Context (DO NOT BREAK)
- `sherpaManager.js:300-304`: relative redirect URLs resolved via `new URL(location, url).href` — `small-tokens.txt` returns 307 with relative `/api/resolve-cache/...`
- `sherpaManager.js:410-414`: skip existing files with non-zero size before download
- `main.js:153-162`: if whisper small-tokens.txt is missing/0-bytes at startup, auto-fallback to sense_voice
- `settings.jsx:1296-1303`: "目前作用中" badge checks `modelStatuses[selectedModelType]` too
- `settings.jsx:1322-1327`: download completion calls `restartSherpaServer()` to auto-activate

### Relevant Files
- `src/helpers/typelessManager.js:84-109` — toggle gap logic
- `src/App.jsx:1159-1187` — TypeLess IPC listeners
- `src/helpers/sherpaManager.js:300-304`, `410-414` — download with redirect handling
- `main.js:153-162` — startup model fallback
- `src/settings.jsx:1296-1303`, `1322-1327` — badge & auto-load

## Session 2 Anchored Summary

### Goal
Fix model deletion failing with `EPERM` on `small-tokens.txt` (broken ACL on Windows), preventing delete, re-download, and server startup.

### Root Cause
`small-tokens.txt` has a broken Windows ACL — `lstat`/`stat`/`unlink` all return `EPERM`, but `readdir` succeeds. `fs.rmSync(dir, { recursive: true })` is all-or-nothing: when it hits the EPERM file it aborts, leaving the directory half-deleted. Server can't start with missing files → `serverReady = false` → all transcription fails.

### Changes in sherpaManager.js
- **Line 1**: Added `execSync` to top-level `require("child_process")`
- **Lines 287-308**: Pre-download cleanup in `downloadModels` — runs `_removeDirectoryRecursive`, if files remain (ACL broken), renames whole directory aside via `fs.renameSync` (Windows `MoveFileEx` only updates the dir entry, unaffected by single-file ACL issues), then creates fresh directory
- **Lines 530-558**: `deleteModelFiles` — first tries `fs.renameSync` to move the entire model directory to `path.deleted.TIMESTAMP` (works even with un-deletable files); falls back to `_removeDirectoryRecursive` if rename fails
- **Lines 561-595**: `_removeDirectoryRecursive(dirPath)` — per-entry error handling, never aborts on single file failure
- **Lines 597-613**: `_getExistingFileSize(filePath)` — safe stat that catches `EPERM`; also calls `_forceDeletePath` when `existsSync` returns false (it can return false due to EPERM)
- **Lines 615-649**: `_forceDeletePath(filePath)` — four-tier escalation: `unlinkSync` → `chmodSync+unlinkSync` → `attrib -R + del /F /Q /A` → `takeown + icacls Everyone:F + del`
- **Lines 175-182**: `checkModelFiles` now uses `_getExistingFileSize` instead of raw `fs.statSync`
- **Lines 397-452**: Download skip-check and post-download use `_getExistingFileSize`
- **Added `directory_exists` field** to `checkModelFiles` return value

### Changes in settings.jsx
- **New state `modelDirsExist`**: tracks whether model directory exists (separate from `modelStatuses` which tracks fully-downloaded)
- **Line 1410**: Delete button shows when `modelStatuses || modelDirsExist` (was only `modelStatuses`)
- **New "重新掃描目錄" button**: appears when model not detected; calls `checkModelExists` directly, and if files found, auto-switches model + restarts server

### EPERM Critical Context (DO NOT BREAK)
- `fs.rmSync` with `recursive: true` is all-or-nothing — always use `_removeDirectoryRecursive` which handles per-file errors
- `fs.existsSync` can return `false` even when a file physically exists (catches EPERM from lstat) — always have a fallback
- On Windows with pathological ACL issues, `fs.renameSync` on the parent directory is the most reliable escape hatch because `MoveFileEx` only touches the directory entry
- The four-tier `_forceDeletePath` should be the standard way to delete files that might have permission issues

## Session 2 Anchored Summary

### Goal
Fix model deletion failing with `EPERM` on `small-tokens.txt` (broken ACL), preventing both delete and re-download.

### Root Cause
`small-tokens.txt` (816KB, correctly downloaded) has a broken Windows ACL — `lstat` fails with `EPERM`, but `readdir` succeeds. The old `fs.rmSync(dir, { recursive: true, force: true })` is all-or-nothing: when it hits the EPERM file, it aborts entirely, leaving a partially-deleted directory in an inconsistent state. Re-download then fails because the surviving file blocks subsequent file operations.

### Changes Made
- **`sherpaManager.js:1`**: Added `execSync` to top-level `require("child_process")` (removed duplicate inline require)
- **`sherpaManager.js:514-528`**: Replaced `fs.rmSync` with `_removeDirectoryRecursive` that handles each entry individually — EPERM on one file no longer aborts the entire delete
- **`sherpaManager.js:526-560`**: `_removeDirectoryRecursive(dirPath)` — reads directory via `readdirSync`, processes files/dirs individually, continues on error
- **`sherpaManager.js:562-574`**: `_getExistingFileSize(filePath)` — safe stat that catches EPERM, tries force-delete, returns 0 if unresolvable
- **`sherpaManager.js:576-602`**: `_forceDeletePath(filePath)` — three-tier escalation: `unlinkSync` → `chmodSync+unlinkSync` → `execSync("attrib -R + del /F /Q /A")`
- **`sherpaManager.js:178`**: `checkModelFiles` now uses `_getExistingFileSize` instead of raw `fs.statSync`
- **`sherpaManager.js:399,409,447`**: Download skip-check and post-download verification now use `_getExistingFileSize`

### EPERM Critical Context (DO NOT BREAK)
- `fs.rmSync` with `recursive: true` is an all-or-nothing operation — do NOT use it on model directories; always use `_removeDirectoryRecursive` which handles per-file errors
- `fs.existsSync` can return `false` even when a file physically exists (if `lstat` fails with EPERM it catches the error) — always have a fallback like `_getExistingFileSize`
- `fs.statSync`, `fs.lstatSync`, `fs.unlinkSync` all throw `EPERM` for files with broken ACLs on Windows
- `execSync` with `attrib -R` + `del /F /Q /A` is the last-resort deletion mechanism on Windows; on non-Windows it's harmless (the commands just won't exist)
- The three-tier `_forceDeletePath` (unlink → chmod+unlink → cmd del) should be the standard way to delete any file that might have permission issues

## Session 3 Anchored Summary

### Goal
Fix recording toggle (F2 hotkey + click button) getting stuck when model goes down mid-recording.

### Root Cause
`toggleRecordingByHotkey` and `handleClickRecording` both called `checkModelReady()` FIRST, before checking `isRecording`. If the model became unready (server down, EPERM on model files) while recording was active, pressing F2 to stop would hit the model check, return early, and never reach `stopRecording()`. Recording indicator stuck forever.

### Changes (App.jsx)
- **Lines 893-903**: `toggleRecordingByHotkey` — check `isRecording` first; stop always works even if model is down; model readiness only blocks starting, not stopping
- **Lines 905-916**: `handleClickRecording` — same pattern

### Critical Context (DO NOT BREAK)
- In ALL recording toggles: stop path must NEVER be gated by model readiness checks
- Pattern: `if (isRecording) { stopRecording(); return; }` before any `checkModelReady()`

## Session 4 Anchored Summary

### Goal
Fix ALT key TypeLess toggle — floating recording indicator appears correctly but doesn't disappear on second press (intermittent).

### Root Cause (Race Condition)
`createTypelessIndicatorWindow()` is `async` (loads a URL). The sequence:
1. First ALT press → `showTypelessIndicator()` → starts `createTypelessIndicatorWindow()` (async, `this.typelessIndicatorWindow` is still null)
2. Second ALT press (quickly, before creation finishes) → `hideTypelessIndicator()` → checks `this.typelessIndicatorWindow` → null → does NOTHING
3. Window creation completes → window appears on screen → stuck forever

### Changes
- **windowManager.js:473-499**: Added `_typelessIndicatorHidePending` flag — if `hideTypelessIndicator()` is called while window is being created, the creation callback skips `.show()` entirely
- **main.js:263**: Pre-create `createTypelessIndicatorWindow()` at startup — eliminates the window-creation delay on first use

### Critical Context (DO NOT BREAK)
- `createTypelessIndicatorWindow()` is async — ANY code that shows/hides the indicator must handle the case where the window doesn't exist yet
- Always use `_typelessIndicatorHidePending` when adding new show/hide logic for the typeless indicator

## Session 5 Anchored Summary

### Goal
Fix Qwen3-ASR model showing "載錄失敗" (loading failed) despite all files being present.

### Root Cause (Wrong API + Wrong File Check)
The code used `from_qwen_audio` (non-existent, fallback to `from_paraformer`) and expected a combined `model.int8.onnx` + `tokenizer.json`. But the sherpa-onnx API is **`from_qwen3_asr`**, which takes **split files**:
- `conv_frontend` → `conv_frontend.onnx`
- `encoder` → `encoder.int8.onnx`
- `decoder` → `decoder.int8.onnx`
- `tokenizer` → `tokenizer/` **directory** (not a single file)

The model files on disk (`encoder.int8.onnx`, `decoder.int8.onnx`, `conv_frontend.onnx`, `tokenizer/`) were the correct format all along — the JS code and Python server both had the wrong expected filenames and wrong loading API.

### Changes
- **sherpaManager.js:32-36**: `required_files` changed from `["model.int8.onnx", "tokenizer.json"]` to `["encoder.int8.onnx", "decoder.int8.onnx", "conv_frontend.onnx", "tokenizer/vocab.json"]`; `expected_size` updated to 982MB (sum of split files)
- **sherpa_server.py:819-829**: File check uses `conv_frontend.onnx` + `encoder.int8.onnx` + `decoder.int8.onnx` + `tokenizer/` directory
- **sherpa_server.py:862-870**: Changed from `from_qwen_audio(model=..., tokens=...)` fallback chain to `from_qwen3_asr(conv_frontend=..., encoder=..., decoder=..., tokenizer=...)`
- **sherpaManager.js:403-409**: Temp tar.bz2 cleanup uses `_forceDeletePath` instead of `fs.unlinkSync` (EPERM resilience)

### Qwen3-ASR Critical Context (DO NOT BREAK)
- `from_qwen3_asr` API requires **4 separate paths**:
  - `conv_frontend`: `{model_dir}/conv_frontend.onnx`
  - `encoder`: `{model_dir}/encoder.int8.onnx` (or `.onnx`)
  - `decoder`: `{model_dir}/decoder.int8.onnx` (or `.onnx`)
  - `tokenizer`: `{model_dir}/tokenizer/` (directory, not a file)
- The `from_qwen_audio` API does NOT exist — it was an old guess that fell back to `from_paraformer`, which would never work with Qwen3 split files
- The tokenizer is a directory with `vocab.json`, `merges.txt`, `tokenizer_config.json` (standard BPE format)
- Model total size is ~982MB (encoder 182MB + decoder 755MB + conv_frontend 44MB + tokenizer 3MB)
- Never check for combined `model.int8.onnx` for qwen3; always check for split files

## Session 6 Anchored Summary

### Goal
Fix CTRL hotkey (TypeLess / 快速啟動按鈕) failing to stop recording — pressing CTRL again during recording does nothing.

### Root Cause (Stale Closure Race)
`useRecording.js:stopRecording()` checked `if (!isRecording) return;` using React **state** (`isRecording`), not a ref. When TypeLess fires `onStopRecording` IPC quickly after `onStartRecording` (before React re-renders with `isRecording=true`), the stop handler's closure captured `isRecording=false` → early return → recording never stops.

### Changes
- **useRecording.js:28**: Added `isRecordingRef = useRef(false)` — always reflects latest recording state
- **useRecording.js:142,188**: `isRecordingRef.current = true` set synchronously alongside `setIsRecording(true)` (before any `await`)
- **useRecording.js:313-314**: `stopRecording()` now checks `isRecordingRef.current` instead of `isRecording` state; clears ref before async processing
- **useRecording.js:303**: Error handler in `startRecording` also resets `isRecordingRef.current = false`
- **useRecording.js:615**: `cancelRecording()` also resets `isRecordingRef.current = false`
- **useRecording.js:380**: `stopRecording` deps changed from `[isRecording, cleanup, t]` to `[cleanup, t, stopPrecogTimer]` (ref eliminates state dep; `stopPrecogTimer` was already used but missing from deps)

### Critical Context (DO NOT BREAK)
- `stopRecording` in `useRecording.js` MUST always use a REF to check recording state, never React state — IPC events from TypeLess can fire before React re-renders
- Both `setIsRecording(true)` and `isRecordingRef.current = true` must be set together; catch/error handlers must reset both
- `handleClickRecording` in App.jsx uses `isRecording` (state) as its entry gate — but the TypeLess callbacks (`onTypelessStopRecording`) bypass this gate and call `stopRecordingNormal()` directly; the ref fix in `stopRecording` is the safety net for that direct path

## Session 7 Anchored Summary

### Goal
Add Breeze-ASR-25-onnx (聯發科研發，專注繁體中文與中英混用) as a supported ASR model.

### Implementation
Breeze-ASR-25 is a Whisper-large-v2 fine-tune exported to sherpa-onnx format. Uses half-precision INT8 ONNX files from HuggingFace.

### Changes
- **sherpaManager.js:38-42**: Added `breeze_asr_25` to `MODEL_CONFIGS` — files: `breeze-asr-25-half-encoder.int8.onnx` (766MB), `breeze-asr-25-half-decoder.int8.onnx` (1.01GB), `breeze-asr-25-half-tokens.txt` (817KB); total ~1.8GB
- **sherpa_server.py:831-840**: File check for `breeze_asr_25` — encoder + decoder + tokens
- **sherpa_server.py:882-892**: Model loading via `from_whisper()` with Breeze-specific filenames, `language="zh"`, `task="transcribe"`
- **sherpa_server.py:1971**: Added `breeze_asr_25` to `--model-type` choices
- **settings.jsx**: Added UI option in select, status display, description, and manual download URL

### Key Details
- Model source: `https://huggingface.co/MediaTek-Research/Breeze-ASR-25-onnx-250806`
- Downloads via standard HuggingFace file download path (same as whisper/sense_voice), NOT tar.bz2
- Uses exactly the same `from_whisper()` API — only file paths differ
- Optimized for Taiwanese Mandarin + Mandarin-English code-switching

## Session 8 Anchored Summary

### Goal
Fix recording toggle stuck permanently when uiohook drops keyup/keydown under load/screen recording (Windows). Add independent `globalShortcut` emergency reset hotkey as belt-and-suspenders.

### Root Cause
- **Primary (watchdog timer)**: `uiohook-napi` can drop keyup events under CPU load / screen recording on Windows. The `triggerHeld` flag never gets cleared, so the next trigger key press is blocked by `triggerHeld && gap < 600` guard.
- **Secondary (no independent unstick path)**: Even with the gap-based recovery (>600ms), if a user doesn't know to wait, they spam the key and every press lands within 600ms → stuck forever.

### Changes
- **typelessManager.js:40,111-114,152,250**: `_triggerHeldTimer` — 800ms watchdog that refreshes on every keydown (including auto-repeat). When auto-repeat stops (key released), timer fires 800ms later to clear `triggerHeld`. Keyup handler cancels timer. Based on PR #14 commit `20cbc8a` (jaylooloomi).
- **typelessManager.js:272-283**: `forceReset()` method — resets all state (isKeyDown, isActive, triggerHeld, timers, lastToggleTime, lastKeyDownTime) to zero. Called by emergency reset hotkey.
- **main.js:290-309**: Emergency reset hotkey `CommandOrControl+Shift+F9` registered via `globalShortcut` (Electron API, NOT uiohook). On trigger: calls `typelessManager.forceReset()`, hides indicator, broadcasts `emergency-reset` IPC to all windows.
- **preload.js:226-230**: Exposed `onEmergencyReset` listener
- **App.jsx:1149-1156**: Listens for `emergency-reset` → stops recording, resets sync flag, shows notification
- **i18n (zh-TW/zh-CN/en)**: Added `notifications.emergencyReset` translation

### Critical Context (DO NOT BREAK)
- `_triggerHeldTimer` watchdog (800ms) and the gap-based recovery (>600ms gap from lastToggleTime) are COMPLEMENTARY. Timer handles auto-repeat + keyup-eaten; gap handles manual re-press after stuck.
- `forceReset()` in typelessManager is called from main.js (NOT from App.jsx) — it directly mutates the main-process object.
- The emergency reset `CommandOrControl+Shift+F9` is registered via `globalShortcut` which is Electron's built-in API, not uiohook-napi — completely independent failure domain.
- Both `globalShortcut` and uiohook are unregistered in `will-quit` handler (`globalShortcut.unregisterAll()` + `typelessManager.cleanup()`).

## Session 9 Anchored Summary

### Goal
Fix mute-system-audio (錄音時靜音) — `IAudioEndpointVolume` COM API via raw vtable function pointer approach.

### Root Cause #1: InvokeMember on non-IDispatch COM object
The original code used `d.GetType().InvokeMember("Activate", ...)` on the `IMMDevice` COM object. `IMMDevice` is a pure vtable interface (only `IUnknown`, not `IDispatch`), so `InvokeMember` (which calls `IDispatch::Invoke`) fails with "COM target does not implement IDispatch". Fix: define `IMMDevice` as `[ComImport, InterfaceIsIUnknown]` with `Activate` as a direct vtable method, then cast `(M)d`.

### Root Cause #2: GetMute returns E_INVALIDARG
`IAudioEndpointVolume::GetMute` consistently returns E_INVALIDARG (0x80070057) regardless of marshalling approach (`out bool`, `out int`, `IntPtr`). Resolution: skip `GetMute` entirely, always `SetMute(0)` on unmute (simpler and more predictable).

### Root Cause #3: PowerShell Add-Type COM interop unreliable
PowerShell `Add-Type` with C# compiles on first call and caches, but `InvokeMember("Activate", ...)` on `IMMDevice` always fails because `IMMDevice` doesn't implement `IDispatch`. Fix: use raw vtable function pointers compiled to standalone C# exe via `csc.exe`.

### Root Cause #4: TypeLess unmute skipped by stale ref check
`onTypelessStopRecording` handler checked `isRecordingNormalRef.current` before calling unmute, but the ref could be `false` if `startRecordingNormal()` hadn't completed yet. Fix: move unmute call outside the `isRecordingNormalRef.current` guard. Also added unmute to `onTypelessCancelRecording` handler (was missing entirely).

### vtable Layout (confirmed by empirical probing on Windows 11)
- **IMMDeviceEnumerator**: `_4()` = slot 3 (EnumAudioEndpoints), `GetDefault()` = slot 4 (GetDefaultAudioEndpoint) ✓
- **IMMDevice**: `Activate()` = slot 3 (IMMDevice::Activate) ✓
- **IAudioEndpointVolume** (empirical, NOT SDK docs):
  - Slots 3-5: `SetMasterVolumeLevel`, `GetMasterVolumeLevel`, `SetMasterVolumeLevelScalar`
  - Slot 6: `GetMasterVolumeLevelScalar`
  - **Slot 7: `SetMute(BOOL pbMute, LPCGUID pguidEventContext)`** — confirmed working via `mute_action.exe 0 7` → user verified audio stops
  - Slot 8: NOT SetMute — takes a POINTER as first param (crashes with int value) → likely `GetChannelCount(UINT*)`
  - Slot 9: `GetMute(BOOL*)` — confirmed working
  - **SDK docs say slot 8 = SetMute, but empirical probing shows slot 7 on this system**

### Changes (src/helpers/ipc/sound.js)
- **Approach**: Raw vtable function pointers compiled to standalone C# exe via `csc.exe`, NOT PowerShell `Add-Type`
- C# source embedded as JS strings → compiled to `soda2_mute.exe` in temp dir → executed with mute/unmute arg
- Checks for cached exe before recompiling
- Uses `console.log` for debugging

### Changes (src/App.jsx)
- `onTypelessStopRecording` (line 1312-1327): moved unmute call OUTSIDE `isRecordingNormalRef.current` check — always unmutes if `muteWhileRecordingRef.current` is true
- `onTypelessCancelRecording` (line 1330-1336): added unmute call (was missing entirely)

### Mute Critical Context (DO NOT BREAK)
- `InvokeMember("Activate", ...)` on `IMMDevice` WILL ALWAYS FAIL because `IMMDevice` doesn't implement `IDispatch` — must define `[ComImport, InterfaceIsIUnknown]` and cast directly
- .NET auto-handles first 3 vtable slots (IUnknown) for `InterfaceIsIUnknown` — your declared methods start at slot 3
- `GetMute` on `IAudioEndpointVolume` returns E_INVALIDARG on Windows 10/11 — always skip it and assume unmute on restore
- **`SetMute` is at vtable slot 7 (NOT slot 8 as SDK docs say)** — confirmed by empirical probing and user verification
- `IAudioEndpointVolume` IS the correct API to mute all modern Windows audio (WASAPI) — `waveOutSetVolume` only mutes legacy MME/DirectSound apps, NOT Chrome/Edge/modern apps
- **In ALL recording toggles: unmute must NEVER be gated by `isRecordingNormalRef.current`** — the ref can lag behind actual recording state. Always call `muteSystemAudio(false)` unconditionally when stop/cancel event is received.
- `SetMute(0)` is idempotent — calling it when not muted is harmless
- **PRIMARY**: Now uses napi-rs native addon (`native/mute-native/index.node`) for in-process COM — the C# exe is a fallback only
- **DO NOT** use `execSync` to call `soda2_mute.exe` directly — always use `muteSystemAudioSync()` from `sound.js` which tries native first

## Session 10 Anchored Summary

### Goal
Fix unmute-on-stop failing despite `SetMute(0)` returning success — switch from out-of-process C# exe to in-process napi-rs native addon.

### Root Cause
`soda2_mute.exe` spawns a new process for every mute/unmute call. Each process creates its own COM apartment (`COINIT_MULTITHREADED`), calls `SetMute`, then exits — destroying the apartment. The audio device's mute state may not persist across apartment boundaries because the COM reference counting and marshalling is not continuous. The exe returns `S_OK` (exit 0) but the change doesn't take effect on the actual audio endpoint.

### Solution: In-Process Native Addon (yukey pattern)
- **`native/mute-native/`**: napi-rs Rust addon compiled to `index.node`
- Uses `windows` crate v0.58 with `Win32_Media_Audio_Endpoints` feature
- Calls `IAudioEndpointVolume::SetMute` directly in the Node.js process — COM apartment persists across calls
- No subprocess overhead, no apartment boundary issues

### Changes
- **`native/mute-native/Cargo.toml`**: napi 2 + windows 0.58 dependencies
- **`native/mute-native/src/lib.rs`**: `#[napi] fn set_mute(mute: bool) -> bool` — calls `CoInitializeEx(COINIT_MULTITHREADED)` + `CoCreateInstance(MMDeviceEnumerator)` + `GetDefaultAudioEndpoint(eRender, eMultimedia)` + `Activate::<IAudioEndpointVolume>` + `SetMute`
- **`src/helpers/ipc/sound.js`**: `muteSystemAudioSync()` function — tries native addon first, falls back to C# exe; exports both `module.exports` (for ipcHandlers) and `.muteSystemAudioSync` (for hotkeys.js)
- **`src/helpers/ipc/hotkeys.js`**: All 3 mute call sites (`onStopRecording`, `onCancelRecording`, `typeless-backup-stop`) now use `ctx.muteSystemAudioSync()` instead of inline `execSync`
- **`src/helpers/ipcHandlers.js`**: Stores `muteSystemAudioSync` on `this` for hotkeys.js access
- **`package.json`**: Added `build:native` script, included `native/**/*.node` in files and asarUnpack
- **C# exe fallback enhanced**: Added `Console.WriteLine` diagnostics, `GetMute` verification, 3-retry loop with 100ms delay

### Native Addon Critical Context (DO NOT BREAK)
- The native addon MUST use `COINIT_MULTITHREADED` — `COINIT_APARTMENTTHREADED` will fail because Node.js is multi-threaded
- `windows` crate v0.58 uses `device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)` — this is the safe COM casting pattern (equivalent to `QueryInterface` + `AddRef`)
- The fallback to C# exe is only needed if the native addon fails to load (e.g., architecture mismatch)
- `index.node` must be in the asarUnpack list for Electron to load it via `require()`
- The native addon path from `sound.js` is `../../../native/mute-native/index.node` (relative to `src/helpers/ipc/`)

### Fallback Critical Context (DO NOT BREAK)
- C# exe fallback now has: `GetMute` verification (slot 9), 3 retries with 100ms delay, `Console.WriteLine` diagnostics
- The C# exe fallback is compiled on first use and cached in `%TEMP%/soda2_mute.exe`
- Old exe is deleted automatically when new C# source is detected (needCompile check)

### Build Commands
- `pnpm run build:native` — builds the Rust addon (requires Rust/Cargo)
- `pnpm run build:renderer` — builds the React frontend
- `cargo build --release` in `native/mute-native/` — direct Rust build
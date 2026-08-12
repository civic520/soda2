# AI 優化錄音：橢圓膠囊金幣煙火 + 專屬音效設計

日期：2026-08-12
狀態：已批准

## 背景

AI 優化錄音觸發後，目前只有「右下角控制面板小方窗（App.jsx mini-capsule）」顯示金幣煙火動畫。使用者指出，真正的主指示器是「畫面正下方的橢圓形膠囊」（TypelessIndicator 獨立視窗），它目前只有雲端 ASR 的白色小金幣粒子，沒有 AI 優化錄音的視覺回饋。

另外，AI 優化錄音目前沒有專屬音效，與一般錄音共用同一組 `playBeep('start'|'stop')` 音效，無法獨立設置。

## 目標

1. 橢圓形膠囊（TypelessIndicator）在 AI 優化錄音時顯示金幣煙火動畫，與 mini-capsule 兩處都顯示，視覺一致。
2. 新增 AI 優化錄音專屬音效：獨立開關 + 獨立主題 + 獨立音量，啟動與停止都用專屬音效，共用現有音效庫。

## 現況分析

### 橢圓形膠囊（TypelessIndicator）
- 獨立 BrowserWindow：`?page=typeless-indicator`（windowManager.createTypelessIndicatorWindow）
- `src/components/TypelessIndicator.jsx`：`pill-*` 橢圓膠囊（pill-bounce / pill-cloud / pill-recording），`rounded-full` 橢圓形
- 目前只知道 `commandMode`（IPC `command-mode-changed`）與 `cloudAsrActive`（讀 `cloud_asr_settings`）
- 雲端 ASR 啟用時顯示 3 個 `coin-particle`（小白點粒子，位於膠囊左側）

### 右下角小方窗（App.jsx mini-capsule）
- 控制面板視窗（`?panel=control`）內的小方窗，已實作金幣煙火動畫（6 顆大金幣煙火 + 金色漸層 + 彈跳），目前正確運作

### 音效系統
- 渲染端 `src/utils/audioPlayer.js`：`playBase64Sound(b64, mimeType, volume)`
- 渲染端 App.jsx `playBeep('start'|'stop')`：依 `sound_theme` → `playSound('<theme>_<start|stop>')` IPC → main 端 `play-sound` handler → 讀 `assets/sounds/<name>.wav` 回傳 base64
- 現有設定：`recording_sound_enabled`、`sound_feedback_volume`、`sound_theme`（設定於 settings.jsx 音效區塊）
- 音效庫：`assets/sounds/coin01_start.wav`、`coin01_stop.wav`、`coin02_*`、`coin03_*`、`coin05_*`~`coin08_*`、`marimba_*`、`pickup01_*`、`rec_start.wav`、`rec_stop.wav`

### AI 優化錄音
- 觸發鍵設定：HotkeySettings.jsx（`setAiOptimizeTrigger`：altRight/ctrlRight/f11/f12/custom）
- 狀態：App.jsx `isAiOptimizedRecording = isRecording && aiOptimizationEnabled`
- 事件流：TypelessManager 偵測觸發鍵 → `onAiOptimizeRecordingStart/Stop` 回呼 → 前端開始/停止 AI 優化錄音

## 設計

### 1. 橢圓形膠囊金幣煙火

**狀態傳遞**：新增 main → renderer 事件 `ai-optimize-recording-state-changed`（boolean）。main 端在 AI 優化錄音開始/停止時對 TypelessIndicator 視窗廣播（與 `command-mode-changed` 同機制，見 windowManager）。

**TypelessIndicator.jsx**：
- 訂閱 `ai-optimize-recording-state-changed`，`setAiOptimizeRecording(!!v)`，並在 mount 時 `getAiOptimizeRecordingState()` 取得初始值
- 渲染邏輯調整：AI 優化錄音時，膠囊顯示金幣煙火動畫（金色漸層、彈跳、大金幣浮起煙火），與 mini-capsule 相同的視覺。優先規則：AI 優化錄音時顯示金幣煙火並隱藏雲端 ASR 的白色小點（僅在非 AI 優化錄音時才顯示白點）
- 文字：AI 優化錄音時顯示對應 i18n 文案（新增 key）

**共用動畫**：將 mini-capsule 的金幣煙火動畫結構抽成共用組件 `CoinFirework`（或共用 CSS class），TypelessIndicator 與 App.jsx 共用，確保兩處視覺一致。coin CSS 動畫（`@keyframes`）維持在既有 CSS 檔（找出 mini-capsule 金幣動畫的 CSS 位置並共用）。

**App.jsx mini-capsule**：維持現有金幣煙火動畫（已正確），如抽成共用組件則改為引用共用組件，行為不變。

### 2. AI 優化錄音專屬音效

**新增設定**（settings.jsx 音效區塊內新增子區塊「AI 優化錄音音效」）：
- `ai_sound_enabled`（boolean，預設 true）
- `ai_sound_theme`（string，預設 `'coin02'`，選項同 `sound_theme`：coin01~08、marimba、pickup01）
- `ai_sound_volume`（number 0~1，預設 0.8）

**播放邏輯**（App.jsx）：
- 新增 `playAiBeep('start'|'stop')`，讀 `ai_sound_enabled` / `ai_sound_theme` / `ai_sound_volume` → `playSound('<ai_theme>_<start|stop>')` → `playBase64Sound`
- AI 優化錄音開始/停止時呼叫 `playAiBeep`（替代原本的 `playBeep`）
- 獨立於一般錄音音效，互不影響

**設定 UI**（settings.jsx）：
- 「AI 優化錄音音效」區塊：開關（ai_sound_enabled）、主題下拉（ai_sound_theme）、音量滑桿（ai_sound_volume）、試聽按鈕（播放該主題 start 音）
- 開關關閉時隱藏主題/音量/試聽（與一般音效區塊一致）

**i18n**：zh-TW / zh-CN / en 新增 AI 音效區塊與 TypelessIndicator AI 優化文案的 key

### 資料流

```
AI 錄音開始
 ├─ main: 廣播 ai-optimize-recording-state-changed(true) → TypelessIndicator 顯示金幣煙火
 └─ App.jsx: playAiBeep('start') → playSound('<ai_theme>_start') → 播放
AI 錄音停止
 ├─ main: 廣播 ai-optimize-recording-state-changed(false) → TypelessIndicator 停止金幣煙火
 └─ App.jsx: playAiBeep('stop') → playSound('<ai_theme>_stop') → 播放
```

## 錯誤處理
- `playSound` IPC 回傳 null（音檔不存在）→ `playAiBeep` 靜默跳過（同 `playBeep` 現況）
- AudioContext 被 suspend → `playBase64Sound` 內已處理 resume
- TypelessIndicator 收不到事件 → mount 時查初始狀態補足

## 測試
- 單元測試：`playAiBeep` 的設定解析與名稱組裝（沿用 sound-theme 測試風格）
- 回歸測試：TypelessIndicator 收到 `ai-optimize-recording-state-changed` 事件後渲染 coin-particle / 金幣煙火元素
- 手動驗證：觸發 AI 優化錄音 → 橢圓膠囊金幣煙火 + 專屬音效；停止 → 音效停止；一般錄音不影響

## 範圍（非目標）
- 不新增獨立音效檔（共用現有音效庫）
- 不修改一般錄音音效行為
- 不重構 windowManager 視窗建立邏輯

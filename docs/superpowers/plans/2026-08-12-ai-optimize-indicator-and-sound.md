# AI 優化錄音：橢圓膠囊金幣煙火 + 專屬音效 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 橢圓形膠囊（TypelessIndicator）在 AI 優化錄音時顯示金幣煙火動畫，並新增 AI 優化錄音專屬音效（獨立開關/主題/音量）。

**Architecture:** 兩個獨立功能。視覺：TypelessIndicator 訂閱現有 `ai-optimize-recording-start/stop` 事件（已廣播到所有視窗），AI 錄音時渲染 `ai-coin-burst` 金幣煙火（與 mini-capsule 共用 CSS）。音效：新增 3 個設定（`ai_sound_enabled`/`ai_sound_theme`/`ai_sound_volume`），App.jsx 新增 `playAiBeep()` 在 AI 錄音時取代 `playBeep()`。

**Tech Stack:** React (Vite)、Electron IPC、node:test 單元測試、assets/sounds/*.wav 音效庫。

## Global Constraints

- 設定檔 key 名稱：`ai_sound_enabled` / `ai_sound_theme` / `ai_sound_volume`
- `ai_sound_theme` 預設 `'coin02'`，選項與 `sound_theme` 一致：marimba/coin01/coin02/coin03/coin05/coin06/coin07/coin08/pickup01
- `ai_sound_volume` 範圍 0~1，預設 0.8
- 不新增音效檔（共用 assets/sounds）
- 不修改一般錄音音效行為（`playBeep` 不變）
- 金幣煙火動畫：**不改** `ai-coin-burst` / `ai-coin-particle` CSS（App.jsx mini-capsule 已正確）
- i18n 三語都要新增 key（zh-TW / zh-CN / en）

---

### Task 1: AI 專屬音效設定 + playAiBeep 播放邏輯

**Files:**
- Modify: `src/App.jsx`（設定載入 L410-453、playBeep L736-754、startRecording/stopRecording L757-795、AI 優化錄音觸發 L1335-1348）
- Test: `test/ai-sound.test.js`（新增，純函數測試）

**Interfaces:**
- Consumes: `window.electronAPI.getSetting(key, default)`、`window.electronAPI.playSound(name)`、`playBase64Sound(b64, mimeType, volume)`
- Produces: `resolveAiSoundName(theme, type)` → 回傳 `'<theme>_<start|stop>'`（marimba 特例），供測試與 App.jsx 共用。此函數放 `src/utils/aiSound.js` 供 App.jsx import 且可被測試。

- [ ] **Step 1: 建立 `src/utils/aiSound.js`，含 `resolveAiSoundName` 與 `isAiSoundEnabled`**

```js
// src/utils/aiSound.js
export function resolveAiSoundName(theme, type) {
  const t = theme || 'coin02';
  const isStart = type === 'start';
  if (t === 'marimba') {
    return isStart ? 'marimba_start' : 'marimba_stop';
  }
  return `${t}_${isStart ? 'start' : 'stop'}`;
}
```

- [ ] **Step 2: 寫失敗測試 `test/ai-sound.test.js`**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveAiSoundName } = require("../src/utils/aiSound.cjs");

test("resolveAiSoundName maps marimba to marimba start/stop", () => {
  assert.equal(resolveAiSoundName("marimba", "start"), "marimba_start");
  assert.equal(resolveAiSoundName("marimba", "stop"), "marimba_stop");
});

test("resolveAiSoundName maps theme to theme_start/stop", () => {
  assert.equal(resolveAiSoundName("coin02", "start"), "coin02_start");
  assert.equal(resolveAiSoundName("coin08", "stop"), "coin08_stop");
});

test("resolveAiSoundName defaults to coin02 when theme missing", () => {
  assert.equal(resolveAiSoundName(null, "start"), "coin02_start");
  assert.equal(resolveAiSoundName("", "stop"), "coin02_stop");
});
```

**注意**：`src/utils/aiSound.js` 是 ES module（Vite 用）。node:test 用 require 無法直接載入 ESM。改用 `.cjs` 後綴的 CommonJS 檔案 `src/utils/aiSound.cjs`，由 App.jsx 用 `import { resolveAiSoundName } from "../utils/aiSound.cjs"` 載入（Vite 支援 .cjs）。同時把 `resolveAiSoundName` 也供 sound-theme.test.js 沿用風格。

- [ ] **Step 3: 改為 CJS 並寫實作 `src/utils/aiSound.cjs`**

```js
// src/utils/aiSound.cjs
function resolveAiSoundName(theme, type) {
  const t = theme || 'coin02';
  const isStart = type === 'start';
  if (t === 'marimba') {
    return isStart ? 'marimba_start' : 'marimba_stop';
  }
  return `${t}_${isStart ? 'start' : 'stop'}`;
}
module.exports = { resolveAiSoundName };
```

- [ ] **Step 4: 更新測試為 require .cjs 並跑通**

```js
const { resolveAiSoundName } = require("../src/utils/aiSound.cjs");
```

Run: `node --test test/ai-sound.test.js`
Expected: PASS 3 tests

- [ ] **Step 5: App.jsx import resolveAiSoundName**

在 App.jsx 頂部（`import { playBase64Sound } from "./utils/audioPlayer";` 附近）加：

```js
import { resolveAiSoundName } from "./utils/aiSound.cjs";
```

- [ ] **Step 6: App.jsx 新增 ai_sound 設定 state 與載入**

在 L384-387 音效 state 旁加：

```js
const [aiSoundEnabled, setAiSoundEnabled] = useState(true);
const [aiSoundTheme, setAiSoundTheme] = useState('coin02');
const [aiSoundVolume, setAiSoundVolume] = useState(0.8);
const aiSoundThemeRef = useRef('coin02');
const aiSoundVolumeRef = useRef(0.8);
```

在 L410-418 設定載入處加：

```js
const aiSoundEn = await window.electronAPI.getSetting('ai_sound_enabled', true);
setAiSoundEnabled(aiSoundEn !== false);
const aiSoundTheme = await window.electronAPI.getSetting('ai_sound_theme', 'coin02');
setAiSoundTheme(aiSoundTheme || 'coin02');
aiSoundThemeRef.current = aiSoundTheme || 'coin02';
const aiSoundVol = Number(await window.electronAPI.getSetting('ai_sound_volume', 0.8));
aiSoundVolumeRef.current = Number.isFinite(aiSoundVol) ? Math.max(0, Math.min(1, aiSoundVol)) : 0.8;
setAiSoundVolume(aiSoundVolumeRef.current);
```

在 L447-453 設定變更監聽處加：

```js
} else if (data.key === 'ai_sound_enabled') {
  setAiSoundEnabled(data.value !== false);
} else if (data.key === 'ai_sound_theme') {
  setAiSoundTheme(data.value || 'coin02');
  aiSoundThemeRef.current = data.value || 'coin02';
} else if (data.key === 'ai_sound_volume') {
  const v = Number(data.value);
  const vol = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
  setAiSoundVolume(vol);
  aiSoundVolumeRef.current = vol;
}
```

- [ ] **Step 7: App.jsx 新增 `playAiBeep`**

在 `playBeep`（L736-754）後新增：

```js
// AI 優化錄音提示音：獨立開關/主題/音量（不影響一般錄音音效）
const playAiBeep = useCallback(async (type) => {
  if (!aiSoundEnabled) { console.log('[sound] playAiBeep skipped: ai_sound_enabled=false'); return; }
  const name = resolveAiSoundName(aiSoundThemeRef.current, type);
  try {
    console.log('[sound] playAiBeep calling IPC for:', name);
    const res = await window.electronAPI?.playSound(name);
    console.log('[sound] playAiBeep IPC result:', res ? `data=${res.data?.length}chars` : 'null');
    if (res?.playedNatively || !res?.data) return;
    await playBase64Sound(res.data, res.mimeType, aiSoundVolumeRef.current);
    console.log('[sound] playAiBeep completed');
  } catch (e) { console.warn('[sound] playAiBeep error:', e); }
}, [aiSoundEnabled]);
```

- [ ] **Step 8: 修改 startRecording/stopRecording 支援 AI 參數**

`startRecording`（L757-773）改為接受 `options = {}`，AI 優化錄音時播 AI 音效：

```js
const startRecording = useCallback(async (options = {}) => {
  console.log('[mute-debug] startRecording called, muteWhileRecording=' + muteWhileRecording);
  if (options.aiOptimize) {
    await playAiBeep('start');
  } else {
    await playBeep('start');
  }
  await new Promise(r => setTimeout(r, 200));
  if (muteWhileRecording) {
    window.electronAPI?.muteSystemAudio(true).then(r => {
      console.log('[mute-debug] muteSystemAudio result:', JSON.stringify(r));
    }).catch(e => console.warn('[mute-debug] mute error:', e));
  }
  if (streamingMode) {
    startStreaming();
  } else {
    startRecordingNormal();
  }
}, [streamingMode, startStreaming, startRecordingNormal, playBeep, playAiBeep, muteWhileRecording]);
```

`stopRecording`（L775-795）同步改為接受 `options = {}`：

```js
const stopRecording = useCallback(async (options = {}) => {
  console.log('[mute-debug] stopRecording called, muteWhileRecording=' + muteWhileRecording);
  if (muteWhileRecording) {
    window.electronAPI?.muteSystemAudio(false).then(r => {
      console.log('[mute-debug] unmuteSystemAudio result:', JSON.stringify(r));
    }).catch(e => console.warn('[mute-debug] unmute error:', e));
  }
  if (options.aiOptimize) {
    await playAiBeep('stop');
  } else {
    await playBeep('stop');
  }
  await new Promise(r => setTimeout(r, 200));
  if (streamingMode) {
    stopStreaming();
  } else {
    stopRecordingNormal();
  }
  try { window.electronAPI?.notifyRecordingStopped?.(); } catch (e) { /* ignore */ }
}, [streamingMode, stopStreaming, stopRecordingNormal, playBeep, playAiBeep, muteWhileRecording]);
```

- [ ] **Step 9: 修改 AI 優化錄音觸發點傳 `{ aiOptimize: true }`**

在 L1335-1348 的 `onAiOptimizeRecordingStart/Stop` 回呼中：

```js
const unsubscribeAiOptRecStart = window.electronAPI.onAiOptimizeRecordingStart?.(() => {
  console.log('AI 優化錄音 (uiohook): 開始');
  if (!aiOptEnabledRef.current) {
    aiOptimizeTemporaryRef.current = true;
    setAiOptimizationEnabled(true);
    window.electronAPI?.setSetting('enable_ai_optimization', true).catch(() => {});
  }
  startRecording({ aiOptimize: true });
});

const unsubscribeAiOptRecStop = window.electronAPI.onAiOptimizeRecordingStop?.(() => {
  console.log('AI 優化錄音 (uiohook): 停止');
  stopRecording({ aiOptimize: true });
});
```

注意此 useEffect 的 deps array（L1360）需加入 `playAiBeep`。

- [ ] **Step 10: 跑全部測試 + lint**

Run: `node --test test/`
Expected: 全部 PASS（含新增 3 個 ai-sound 測試）
Run: `npm run lint`
Expected: 無錯誤

- [ ] **Step 11: Commit**

```bash
git add src/utils/aiSound.cjs test/ai-sound.test.js src/App.jsx
git commit -m "feat(ai-sound): add dedicated AI optimize recording sound with independent enable/theme/volume"
```

---

### Task 2: 橢圓形膠囊（TypelessIndicator）金幣煙火動畫

**Files:**
- Modify: `src/components/TypelessIndicator.jsx`
- Test: `test/typeless-indicator.test.js`（新增）

**Interfaces:**
- Consumes: `window.electronAPI.onAiOptimizeRecordingStart(cb)` / `onAiOptimizeRecordingStop(cb)`（preload 已有，L249/L253）
- Produces: TypelessIndicator 在 AI 優化錄音時渲染 `ai-coin-burst`（6 顆 `ai-coin-particle`）並切換 pill 樣式為金色

- [ ] **Step 1: 寫失敗測試 `test/typeless-indicator.test.js`**

測試純函數：給定 ai 狀態，渲染 JSX 字串含 `ai-coin-burst`。用 react-dom/server renderToString（Vite 專案已有 react-dom）。

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const TypelessIndicator = require("../src/components/TypelessIndicator.cjs").default;

test("TypelessIndicator renders ai-coin-burst when aiOptimizeRecording=true", () => {
  const html = renderToStaticMarkup(React.createElement(TypelessIndicator, { aiOptimizeRecording: true, cloudAsrActive: false, commandMode: false }));
  assert.match(html, /ai-coin-burst/);
});

test("TypelessIndicator does NOT render ai-coin-burst when aiOptimizeRecording=false", () => {
  const html = renderToStaticMarkup(React.createElement(TypelessIndicator, { aiOptimizeRecording: false, cloudAsrActive: false, commandMode: false }));
  assert.doesNotMatch(html, /ai-coin-burst/);
});
```

**注意**：`TypelessIndicator.jsx` 使用 `useTranslation` hook 與 `window.electronAPI`，SSR 會掛。為讓組件可測試且不破壞現有行為，將「依 props 渲染」與「訂閱事件」分離：組件接受 props（`aiOptimizeRecording` 等），內部 effect 訂閱事件並 setState。測試直接傳 props 驗證渲染。這需要把檔案改為 `.cjs` 才能 require（與 aiSound 同理）。但 JSX 在 .cjs 無法編譯——改用 Vite 的 vitest？**替代方案**：測試不渲染組件，改測「狀態轉換函式」純函數 `indicatorClass(aiOpt, cloud, command)`。

改用純函數測試方案（較符合現有 node:test 風格）：

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { indicatorClass } = require("../src/components/typelessIndicatorLogic.cjs");

test("indicatorClass returns pill-recording when nothing special", () => {
  assert.equal(indicatorClass(false, false, false), "pill-recording");
});
test("indicatorClass returns pill-command when commandMode", () => {
  assert.equal(indicatorClass(false, true, true), "pill-command");
});
test("indicatorClass returns pill-ai when aiOptimizeRecording", () => {
  assert.equal(indicatorClass(true, false, false), "pill-ai");
});
test("indicatorClass prioritizes aiOptimizeRecording over commandMode", () => {
  assert.equal(indicatorClass(true, true, true), "pill-ai");
});
test("indicatorClass falls back to pill-cloud when cloudAsr only", () => {
  assert.equal(indicatorClass(false, true, false), "pill-cloud");
});
```

- [ ] **Step 2: 建立 `src/components/typelessIndicatorLogic.cjs` 純函式**

```js
// src/components/typelessIndicatorLogic.cjs
function indicatorClass(aiOptimizeRecording, cloudAsrActive, commandMode) {
  if (aiOptimizeRecording) return "pill-ai";
  if (commandMode) return "pill-command";
  if (cloudAsrActive) return "pill-cloud";
  return "pill-recording";
}
module.exports = { indicatorClass };
```

- [ ] **Step 3: 跑測試確認通過**

Run: `node --test test/typeless-indicator.test.js`
Expected: PASS 5 tests

- [ ] **Step 4: 修改 TypelessIndicator.jsx 訂閱 AI 錄音事件**

在 L12 state 區加：

```js
const [aiOptimizeRecording, setAiOptimizeRecording] = useState(false);
```

新增 effect（commandMode effect 之後）：

```js
useEffect(() => {
  let unsubStart = null;
  let unsubStop = null;
  if (window.electronAPI) {
    unsubStart = window.electronAPI.onAiOptimizeRecordingStart?.(() => setAiOptimizeRecording(true));
    unsubStop = window.electronAPI.onAiOptimizeRecordingStop?.(() => setAiOptimizeRecording(false));
  }
  return () => {
    if (typeof unsubStart === 'function') unsubStart();
    if (typeof unsubStop === 'function') unsubStop();
  };
}, []);
```

- [ ] **Step 5: 修改 TypelessIndicator.jsx 渲染**

將 L52-58 的 className 邏輯改用 indicatorClass：

```jsx
import { indicatorClass } from "./typelessIndicatorLogic.cjs";

<div
  className={`pill-bounce backdrop-blur-sm rounded-full px-5 py-2 flex items-center gap-2.5 ${
    indicatorClass(aiOptimizeRecording, cloudAsrActive, commandMode)
  }`}
>
```

金幣煙火（在 L60 的 coin-particle 區塊之後，icon 之前）：

```jsx
{aiOptimizeRecording && (
  <div className="ai-coin-burst">
    <div className="ai-coin-particle" />
    <div className="ai-coin-particle" />
    <div className="ai-coin-particle" />
    <div className="ai-coin-particle" />
    <div className="ai-coin-particle" />
    <div className="ai-coin-particle" />
  </div>
)}
```

文字（L65-67）：AI 優化錄音時顯示金幣文案：

```jsx
<span className="text-white font-semibold text-[15px] whitespace-nowrap tracking-wide">
  {aiOptimizeRecording
    ? t("panel.aiOptimizeRecording")
    : commandMode ? t("panel.commandListening") : t("panel.recordingIndicator")}
</span>
```

- [ ] **Step 6: 新增 `.pill-ai` 樣式到 index.css**

在 `.pill-cloud` 相關樣式附近加：

```css
/* AI 優化錄音藥丸：金色高亮 */
.pill-ai {
  background: linear-gradient(135deg, #b8860b, #ffd700 50%, #f5a623);
  border: 2px solid rgba(255, 215, 0, 0.6);
  box-shadow: 0 0 18px rgba(255, 215, 0, 0.45);
}
.pill-ai .ai-coin-burst .ai-coin-particle {
  width: 12px; height: 12px;
}
.pill-ai .ai-coin-burst .ai-coin-particle:nth-child(2),
.pill-ai .ai-coin-burst .ai-coin-particle:nth-child(5) {
  width: 10px; height: 10px;
}
.pill-ai .ai-coin-burst .ai-coin-particle:nth-child(3),
.pill-ai .ai-coin-burst .ai-coin-particle:nth-child(6) {
  width: 9px; height: 9px;
}
```

- [ ] **Step 7: i18n 新增 `panel.aiOptimizeRecording` key**

zh-TW.js `panel` 區（L528 附近）加：
```js
aiOptimizeRecording: 'AI 優化中...',
```
zh-CN.js 加：
```js
aiOptimizeRecording: 'AI 优化中...',
```
en.js 加：
```js
aiOptimizeRecording: 'AI Optimizing...',
```

- [ ] **Step 8: 驗證 CSS 不衝突（ai-coin-particle 已是全域樣式，typeless 用同 class）**

確認 `.ai-coin-burst` 在 TypelessIndicator 的 pill 容器（`position: relative`？）內可定位。pill 有 `relative` 嗎？檢查後若 pill 非 relative，在 `.pill-ai` 加 `position: relative;`。已在 Step 6 的 `.pill-ai` 內補上。

- [ ] **Step 9: 跑測試 + lint**

Run: `node --test test/`
Expected: 全部 PASS
Run: `npm run lint`
Expected: 無錯誤

- [ ] **Step 10: Commit**

```bash
git add src/components/TypelessIndicator.jsx src/components/typelessIndicatorLogic.cjs test/typeless-indicator.test.js src/index.css src/i18n/zh-TW.js src/i18n/zh-CN.js src/i18n/en.js
git commit -m "feat(typeless-indicator): show gold coin firework in pill during AI optimize recording"
```

---

### Task 3: settings.jsx「AI 優化錄音音效」設定 UI

**Files:**
- Modify: `src/settings.jsx`

**Interfaces:**
- Consumes: `ai_sound_enabled` / `ai_sound_theme` / `ai_sound_volume` 設定（App.jsx 已處理播放）
- Produces: 設定面板音效區塊下方的「AI 優化錄音音效」子區塊（開關+主題下拉+音量滑桿+試聽）

- [ ] **Step 1: settings.jsx 載入 ai_sound 設定**

在 L607-612 音效設定載入處加：

```js
ai_sound_enabled: allSettings.ai_sound_enabled !== false,
ai_sound_theme: allSettings.ai_sound_theme || 'coin02',
ai_sound_volume: (() => {
  const v = Number(allSettings.ai_sound_volume);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
})(),
```

- [ ] **Step 2: settings.jsx 新增 ai 音效處理函數**

在 `handleVolumeChange`（L694）附近加：

```js
const handleAiVolumeChange = async (value) => {
  setSettings(prev => ({ ...prev, ai_sound_volume: value }));
  try { await window.electronAPI?.setSetting?.('ai_sound_volume', value); } catch (e) { /* ignore */ }
};

const handlePlayAiTestSound = async () => {
  try {
    const theme = settings.ai_sound_theme || 'coin02';
    const name = theme === 'marimba' ? 'marimba_start' : `${theme}_start`;
    const res = await window.electronAPI?.playSound(name);
    if (!res?.data) return;
    await tryUnlock();
    await playBase64Sound(res.data, res.mimeType, settings.ai_sound_volume);
  } catch (e) { console.warn('AI test sound error:', e); }
};
```

- [ ] **Step 3: settings.jsx 渲染「AI 優化錄音音效」區塊**

在一般音效區塊（`{settings.recording_sound_enabled && (...)}` L1576-1647 結束）之後、錄音靜音區塊（L1649）之前插入：

```jsx
{/* AI 優化錄音音效（獨立於一般錄音音效） */}
<div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
  <div className="flex items-center justify-between mb-1">
    <div>
      <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
        {t('settings.aiSoundToggle')}
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {t('settings.aiSoundToggleDesc')}
      </p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={settings.ai_sound_enabled}
      onClick={() => handleToggleChange('ai_sound_enabled', !settings.ai_sound_enabled)}
      className={`${
        settings.ai_sound_enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
      } relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
    >
      <span
        aria-hidden="true"
        className={`${
          settings.ai_sound_enabled ? 'translate-x-4' : 'translate-x-0'
        } inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
      />
    </button>
  </div>

  {settings.ai_sound_enabled && (
    <>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {t('settings.aiSoundVolume')}
          </label>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {Math.round(settings.ai_sound_volume * 100)}%
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {t('settings.aiSoundVolumeDesc')}
        </p>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(settings.ai_sound_volume * 100)}
          onChange={(e) => handleAiVolumeChange(Number(e.target.value) / 100)}
          className="w-full slider-accent cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-between mt-3">
        <div>
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {t('settings.aiSoundTheme')}
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t('settings.aiSoundThemeDesc')}
          </p>
        </div>
        <select
          value={settings.ai_sound_theme}
          onChange={(e) => handleSettingChange('ai_sound_theme', e.target.value)}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="marimba">Marimba</option>
          <option value="coin01">Coin 01</option>
          <option value="coin02">Coin 02</option>
          <option value="coin03">Coin 03</option>
          <option value="coin05">Coin 05</option>
          <option value="coin06">Coin 06</option>
          <option value="coin07">Coin 07</option>
          <option value="coin08">Coin 08</option>
          <option value="pickup01">Pickup 01</option>
        </select>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div>
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {t('settings.aiTestSound')}
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t('settings.aiTestSoundDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={handlePlayAiTestSound}
          className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {t('settings.testSoundPlay')}
        </button>
      </div>
    </>
  )}
</div>
```

- [ ] **Step 4: i18n 新增 settings.ai* key（三語）**

zh-TW.js `settings` 區（L248 附近）加：
```js
aiSoundToggle: 'AI 優化錄音音效',
aiSoundToggleDesc: 'AI 優化錄音開始/結束時播放專屬提示音（獨立於一般錄音音效）',
aiSoundVolume: 'AI 音效音量',
aiSoundVolumeDesc: '調整 AI 優化錄音提示音的音量',
aiSoundTheme: 'AI 音效主題',
aiSoundThemeDesc: '選擇 AI 優化錄音的音效組合',
aiTestSound: '試聽 AI 音效',
aiTestSoundDesc: '預覽目前選擇的 AI 音效主題',
```
zh-CN.js 對應加簡體：
```js
aiSoundToggle: 'AI 优化录音音效',
aiSoundToggleDesc: 'AI 优化录音开始/结束时播放专属提示音（独立于一般录音音效）',
aiSoundVolume: 'AI 音效音量',
aiSoundVolumeDesc: '调整 AI 优化录音提示音的音量',
aiSoundTheme: 'AI 音效主题',
aiSoundThemeDesc: '选择 AI 优化录音的音效组合',
aiTestSound: '试听 AI 音效',
aiTestSoundDesc: '预览当前选择的 AI 音效主题',
```
en.js 加：
```js
aiSoundToggle: 'AI Recording Sound',
aiSoundToggleDesc: 'Play a dedicated chime when AI optimize recording starts and stops (independent from normal recording sounds)',
aiSoundVolume: 'AI Sound Volume',
aiSoundVolumeDesc: 'Adjust the volume of AI optimize recording sounds',
aiSoundTheme: 'AI Sound Theme',
aiSoundThemeDesc: 'Choose the sound set for AI optimize recording feedback',
aiTestSound: 'Test AI Sound',
aiTestSoundDesc: 'Preview the selected AI sound theme',
```

- [ ] **Step 5: 跑測試 + lint**

Run: `node --test test/`
Expected: 全部 PASS
Run: `npm run lint`
Expected: 無錯誤

- [ ] **Step 6: Commit**

```bash
git add src/settings.jsx src/i18n/zh-TW.js src/i18n/zh-CN.js src/i18n/en.js
git commit -m "feat(settings): add independent AI optimize recording sound settings UI"
```

---

### Task 4: 端到端驗證

- [ ] **Step 1: 確認 dev 伺服器運行，實際觸發 AI 優化錄音**

手動驗證：
1. 設定 AI 優化錄音觸發鍵（如 F12）
2. 按 F12 → 橢圓形膠囊（TypelessIndicator）出現且顯示金幣煙火 + 金色高亮；右下角 mini-capsule 也顯示金幣煙火
3. 播放 AI 專屬音效（coin02 預設）
4. 再按 F12 → 停止，膠囊消失，播放停止音效
5. 一般錄音（非 AI）：仍播一般音效、無金幣煙火（回歸）
6. 設定面板「AI 優化錄音音效」可獨立切換/選主題/調音量/試聽

- [ ] **Step 2: 確認全部測試通過**

Run: `node --test test/`
Expected: 全部 PASS

---

## Self-Review 紀錄

- **Spec coverage**：spec 第 1 項（TypelessIndicator 金幣煙火）→ Task 2；spec 第 2 項（AI 專屬音效獨立設定）→ Task 1（播放）+ Task 3（UI）。spec 的資料流/錯誤處理/測試 → 各 Task 對應步驟。✅
- **Placeholder scan**：無 TBD/TODO。✅
- **Type consistency**：`resolveAiSoundName(theme, type)` 一致使用；`indicatorClass(ai, cloud, command)` 參數順序一致；`startRecording({aiOptimize})` 參數名一致。✅

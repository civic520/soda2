# AI 模型商「取得 API Key」連結 設計文件

日期：2026-08-12
狀態：已批准

## 目標

在「AI 模型商」下拉選單旁，新增「取得 API Key」連結，點擊後用系統瀏覽器開啟該模型商的官方 API key 取得頁面，方便使用者快速取得金鑰。

## 研究結論（2026-08 確認）

| 模型商 | 免費額度 | API Key 網址 |
|--------|---------|--------------|
| OpenAI | 有（新帳戶贈額度） | https://platform.openai.com/api-keys |
| Google (Gemini) | 有（免費 tier） | https://aistudio.google.com/app/apikey |
| Anthropic | 有（免費額度） | https://console.anthropic.com/settings/keys |
| OpenRouter | 有（送 $1） | https://openrouter.ai/settings/keys |
| Groq | 有（免費 tier） | https://console.groq.com/keys |
| Cerebras | 有（每日 100 萬 tokens、免信用卡） | https://cloud.cerebras.ai/ |
| Z.AI | 有（GLM-4.5/4.7-Flash 免費、限速） | https://z.ai/manage-apikey/apikey-list |
| AWS Bedrock | **無免費 tier**（每 token 付費） | **移除** |

## 設計

### 1. AI_PROVIDERS 更新（src/settings.jsx L73-83）
- 每個 provider 加 `keyUrl` 欄位（除 custom）
- **移除 AWS Bedrock**（無免費 tier）

### 2. UI（「模型商選擇」區塊 L2486-2503）
- 改為 flex 容器：左側 label + select，右側（若有 `keyUrl`）顯示「取得 API Key ↗」連結
- 點擊呼叫 `window.electronAPI.openExternal(url)`（preload 已有 `openExternal` → IPC `open-external`，system.js L225）
- Custom 無 keyUrl → 不顯示連結

### 3. i18n
- 三語新增 `settings.getApiKey`：「取得 API Key」/「获取 API Key」/「Get API Key」

## 資料流

```
使用者在設定頁選取模型商 → 下拉旁出現「取得 API Key ↗」連結
點擊 → window.electronAPI.openExternal(keyUrl) → main 端 shell.openExternal → 系統瀏覽器開啟
```

## 錯誤處理
- `openExternal` 失敗 → IPC 已包 try/catch（system.js），靜默
- custom 不顯示連結（無 keyUrl）

## 範圍（非目標）
- 不新增設定儲存（keyUrl 是靜態常數）
- 不影響現有 provider 連線邏輯

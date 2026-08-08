# Changelog

本專案版本變更紀錄。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

- （暫無）

## [1.0.22] - 2026-08-08

### 新增

- 主視窗尺寸自癒：透明無框視窗被 Windows 縮成怪尺寸（216×214、掛到螢幕外）時自動矯正回 472×470（issue #22）
- 網頁縮放防護：強制 100% 縮放並擋掉 Ctrl+滾輪誤觸縮放（永不還原的版面擠爛問題）
- 保存錄音檔開關 + 錄音保留期限（7 / 30 / 90 天 / 永久）：關掉不寫磁碟省 SSD，超過期限開機自動清除
  「台灣音「ㄌㄜˋㄙㄜㄨㄝ」→ 垃圾」修正（issue #21）：Paraformer 聽成樂色/勒色時內建修正
- 阿拉伯數字還原：連續 3 個以上中文數字（一二三→123、二〇二四→2024）自動轉阿拉伯數字
- 熱詞功能修正：set_hotwords 改用巢狀 config，熱詞終於寫得進 hotwords.txt（PR #20 yhlhenry）
- macOS 操作模式支援：語音翻譯 / 簡繁轉換 / 按鍵指令的快速鍵改用 osascript System Events
- Mac 觸發鍵下拉改 Mac-aware：顯示「右 Option（預設）」，不再列出 Mac 上不存在的右 Ctrl

### 修正

- 改錯候選浮窗：自訂輸入框移到最上方 + autoFocus，建議清單可捲動，再多也不撑爆視窗（issue #19）
- 深色模式下歷史區文字改用淺色，不再黑底黑字
- TypeLess 指示器改 showInactive：錄音中不再搶走前景 app 焦點（PR #23）
- 關於頁顯示真實版本號，不再銅定 v1.0.1（issue #15）

## [1.0.20][1.0.19][1.0.18][1.0.17][1.0.16][1.0.15] - 2026-08-07

自 v1.0.15 起的多個版本在互聯授權樹上合併；本版本整合以下功能：

### 新增（截至 v1.0.20）
- 主視窗尺寸自癒（每藏/顯示被咬縮 + 雙螢幕 DPI 縮 var，293×214 版面全爛無法自救）（issue #22）
- 縮放防護：主面板強制 100%
- 保存錄音檔開關 + 錄音保留期限（建議 1）
- 熱詞修復（巢狀 config，PR #20）
- Mac 前景焦點不搶走（showInactive，PR #23）

### 歷史版本
See [releases](https://github.com/Jeffrey0117/SpeakSlow/releases)。

## [1.0.14] - 2026-07-xx

### 新增
- 停頓自動分行改可開關（issue #17，預設關）
- 一鍵清空辨識紀錄（issue #10）

### 修正
- 移除 Windows/Linux 預設選單列，避免 Alt 誤觸啟動選單吃掉右 Alt keyup
- Mac 視窗叫回 / 退出無反應修正

## [1.0.13] - 2026-07-xx

### 變更
- 自動列點（第一二三→ 1. 2. 3.）改預設關閉 + 增加設定開關
- 修正 Mac dock 叫不回視窗、按結束沒反應（issue #16）

## [1.0.12] - 2026-07-xx

### 新增
- 串流模型自動下載捃及 Windows / Linux（不再限定 macOS）
- 麥風風音量測試條（搭配麥風風選擇）
- 可自訂 typeless 錄音觸發鍵（issue #12）

## [1.0.11] - 2026-07-xx

### 新增
- 採用 PR #3（webeasyplay）的 Mac 後端載入與焦點貼上修正（手動移植）
- 三平台下載改用永久（latest/download）

## [1.0.10] - 2026-07-xx

### 新增
- 符號管理頁（看內建 + 自訂觸發詞，存 DB 即時生效）

### 修正
- 簡轉繁「帳都→ 賬號」的台灣標準字修正（opencc s2tw 認賬不認帳）
- 迷你模式錄音/處理錯誤改走膠囊通知，不再冒大 toast
- Mac 沒有輔助使用權限就啟動全域熱鍵 crash-loop → 先檢查再啟動
- Mac/Linux 也改固定檔名

## [1.0.9] - 2026-07-xx

### 新增
- 麥克風選擇 + 自動增益（AGC）開關
- 切換 AI 供應商時清空 api_key（避免帶著別家的 key 打壞）

## [1.0.8] - 2026-07-xx

### 修正
- Gemini 模型清單更新為現役模型（移除已停用的 2.0-flash / 1.5-pro）
- 全面更新模型清單為現役 + 設定充值

## [1.0.7] - 2026-07-xx

### 修正
- SRT 字幕用逐字時間戳把長段切短字幕（不再一句長達十幾秒）
- 主面板標題擠到直排換行的視覺修正、爬浮動 toast

## [1.0.6] - 2026-06-xx

### 新增
- 逐字稿 / 影片 / SRT 字幕功能

### 修正
- 右 Ctrl / 右 Alt 漏接 keyup 會永久卡死 toggle → 無法停止錄音

## [1.0.5] 2026-06-xx

### 新增
- PyInstaller 將 edge-tts（+ aiohttp / certifi）打包進後端

## [1.0.1] - 2026-05-xx

### 修正
- transcribe 卡在 Python 檢查（即使已內建後端）— 改為依賴後端是否存在

## [1.0.0] - 2026-05-xx

### 新增
- 使用 sherpa-onnx 的本地語音輸入（Paraformer 即時辨識）
- 聲聲慢 / 說打兔 基礎 UI：主面板、迷你模式、操作模式
- AI 文字優化：連結 OpenAI 相容服務（DeepSeek / Gemini / Ollama）
- 語音符號與表情插入
- 錄音熱鍵：右 Alt / 右 Ctrl 一鍵切換錄音

[unreleased]: https://github.com/Jeffrey0117/SpeakSlow/compare/v1.0.22...HEAD
[1.0.22]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.22
[1.0.14]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.14
[1.0.13]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.13
[1.0.12]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.12
[1.0.11]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.11
[1.0.10]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.10
[1.0.9]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.9
[1.0.8]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.8
[1.0.7]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.7
[1.0.6]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.6
[1.0.5]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.5
[1.0.1]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.1
[1.0.0]: https://github.com/Jeffrey0117/SpeakSlow/releases/tag/v1.0.0
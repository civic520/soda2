/**
 * TypeLess 模式管理器
 * 實現「按住說話」功能：按住快捷鍵開始錄音，放開停止錄音
 */

const { uIOhook, UiohookKey } = require('uiohook-napi');

// 可選的「單擊切換」觸發鍵(issue #12:右 Alt/右 Ctrl 會跟其他軟體衝突,讓使用者換)。
// 只收「不會在正常打字時誤觸」的鍵:右側修飾鍵 + 功能鍵。刻意不放左 Ctrl/Alt/Shift,
// 那些單擊也會在日常快捷鍵/打大寫時觸發。
const TYPELESS_TRIGGER_PRESETS = {
  default: [UiohookKey.AltRight, UiohookKey.CtrlRight],
  ctrlRight: [UiohookKey.CtrlRight],
  altRight: [UiohookKey.AltRight],
  f8: [UiohookKey.F8],
  f9: [UiohookKey.F9],
  f10: [UiohookKey.F10],
};

// AI 優化錄音觸發鍵（與 TypeLess 觸發鍵獨立，可分配不同按鍵避免衝突）
const AI_OPTIMIZE_TRIGGER_PRESETS = {
  none: [],
  altRight: [UiohookKey.AltRight],
  ctrlRight: [UiohookKey.CtrlRight],
  f11: [UiohookKey.F11],
  f12: [UiohookKey.F12],
};

// accelerator 鍵名 → uiohook keycode（支援 A-Z、F1-F12、Space、方向鍵）
function _buildKeycodeMap() {
  const map = {};
  for (let i = 65; i <= 90; i++) map[String.fromCharCode(i)] = UiohookKey[String.fromCharCode(i)];
  for (let i = 1; i <= 12; i++) map[`F${i}`] = UiohookKey[`F${i}`];
  map.Space = UiohookKey.Space;
  map.Up = UiohookKey.Up; map.Down = UiohookKey.Down;
  map.Left = UiohookKey.Left; map.Right = UiohookKey.Right;
  map.Escape = UiohookKey.Escape;
  map.Enter = UiohookKey.Enter;
  map.Tab = UiohookKey.Tab;
  return map;
}
const _KEYCODE_BY_ACCELERATOR = _buildKeycodeMap();

class TypelessManager {
  constructor(logger = null) {
    this.logger = logger;
    this.isEnabled = false;
    this.isKeyDown = false;
    // 觸發鍵（單擊切換）：右 Alt + 右 Ctrl 都可。
    // 在瀏覽器裡用右 Ctrl 可避開「右 Alt 放開觸發選單列」的衝突。
    this.triggerKeys = [UiohookKey.AltRight, UiohookKey.CtrlRight];
    this.modifiers = {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false
    };
    // 操作模式：'toggle' 單擊切換（按一下開始、再按一下停止）| 'hold' 按住說話
    this.mode = 'toggle';
    this.isActive = false;   // toggle 模式：目前是否正在錄音
    this.triggerHeld = false; // 防止長按時的自動重複觸發
    this.lastKeyDownTime = 0; // 上次觸發鍵 keydown 的時間（解「漏接 keyup」卡死用）
    this.lastToggleTime = 0;  // 上次切換的時間（auto-repeat 不更新此值，用於正確判定新按壓）
    this._triggerHeldTimer = null; // triggerHeld 自動解鎖計時器（keyup 被吞掉時的保險)
    this._macAxTimer = null;  // Mac：等「輔助使用」授權的輪詢 timer
    // AI 優化快捷錄音：trigger + 修飾鍵組合
    this.aiOptimizeMode = false; // 目前是否處於 AI 優化錄音模式
    this.aiOptimizeModifier = 'shift'; // AI 優化修飾鍵：'shift' | 'ctrl' | 'alt' | 'meta' | null
    // AI 優化錄音觸發鍵（uiohook，可設定右 Alt/右 Ctrl 等）
    this.aiOptimizeTriggerKeys = []; // 預設停用
    this.aiOptimizeCustom = null;
    this.aiOptimizeRecordingActive = false; // 目前是否正在 AI 優化錄音
    this._aiOptTriggerHeld = false; // 防止 auto-repeat
    this._aiOptLastToggleTime = 0; // 上次切換時間

    // 回調函數
    this.onStartRecording = null;
    this.onStopRecording = null;
    this.onCancelRecording = null;
    this.onAiOptimizeEnable = null;
    this.onAiOptimizeDisable = null;
    // AI 優化錄音回調（uiohook 觸發路徑）
    this.onAiOptimizeRecordingStart = null;
    this.onAiOptimizeRecordingStop = null;

    // 綁定事件處理器
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  /**
   * 設置回調函數
   */
  setCallbacks({ onStartRecording, onStopRecording, onCancelRecording, onAiOptimizeEnable, onAiOptimizeDisable }) {
    this.onStartRecording = onStartRecording;
    this.onStopRecording = onStopRecording;
    this.onCancelRecording = onCancelRecording;
    this.onAiOptimizeEnable = onAiOptimizeEnable || null;
    this.onAiOptimizeDisable = onAiOptimizeDisable || null;
    this.safeLog('info', 'TypeLess 回調函數已設置');
  }

  /**
   * 檢查修飾鍵是否匹配
   */
  checkModifiers(event) {
    const ctrlMatch = this.modifiers.ctrl === (event.ctrlKey || false);
    const shiftMatch = this.modifiers.shift === (event.shiftKey || false);
    const altMatch = this.modifiers.alt === (event.altKey || false);
    const metaMatch = this.modifiers.meta === (event.metaKey || false);

    return ctrlMatch && shiftMatch && altMatch && metaMatch;
  }

  /**
   * 處理按鍵按下事件
   */
  handleKeyDown(event) {
    if (!this.isEnabled) return;

    // 按 Esc → 取消錄音 + 強制收掉指示器藥丸。切換 / 按住兩種模式都支援，
    // 讓你「按住講到一半發現講錯」也能鬼切。且就算錄音狀態已脫鉤（藥丸卡成孤兒），
    // Esc 也一律呼叫 onCancelRecording 把藥丸關掉（渲染端沒在錄音則為無害 no-op）。
    if (event.keycode === UiohookKey.Escape) {
      const wasRecording = this.isActive || this.isKeyDown;
      this.isActive = false;
      this.isKeyDown = false;
      this.triggerHeld = false;
      if (wasRecording) this.safeLog('info', 'TypeLess: 取消錄音 (Esc)');
      if (this.onCancelRecording) this.onCancelRecording();
      // Esc 取消時，若處於 AI 優化模式則清除
      if (this.aiOptimizeMode) {
        this.aiOptimizeMode = false;
        if (this.onAiOptimizeDisable) this.onAiOptimizeDisable();
      }
      return;
    }

    // 快速鍵：在錄音進行中按修飾鍵 → 啟用 AI 優化（不需等待 trigger 鍵）
    // 解決 Ctrl → 修飾鍵 順序問題：修飾鍵 keydown 不是 trigger key，原本會被 gate 擋掉
    // toggle 模式用 isActive，hold 模式用 isKeyDown，兩者都要覆蓋
    if ((this.isActive || this.isKeyDown) && !this.aiOptimizeMode &&
        this._checkAiOptimizeModifier(event)) {
      this.aiOptimizeMode = true;
      this.safeLog('info', 'TypeLess: AI 優化模式啟用');
      if (this.onAiOptimizeEnable) this.onAiOptimizeEnable();
    }

    // AI 優化錄音觸發鍵偵測（toggle 模式，與 TypeLess 獨立）
    if (this._checkAiOptimizeTrigger(event)) {
      // 忽略 auto-repeat（與 TypeLess toggle 相同邏輯）
      if (this._aiOptTriggerHeld && (Date.now() - this._aiOptLastToggleTime) < 600) return;
      this._aiOptTriggerHeld = true;
      this._aiOptLastToggleTime = Date.now();

      if (this.aiOptimizeRecordingActive) {
        // 正在錄音 → 停止
        this.aiOptimizeRecordingActive = false;
        this.safeLog('info', 'AI 優化錄音: 停止');
        if (this.onAiOptimizeRecordingStop) this.onAiOptimizeRecordingStop();
      } else {
        // 未錄音 → 開始
        this.aiOptimizeRecordingActive = true;
        this.safeLog('info', 'AI 優化錄音: 開始');
        if (this.onAiOptimizeRecordingStart) this.onAiOptimizeRecordingStart();
      }
      return; // 不再往下傳播到 TypeLess trigger 偵測
    }

    if (!this.triggerKeys.includes(event.keycode)) return;

    if (this.mode === 'toggle') {
      // 單擊切換：忽略長按造成的自動重複（keydown 會連續觸發）。
      // 但「靠 keyup 清 triggerHeld」在高負載/錄影時 keyup 會被吞掉，
      // 導致 triggerHeld 永遠卡 true、之後按右 Ctrl 全無反應（真實踩過的雷）。
      // 解法：用 lastToggleTime 而非 lastKeyDownTime 來量測間隔。
      // lastToggleTime 只在「實際切換」時更新，auto-repeat 不更新它。
      // 因此即使 auto-repeat 的 keydown 連續湧入，gap 仍反映距上次切換的真實時間。
      // 當 gap >= 600ms 且 triggerHeld = true，表示 keyup 被吞掉 → 強制解卡。
      // 再加一道保險：triggerHeld 自動解鎖計時器。
      // 每次 keydown（含 auto-repeat）都會刷新此計時器；800ms 無 keydown
      // 即自動清除 triggerHeld，確保 keyup 被吞掉時不會永久卡死。
      // keyup 正常收到時則立即清除並取消計時器。
      const now = Date.now();
      const gap = now - this.lastToggleTime;
      this.lastKeyDownTime = now;
      this.safeLog('info', `TypeLess keydown(trigger=${event.keycode}) isActive=${this.isActive} held=${this.triggerHeld} gap=${gap}`);
      // 保險：每次 keydown（含 auto-repeat）都刷新計時器
      if (this._triggerHeldTimer) clearTimeout(this._triggerHeldTimer);
      this._triggerHeldTimer = setTimeout(() => { this.triggerHeld = false; this._triggerHeldTimer = null; }, 800);
      if (this.triggerHeld && gap < 600) return; // 真的是長按自動重複，忽略
      this.triggerHeld = true;

      const wasActive = this.isActive;
      this.isActive = !this.isActive;
      this.lastToggleTime = now;

      if (this.isActive) {
        if (!wasActive) {
          this.safeLog('info', 'TypeLess(切換): 開始錄音');
          if (this.onStartRecording) this.onStartRecording();
          // 偵測修飾鍵：啟用 AI 優化錄音模式
          if (this._checkAiOptimizeModifier(event) && !this.aiOptimizeMode) {
            this.aiOptimizeMode = true;
            this.safeLog('info', 'TypeLess: AI 優化模式啟用');
            if (this.onAiOptimizeEnable) this.onAiOptimizeEnable();
          }
        }
      } else {
        this.safeLog('info', 'TypeLess(切換): 停止錄音');
        if (this.onStopRecording) this.onStopRecording();
        // 錄音停止時，若處於 AI 優化模式則自動清除
        if (this.aiOptimizeMode) {
          this.aiOptimizeMode = false;
          this.safeLog('info', 'TypeLess: AI 優化模式自動關閉');
          if (this.onAiOptimizeDisable) this.onAiOptimizeDisable();
        }
      }
      return;
    }

    // hold 模式：按住說話（需檢查修飾鍵）
    if (this.checkModifiers(event)) {
      if (!this.isKeyDown) {
        this.isKeyDown = true;
        this.safeLog('info', 'TypeLess: 開始錄音 (keydown)');
        if (this.onStartRecording) this.onStartRecording();
        // 偵測修飾鍵：啟用 AI 優化錄音模式
        if (this._checkAiOptimizeModifier(event) && !this.aiOptimizeMode) {
          this.aiOptimizeMode = true;
          this.safeLog('info', 'TypeLess: AI 優化模式啟用 (hold)');
          if (this.onAiOptimizeEnable) this.onAiOptimizeEnable();
        }
      }
    }
  }

  /**
   * 處理按鍵放開事件
   */
  handleKeyUp(event) {
    if (!this.isEnabled) return;

    // AI 優化錄音觸發鍵 keyup
    if (this._checkAiOptimizeTrigger(event)) {
      this._aiOptTriggerHeld = false;
      return;
    }

    if (!this.triggerKeys.includes(event.keycode)) return;

    // 放開觸發鍵：解除長按鎖定（並取消自動解鎖計時器；若 keyup 被吞掉，計時器會接手清除）
    this.safeLog('info', `TypeLess keyup(trigger=${event.keycode})`);
    this.triggerHeld = false;
    if (this._triggerHeldTimer) { clearTimeout(this._triggerHeldTimer); this._triggerHeldTimer = null; }

    // hold 模式才在放開時停止錄音；toggle 模式由再次按下控制
    if (this.mode === 'hold' && this.isKeyDown) {
      this.isKeyDown = false;
      this.safeLog('info', 'TypeLess: 停止錄音 (keyup)');
      if (this.onStopRecording) this.onStopRecording();
      // hold 模式放開時，若處於 AI 優化模式則清除
      if (this.aiOptimizeMode) {
        this.aiOptimizeMode = false;
        if (this.onAiOptimizeDisable) this.onAiOptimizeDisable();
      }
    }
  }

  /**
   * 啟用 TypeLess 模式
   */
  enable() {
    if (this.isEnabled) {
      this.safeLog('warn', 'TypeLess 模式已經啟用');
      return;
    }

    // Mac：沒有「輔助使用」(Accessibility) 權限就呼叫 uIOhook.start() 會「原生崩潰」
    // （segfault，try/catch 攔不住）→ 一啟動就掛、自動重開又掛 → crash-loop。
    // 先檢查；沒權限就提示 + 輪詢，等使用者授權後再真的啟動全域熱鍵。
    if (process.platform === 'darwin' && !this._hasMacAccessibility()) {
      this.safeLog('warn', 'Mac 尚未授權「輔助使用」，待授權後再啟動全域熱鍵（避免崩潰）');
      this._promptMacAccessibility();
      this._waitMacAccessibilityThenEnable();
      return;
    }

    try {
      // 註冊事件監聽器
      uIOhook.on('keydown', this.handleKeyDown);
      uIOhook.on('keyup', this.handleKeyUp);

      // 啟動監聽
      uIOhook.start();

      this.isEnabled = true;
      this.safeLog('info', 'TypeLess 模式已啟用');
    } catch (error) {
      // 不再 throw：啟用全域熱鍵失敗不該讓整個 app 崩潰
      this.safeLog('error', 'TypeLess 模式啟用失敗', error);
    }
  }

  // Mac：是否已取得「輔助使用」權限。非 Mac / API 不存在 → 視為 OK（照舊行為）。
  _hasMacAccessibility() {
    try {
      const { systemPreferences } = require('electron');
      if (typeof systemPreferences.isTrustedAccessibilityClient !== 'function') return true;
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch (e) {
      return true;
    }
  }
  _promptMacAccessibility() {
    try {
      const { systemPreferences } = require('electron');
      systemPreferences.isTrustedAccessibilityClient(true); // 跳系統授權對話框
    } catch (e) { /* ignore */ }
  }
  _waitMacAccessibilityThenEnable() {
    if (this._macAxTimer) return;
    this._macAxTimer = setInterval(() => {
      if (this._hasMacAccessibility()) {
        clearInterval(this._macAxTimer);
        this._macAxTimer = null;
        this.enable(); // 拿到權限 → 正式啟動
      }
    }, 1500);
  }

  /**
   * 停用 TypeLess 模式
   */
  disable() {
    if (this._macAxTimer) {
      clearInterval(this._macAxTimer);
      this._macAxTimer = null;
    }
    if (!this.isEnabled) {
      return;
    }

    try {
      // 移除事件監聽器
      uIOhook.off('keydown', this.handleKeyDown);
      uIOhook.off('keyup', this.handleKeyUp);

      // 停止監聽
      uIOhook.stop();

      this.isEnabled = false;
      this.isKeyDown = false;
      this.isActive = false;
      this.triggerHeld = false;
      if (this._triggerHeldTimer) { clearTimeout(this._triggerHeldTimer); this._triggerHeldTimer = null; }
      this.safeLog('info', 'TypeLess 模式已停用');
    } catch (error) {
      this.safeLog('error', 'TypeLess 模式停用失敗', error);
    }
  }

  /**
   * 由渲染層同步「真實錄音狀態」。
   * 因為錄音可由右 Alt 或滑鼠點擊麥克風按鈕觸發/停止，
   * 若 isActive 與實際狀態脫鉤，下次按右 Alt 會 off-by-one（切換方向相反）。
   * 每當渲染層錄音狀態改變就呼叫此方法，保持一致。
   */
  syncActiveState(isRecording) {
    this.isActive = !!isRecording;
  }

  /**
   * 強制重置所有狀態（緊急用）。由 globalShortcut 急救熱鍵觸發，
   * 當 uiohook 卡死（keyup/keydown 被吞）時，靠 Electron 的 API 強制
   * 解鎖 triggerHeld、清除計時器、重置按鍵狀態。
   */
  forceReset() {
    this.isKeyDown = false;
    this.isActive = false;
    this.triggerHeld = false;
    this.lastKeyDownTime = 0;
    this.lastToggleTime = 0;
    if (this.aiOptimizeMode) {
      this.aiOptimizeMode = false;
      if (this.onAiOptimizeDisable) this.onAiOptimizeDisable();
    }
    this.aiOptimizeRecordingActive = false;
    this._aiOptTriggerHeld = false;
    this._aiOptLastToggleTime = 0;
    if (this._triggerHeldTimer) {
      clearTimeout(this._triggerHeldTimer);
      this._triggerHeldTimer = null;
    }
    this.safeLog('info', 'TypeLess: 強制重置 (emergency reset)');
  }

  /**
   * 設定為「右 Alt 單擊切換」模式（TypeLess 預設）
   */
  setRightAltToggle() {
    this.triggerKeys = [UiohookKey.AltRight, UiohookKey.CtrlRight];
    this.modifiers = { ctrl: false, shift: false, alt: false, meta: false };
    this.mode = 'toggle';
    this.isActive = false;
    this.triggerHeld = false;
    this.safeLog('info', 'TypeLess 設定為「右 Alt / 右 Ctrl 單擊切換」', {
      triggerKeys: this.triggerKeys,
    });
  }

  /**
   * 依預設 id 設定「單擊切換」觸發鍵(issue #12:可自訂,避開與其他軟體衝突）。
   * 未知 id 退回預設(右 Alt + 右 Ctrl)。即時生效,不需重新 enable。
   */
  setTriggerById(id) {
    const keys = TYPELESS_TRIGGER_PRESETS[id] || TYPELESS_TRIGGER_PRESETS.default;
    this.triggerKeys = keys;
    this.modifiers = { ctrl: false, shift: false, alt: false, meta: false };
    this.mode = 'toggle';
    this.isActive = false;
    this.triggerHeld = false;
    this.safeLog('info', `TypeLess 觸發鍵設為「${id}」`, { triggerKeys: keys });
  }

  /**
   * 設定 AI 優化快速鍵的修飾鍵
   * @param {string|null} modifier - 'shift' | 'ctrl' | 'alt' | 'meta' | null
   */
  setAiOptimizeModifier(modifier) {
    this.aiOptimizeModifier = modifier;
    this.safeLog('info', `TypeLess AI 優化修飾鍵設為「${modifier || '停用'}」`);
  }

  /**
   * 設置 AI 優化錄音觸發鍵（uiohook 路徑）
   * @param {string} triggerValue - 'none' | 'altRight' | 'ctrlRight' | 'f11' | 'f12' | accelerator 字串
   */
  setAiOptimizeTrigger(triggerValue) {
    this.aiOptimizeCustom = null;
    this.aiOptimizeTriggerKeys = [];
    this.aiOptimizeRecordingActive = false;
    this._aiOptTriggerHeld = false;
    this._aiOptLastToggleTime = 0;
    if (triggerValue && triggerValue.includes("+")) {
      this.aiOptimizeCustom = this._parseAccelerator(triggerValue);
      this.safeLog('info', `AI 優化錄音觸發鍵(自訂): ${triggerValue}${this.aiOptimizeCustom ? '' : ' (解析失敗)'}`);
    } else {
      this.aiOptimizeTriggerKeys = AI_OPTIMIZE_TRIGGER_PRESETS[triggerValue] || [];
      this.safeLog('info', `AI 優化錄音觸發鍵: ${triggerValue || '停用'}`);
    }
  }

  _parseAccelerator(accelerator) {
    if (!accelerator || typeof accelerator !== 'string') return null;
    const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const modifiers = { ctrl: false, shift: false, alt: false, meta: false };
    const keyPart = parts.pop();
    for (const p of parts) {
      if (p === 'CommandOrControl' || p === 'Ctrl' || p === 'Control') modifiers.ctrl = true;
      else if (p === 'Shift') modifiers.shift = true;
      else if (p === 'Alt') modifiers.alt = true;
      else if (p === 'Meta') modifiers.meta = true;
    }
    const keycode = _KEYCODE_BY_ACCELERATOR[keyPart];
    if (keycode === undefined) return null;
    return { keycode, modifiers };
  }

  _checkAiOptimizeTrigger(event) {
    if (this.aiOptimizeCustom) {
      const { keycode, modifiers } = this.aiOptimizeCustom;
      if (event.keycode !== keycode) return false;
      if (modifiers.ctrl !== (event.ctrlKey || false)) return false;
      if (modifiers.shift !== (event.shiftKey || false)) return false;
      if (modifiers.alt !== (event.altKey || false)) return false;
      if (modifiers.meta !== (event.metaKey || false)) return false;
      return true;
    }
    return this.aiOptimizeTriggerKeys.includes(event.keycode);
  }

  /**
   * 檢查事件是否包含 AI 優化修飾鍵
   */
  _checkAiOptimizeModifier(event) {
    if (!this.aiOptimizeModifier) return false;
    switch (this.aiOptimizeModifier) {
      case 'shift': return event.shiftKey;
      case 'ctrl': return event.ctrlKey;
      case 'alt': return event.altKey;
      case 'meta': return event.metaKey;
      default: return false;
    }
  }

  /**
   * 設置觸發快捷鍵
   * @param {string} accelerator - Electron 格式的快捷鍵，如 "CommandOrControl+Shift+Space"
   */
  setHotkey(accelerator) {
    const keyMap = {
      'Space': UiohookKey.Space,
      'Enter': UiohookKey.Enter,
      'Tab': UiohookKey.Tab,
      'Backspace': UiohookKey.Backspace,
      'F1': UiohookKey.F1,
      'F2': UiohookKey.F2,
      'F3': UiohookKey.F3,
      'F4': UiohookKey.F4,
      'F5': UiohookKey.F5,
      'F6': UiohookKey.F6,
      'F7': UiohookKey.F7,
      'F8': UiohookKey.F8,
      'F9': UiohookKey.F9,
      'F10': UiohookKey.F10,
      'F11': UiohookKey.F11,
      'F12': UiohookKey.F12,
    };

    // 解析快捷鍵
    const parts = accelerator.split('+');
    const modifiers = {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false
    };

    let triggerKey = null;

    for (const part of parts) {
      const normalizedPart = part.trim();

      if (normalizedPart === 'CommandOrControl' || normalizedPart === 'Ctrl' || normalizedPart === 'Control') {
        modifiers.ctrl = true;
      } else if (normalizedPart === 'Shift') {
        modifiers.shift = true;
      } else if (normalizedPart === 'Alt') {
        modifiers.alt = true;
      } else if (normalizedPart === 'Meta' || normalizedPart === 'Command' || normalizedPart === 'Cmd') {
        modifiers.meta = true;
      } else {
        // 這是觸發鍵
        triggerKey = keyMap[normalizedPart];
        if (!triggerKey && normalizedPart.length === 1) {
          // 單個字母
          triggerKey = normalizedPart.toUpperCase().charCodeAt(0);
        }
      }
    }

    if (triggerKey) {
      this.triggerKeys = [triggerKey];
      this.modifiers = modifiers;
      this.safeLog('info', `TypeLess 快捷鍵已設置: ${accelerator}`, { triggerKey, modifiers });
    } else {
      this.safeLog('warn', `無法解析快捷鍵: ${accelerator}`);
    }
  }

  /**
   * 安全日誌記錄
   */
  safeLog(level, message, data = null) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message, data);
    } else {
      console[level](`[TypelessManager] ${message}`, data || '');
    }
  }

  /**
   * 清理資源
   */
  cleanup() {
    this.disable();
    this.onStartRecording = null;
    this.onStopRecording = null;
    this.onCancelRecording = null;
    this.onAiOptimizeRecordingStart = null;
    this.onAiOptimizeRecordingStop = null;
    this.aiOptimizeTriggerKeys = [];
    this.aiOptimizeRecordingActive = false;
  }
}

module.exports = { TypelessManager };

const assert = require("node:assert/strict");
const test = require("node:test");

// 不載入 uiohook-napi（避免原生模組），用輕量 stub。
// 邏輯與 src/helpers/typelessManager.js 的 TypelessManager 保持一致：
//   setAiOptimizeTrigger：固定 ID 白名單 (FIXED_IDS) 命中 → preset 鍵位；其餘 → accelerator 解析
//   _parseAccelerator：CommandOrControl 在 darwin → meta，其餘平台 → ctrl；未知鍵 → null

const FIXED_IDS = ["none", "altRight", "ctrlRight", "f11", "f12"];
const AI_OPTIMIZE_TRIGGER_PRESETS = {
  none: [],
  altRight: [3640],
  ctrlRight: [3613],
  f11: [87],
  f12: [88],
};

// 對應 typelessManager.js 的 _buildKeycodeMap()（uiohook keycode 值）
const KEYCODE_BY_ACCELERATOR = {
  A: 30, B: 48, C: 46, D: 32, E: 18, F: 33, G: 34, H: 35, I: 23, J: 36,
  K: 37, L: 38, M: 50, N: 49, O: 24, P: 25, Q: 16, R: 19, S: 31, T: 20,
  U: 22, V: 47, W: 17, X: 45, Y: 21, Z: 44,
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  Space: 57, Up: 57416, Down: 57424, Left: 57419, Right: 57421,
  Escape: 1, Enter: 40, Tab: 43,
};

class TypelessManagerStub {
  constructor(platform = process.platform) {
    this.platform = platform;
    this.aiOptimizeCustom = null;
    this.aiOptimizeTriggerKeys = [];
  }
  // 從真實實作複製的解析與比對邏輯
  setAiOptimizeTrigger(triggerValue) {
    this.aiOptimizeCustom = null;
    this.aiOptimizeTriggerKeys = [];
    if (FIXED_IDS.includes(triggerValue)) {
      this.aiOptimizeTriggerKeys = AI_OPTIMIZE_TRIGGER_PRESETS[triggerValue] || [];
    } else {
      this.aiOptimizeCustom = this._parseAccelerator(triggerValue);
    }
  }
  _parseAccelerator(accelerator) {
    if (!accelerator || typeof accelerator !== "string") return null;
    const parts = accelerator.split("+").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const modifiers = { ctrl: false, shift: false, alt: false, meta: false };
    const keyPart = parts.pop();
    for (const p of parts) {
      if (p === "CommandOrControl" || p === "Ctrl" || p === "Control") {
        if (this.platform === "darwin") modifiers.meta = true;
        else modifiers.ctrl = true;
      } else if (p === "Shift") modifiers.shift = true;
      else if (p === "Alt") modifiers.alt = true;
      else if (p === "Meta") modifiers.meta = true;
    }
    const keycode = KEYCODE_BY_ACCELERATOR[keyPart];
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
}

test("setAiOptimizeTrigger with fixed id ctrlRight sets keycode list", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("ctrlRight");
  assert.deepEqual(m.aiOptimizeTriggerKeys, [3613]);
  assert.equal(m.aiOptimizeCustom, null);
});

test("setAiOptimizeTrigger with fixed id altRight sets keycode list", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("altRight");
  assert.deepEqual(m.aiOptimizeTriggerKeys, [3640]);
  assert.equal(m.aiOptimizeCustom, null);
});

test("setAiOptimizeTrigger with fixed id f11/f12 sets keycode list", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("f11");
  assert.deepEqual(m.aiOptimizeTriggerKeys, [87]);
  assert.equal(m.aiOptimizeCustom, null);
  m.setAiOptimizeTrigger("f12");
  assert.deepEqual(m.aiOptimizeTriggerKeys, [88]);
  assert.equal(m.aiOptimizeCustom, null);
});

test("setAiOptimizeTrigger with none clears keys", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("none");
  assert.deepEqual(m.aiOptimizeTriggerKeys, []);
  assert.equal(m.aiOptimizeCustom, null);
});

test("setAiOptimizeTrigger with accelerator parses custom", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("CommandOrControl+Alt+T");
  assert.deepEqual(m.aiOptimizeCustom, { keycode: 20, modifiers: { ctrl: true, shift: false, alt: true, meta: false } });
});

test("setAiOptimizeTrigger with single key T parses custom (not disabled)", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("T");
  assert.deepEqual(m.aiOptimizeCustom, { keycode: 20, modifiers: { ctrl: false, shift: false, alt: false, meta: false } });
  assert.deepEqual(m.aiOptimizeTriggerKeys, []);
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 20, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }), true);
});

test("setAiOptimizeTrigger with Space parses custom", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("Space");
  assert.deepEqual(m.aiOptimizeCustom, { keycode: 57, modifiers: { ctrl: false, shift: false, alt: false, meta: false } });
  assert.deepEqual(m.aiOptimizeTriggerKeys, []);
});

test("setAiOptimizeTrigger with unsupported key Backspace fails parse", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("CommandOrControl+Backspace");
  assert.equal(m.aiOptimizeCustom, null);
  assert.deepEqual(m.aiOptimizeTriggerKeys, []);
});

test("parseAccelerator rejects unknown key", () => {
  const m = new TypelessManagerStub();
  assert.equal(m._parseAccelerator("CommandOrControl+Unknown"), null);
});

test("parseAccelerator rejects non-string / empty", () => {
  const m = new TypelessManagerStub();
  assert.equal(m._parseAccelerator(undefined), null);
  assert.equal(m._parseAccelerator(""), null);
  assert.equal(m._parseAccelerator("   "), null);
});

test("parseAccelerator maps CommandOrControl to meta on darwin", () => {
  const m = new TypelessManagerStub("darwin");
  m.setAiOptimizeTrigger("CommandOrControl+T");
  assert.deepEqual(m.aiOptimizeCustom, { keycode: 20, modifiers: { ctrl: false, shift: false, alt: false, meta: true } });
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 20, ctrlKey: false, shiftKey: false, altKey: false, metaKey: true }), true);
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 20, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }), false);
});

test("parseAccelerator maps CommandOrControl to ctrl on non-darwin", () => {
  const m = new TypelessManagerStub("win32");
  m.setAiOptimizeTrigger("CommandOrControl+T");
  assert.deepEqual(m.aiOptimizeCustom, { keycode: 20, modifiers: { ctrl: true, shift: false, alt: false, meta: false } });
});

test("checkAiOptimizeTrigger matches custom combo", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("CommandOrControl+Alt+T");
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 20, ctrlKey: true, shiftKey: false, altKey: true, metaKey: false }), true);
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 20, ctrlKey: true, shiftKey: true, altKey: true, metaKey: false }), false);
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 30, ctrlKey: true, shiftKey: false, altKey: true, metaKey: false }), false);
});

test("checkAiOptimizeTrigger requires meta when meta in combo", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("Ctrl+Shift+Alt+Meta+T");
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 20, ctrlKey: true, shiftKey: true, altKey: true, metaKey: true }), true);
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 20, ctrlKey: true, shiftKey: true, altKey: true, metaKey: false }), false);
});

test("checkAiOptimizeTrigger matches fixed key without modifiers", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("ctrlRight");
  assert.equal(m._checkAiOptimizeTrigger({ keycode: 3613, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }), true);
});

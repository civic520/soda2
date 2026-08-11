const assert = require("node:assert/strict");
const test = require("node:test");

// 不載入 uiohook-napi（避免原生模組），用輕量 stub
class TypelessManagerStub {
  constructor() {
    this.aiOptimizeCustom = null;
    this.aiOptimizeTriggerKeys = [];
  }
  // 從真實實作複製的解析與比對邏輯（Task 1 會同步到 typelessManager.js）
  setAiOptimizeTrigger(triggerValue) {
    if (triggerValue && triggerValue.includes("+")) {
      this.aiOptimizeCustom = this._parseAccelerator(triggerValue);
      this.aiOptimizeTriggerKeys = [];
    } else {
      const PRESETS = { none: [], altRight: [3640], ctrlRight: [3613], f11: [87], f12: [88] };
      this.aiOptimizeTriggerKeys = PRESETS[triggerValue] || [];
      this.aiOptimizeCustom = null;
    }
  }
  _parseAccelerator(acc) {
    const parts = acc.split("+").map((p) => p.trim());
    const modifiers = { ctrl: false, shift: false, alt: false, meta: false };
    const keyPart = parts.pop();
    for (const p of parts) {
      if (p === "CommandOrControl" || p === "Ctrl" || p === "Control") modifiers.ctrl = true;
      else if (p === "Shift") modifiers.shift = true;
      else if (p === "Alt") modifiers.alt = true;
      else if (p === "Meta") modifiers.meta = true;
    }
    const KEYCODES = { A: 30, B: 48, C: 46, T: 20, Space: 57, F1: 59, F11: 87, F12: 88 };
    if (!KEYCODES[keyPart]) return null;
    return { keycode: KEYCODES[keyPart], modifiers };
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

test("setAiOptimizeTrigger with none clears keys", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("none");
  assert.deepEqual(m.aiOptimizeTriggerKeys, []);
});

test("setAiOptimizeTrigger with accelerator parses custom", () => {
  const m = new TypelessManagerStub();
  m.setAiOptimizeTrigger("CommandOrControl+Alt+T");
  assert.deepEqual(m.aiOptimizeCustom, { keycode: 20, modifiers: { ctrl: true, shift: false, alt: true, meta: false } });
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

test("parseAccelerator rejects unknown key", () => {
  const m = new TypelessManagerStub();
  assert.equal(m._parseAccelerator("CommandOrControl+Unknown"), null);
});

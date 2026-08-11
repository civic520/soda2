const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const SOUNDS_DIR = path.join(__dirname, "..", "assets", "sounds");
const THEMES = ["marimba", "coin01", "coin02", "coin03", "coin05", "coin06", "coin07", "coin08", "pickup01"];

function resolveSoundName(theme, type) {
  const t = theme || "coin01";
  const isStart = type === "start";
  if (t === "marimba") {
    return isStart ? "marimba_start" : "marimba_stop";
  }
  return `${t}_${isStart ? "start" : "stop"}`;
}

test("resolveSoundName maps marimba theme to marimba start/stop", () => {
  assert.equal(resolveSoundName("marimba", "start"), "marimba_start");
  assert.equal(resolveSoundName("marimba", "stop"), "marimba_stop");
});

test("resolveSoundName maps custom theme to theme_start/stop", () => {
  assert.equal(resolveSoundName("coin01", "start"), "coin01_start");
  assert.equal(resolveSoundName("coin01", "stop"), "coin01_stop");
  assert.equal(resolveSoundName("pickup01", "start"), "pickup01_start");
});

test("resolveSoundName falls back to coin01 when theme missing", () => {
  assert.equal(resolveSoundName(null, "start"), "coin01_start");
  assert.equal(resolveSoundName("", "stop"), "coin01_stop");
});

test("all theme sound files exist in assets/sounds", () => {
  const missing = [];
  for (const t of THEMES) {
    for (const s of ["start", "stop"]) {
      const f = path.join(SOUNDS_DIR, `${t}_${s}.wav`);
      if (!fs.existsSync(f)) missing.push(`${t}_${s}.wav`);
    }
  }
  assert.deepEqual(missing, []);
});

test("stop sound has more samples than start (lower pitch)", () => {
  // 用簡單的 wav header 解析（PCM 16-bit mono）驗證 stop > start samples
  function readSamples(file) {
    const buf = fs.readFileSync(file);
    const dataSize = buf.readUInt32LE(40);
    return dataSize / 2; // 16-bit = 2 bytes/sample
  }
  for (const t of ["coin01", "coin03", "pickup01"]) {
    const startS = readSamples(path.join(SOUNDS_DIR, `${t}_start.wav`));
    const stopS = readSamples(path.join(SOUNDS_DIR, `${t}_stop.wav`));
    assert.ok(stopS > startS, `${t}: stop(${stopS}) should have more samples than start(${startS})`);
  }
});

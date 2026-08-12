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

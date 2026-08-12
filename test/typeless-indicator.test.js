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

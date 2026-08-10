const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const Module = require("node:module");
const os = require("node:os");
const electronEntry = require.resolve("electron");
require.cache[electronEntry] = {
  id: electronEntry,
  filename: electronEntry,
  loaded: true,
  exports: { app: { isPackaged: false, getPath: () => os.tmpdir() } },
};

const SherpaManager = require("../src/helpers/sherpaManager");

test("buildPythonEnvironment includes SHERPA_PROVIDER cuda when acceleration gpu", async () => {
  const manager = new SherpaManager(null, { platform: "win32" });
  manager.databaseManager = { getSetting: (k, d) => (k === "asr_acceleration" ? "gpu" : d) };
  const detector = {
    resolveForEngine: async () => ({ provider: "cuda" }),
  };
  const env = await manager.buildAccelerationEnv(detector);
  assert.equal(env.SHERPA_PROVIDER, "cuda");
});

test("buildAccelerationEnv logs warning and falls back to cpu when gpu unavailable", async () => {
  const logs = [];
  const manager = new SherpaManager({ warn: (m) => logs.push(m) }, { platform: "win32" });
  manager.databaseManager = { getSetting: (k, d) => (k === "asr_acceleration" ? "gpu" : d) };
  const detector = {
    resolveForEngine: async () => ({ provider: "cpu", warning: "no gpu" }),
  };
  const env = await manager.buildAccelerationEnv(detector);
  assert.equal(env.SHERPA_PROVIDER, "cpu");
  assert.ok(logs.length > 0);
});

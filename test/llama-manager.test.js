const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const LlamaManager = require("../src/helpers/llamaManager");

test("llama model config exposes gguf required files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const config = manager.getModelConfig();
  assert.equal(config.name, "qwen3-asr-1.7b-gguf");
  assert.ok(Array.isArray(config.required_files) && config.required_files.length >= 1);
  assert.ok(typeof config.mmproj_url === "string" && config.mmproj_url.length > 0);
});

test("llama model cache path resolves under userData/models", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-win-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  assert.equal(manager.getModelCachePath(), path.join(tmp, "models", "qwen3-asr-1.7b-gguf"));
});

test("llama server binary path points at llama-server.exe on win32", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-bin-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  assert.equal(path.basename(manager.getLlamaServerPath()), "llama-server.exe");
});

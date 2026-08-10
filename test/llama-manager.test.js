const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");

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

test("checkModelFiles reports not downloaded when model dir missing", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-check-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const result = await manager.checkModelFiles();
  assert.equal(result.success, true);
  assert.equal(result.models_downloaded, false);
  assert.deepEqual(result.missing_models, ["asr"]);
});

test("checkModelFiles reports downloaded when gguf exists with size", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-check2-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const config = manager.getModelConfig();
  const dir = manager.getModelCachePath();
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "Qwen3-ASR-1.7B-Q4_K_M.gguf"), "x".repeat(1024));
  if (config.mmproj_url) {
    await fs.promises.writeFile(path.join(dir, path.basename(config.mmproj_url)), "x".repeat(1024));
  }
  const result = await manager.checkModelFiles();
  assert.equal(result.models_downloaded, true);
  assert.equal(result.details.model_path, dir);
});

test("deleteModelFiles returns success when model directory does not exist", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-del-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const result = await manager.deleteModelFiles();
  assert.deepEqual(result, { success: true });
});

test("downloadFile follows redirects with relative location", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-dl-"));
  const dest = path.join(tmp, "out.bin");
  const calls = [];
  const fakeGet = (url, cb) => {
    calls.push(url);
    if (calls.length === 1) {
      cb({ statusCode: 307, headers: { location: "/api/resolve-cache/x" } });
      return { on: () => {}, destroy: () => {} };
    }
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = { "content-length": "4" };
    response.pipe = (stream) => {
      stream.end();
      process.nextTick(() => response.emit("data", Buffer.from("abcd")));
      process.nextTick(() => response.emit("end"));
    };
    cb(response);
    return { on: () => {} };
  };
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp, httpsGet: fakeGet });
  const finishHandlers = [];
  const stream = {
    write() {},
    end() { process.nextTick(() => finishHandlers.forEach((cb) => cb())); },
    on(ev, cb) { if (ev === "finish") finishHandlers.push(cb); },
    close(cb) { if (cb) cb(); },
    emit() {},
  };
  const fsCreateWriteStream = fs.createWriteStream;
  fs.createWriteStream = () => stream;
  try {
    await manager.downloadFile("https://huggingface.co/a/b", dest);
  } finally {
    fs.createWriteStream = fsCreateWriteStream;
  }
  assert.ok(calls.length >= 2);
  assert.ok(calls[1].includes("huggingface.co"));
});

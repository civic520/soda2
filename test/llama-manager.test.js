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
  const writeComplete = async (name) => {
    const expected = config.file_sizes && config.file_sizes[name];
    const fd = await fs.promises.open(path.join(dir, name), "w");
    await fd.truncate(expected || 1024);
    await fd.close();
  };
  await writeComplete("Qwen3-ASR-1.7B-Q4_K_M.gguf");
  if (config.mmproj_url) {
    await writeComplete(path.basename(config.mmproj_url));
  }
  const result = await manager.checkModelFiles();
  assert.equal(result.models_downloaded, true);
  assert.equal(result.details.model_path, dir);
});

test("checkModelFiles reports missing files when model dir exists but gguf missing", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-check3-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const dir = manager.getModelCachePath();
  await fs.promises.mkdir(dir, { recursive: true });
  const result = await manager.checkModelFiles();
  assert.equal(result.success, true);
  assert.equal(result.models_downloaded, false);
  assert.ok(result.details.missing_files.length > 0);
});

test("getDownloadProgress returns zero progress when model dir exists but files missing", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-prog-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const dir = manager.getModelCachePath();
  await fs.promises.mkdir(dir, { recursive: true });
  const result = await manager.getDownloadProgress();
  assert.equal(result.success, true);
  assert.equal(result.overall_progress, 0);
});

test("ensureModelAvailable downloads missing gguf when model dir exists", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-ensure-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const dir = manager.getModelCachePath();
  await fs.promises.mkdir(dir, { recursive: true });
  const config = manager.getModelConfig();
  const writeFile = async (url, dest) => {
    const expected = config.file_sizes && config.file_sizes[path.basename(dest)];
    const size = expected || 1024;
    const fd = await fs.promises.open(dest, "w");
    await fd.truncate(size);
    await fd.close();
  };
  manager.downloadFile = writeFile;
  const result = await manager.ensureModelAvailable();
  assert.equal(result.success, true);
  assert.equal(result.model_path, dir);
  assert.ok(fs.existsSync(path.join(dir, "Qwen3-ASR-1.7B-Q4_K_M.gguf")));
  if (config.mmproj_url) {
    assert.ok(fs.existsSync(path.join(dir, path.basename(config.mmproj_url))));
  }
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
  manager._forceDeletePath = () => {};
  manager._getExistingFileSize = () => 4;
  const fsCreateWriteStream = fs.createWriteStream;
  const fsRenameSync = fs.renameSync;
  fs.createWriteStream = () => stream;
  fs.renameSync = () => {};
  try {
    await manager.downloadFile("https://huggingface.co/a/b", dest);
  } finally {
    fs.createWriteStream = fsCreateWriteStream;
    fs.renameSync = fsRenameSync;
  }
  assert.ok(calls.length >= 2);
  assert.ok(calls[1].includes("huggingface.co"));
});

test("waitForServerReady polls the health endpoint", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-health-"));
  const calls = [];
  const fakeGet = (url, cb) => {
    calls.push(url);
    cb({ statusCode: 200, headers: {} });
    return { on: () => {}, destroy: () => {} };
  };
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp, httpsGet: fakeGet });
  manager.serverPort = 8234;
  const ready = await manager._waitForServerReady(3000);
  assert.equal(ready, true);
  assert.ok(calls.length >= 1);
});

test("ensureFfmpegAvailable resolves when ffmpeg already in PATH", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-ffmpeg-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  manager._findFfmpeg = async () => ({ success: true, ffmpegDir: "C:\\found" });
  const result = await manager.ensureFfmpegAvailable();
  assert.equal(result.success, true);
});

test("startServer deduplicates concurrent calls (single spawn)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-concurrent-"));
  let spawnCount = 0;
  const fakeProc = new EventEmitter();
  fakeProc.kill = () => {};
  fakeProc.stdout = new EventEmitter();
  fakeProc.stderr = new EventEmitter();
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp, spawnFn: () => { spawnCount++; return fakeProc; } });
  manager.ensureLlamaBinary = async () => ({ success: true, binaryPath: path.join(manager.getBinaryDir(), "llama-server.exe") });
  manager.ensureModelAvailable = async () => ({ success: true, model_path: manager.getModelCachePath() });
  manager.ensureFfmpegAvailable = async () => ({ success: true, ffmpegDir: null });
  manager.ensureCudaRuntime = async () => ({ success: true });
  manager._findFfmpeg = async () => ({ success: true, ffmpegDir: null });
  manager._waitForServerReady = async () => true;
  manager.accelerationDetector = { resolveForEngine: async () => ({ ngl: false }) };
  await Promise.all([manager.startServer(), manager.startServer()]);
  assert.equal(spawnCount, 1);
  assert.equal(manager.serverReady, true);
  assert.equal(manager.initializationPromise, null);
});

test("startServer resets initializationPromise after failure so it can be retried", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-fail-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  manager.ensureLlamaBinary = async () => { throw new Error("boom"); };
  await assert.rejects(() => manager.startServer(), /boom/);
  assert.equal(manager.initializationPromise, null);
});

test("_persistAudio writes blob into userData/audio and returns the path", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-persist-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const blob = Buffer.from("RIFF-test-audio");
  const dest = manager._persistAudio(blob);
  assert.ok(typeof dest === "string" && dest.includes(path.join("audio", "rec_")));
  let exists = false;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(dest)) { exists = true; break; }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(exists, true);
  assert.deepEqual(fs.readFileSync(dest), blob);
});

test("transcribeAudio returns null audio_path when save_audio disabled", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-nopersist-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  manager.serverReady = true;
  manager.databaseManager = { getSetting: (key, def) => (key === "save_audio" ? false : def) };
  const http = require("node:http");
  const origRequest = http.request;
  const res = new EventEmitter();
  res.statusCode = 200;
  http.request = (opts, cb) => {
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => process.nextTick(() => {
      cb(res);
      process.nextTick(() => {
        res.emit("data", Buffer.from(JSON.stringify({ choices: [{ message: { content: "測試文字" } }] })));
        res.emit("end");
      });
    });
    return req;
  };
  try {
    const result = await manager.transcribeAudio(Buffer.from("audio"), { no_persist: true });
    assert.equal(result.success, true);
    assert.equal(result.text, "測試文字");
    assert.equal(result.audio_path, null);
  } finally {
    http.request = origRequest;
  }
});

test("transcribeAudio persists audio_path when save_audio enabled", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-persist2-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  manager.serverReady = true;
  const http = require("node:http");
  const origRequest = http.request;
  const res = new EventEmitter();
  res.statusCode = 200;
  http.request = (opts, cb) => {
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => process.nextTick(() => {
      cb(res);
      process.nextTick(() => {
        res.emit("data", Buffer.from(JSON.stringify({ choices: [{ message: { content: "測試文字" } }] })));
        res.emit("end");
      });
    });
    return req;
  };
  try {
    const result = await manager.transcribeAudio(Buffer.from("audio"), {});
    assert.equal(result.success, true);
    assert.ok(typeof result.audio_path === "string" && result.audio_path.length > 0);
    let exists = false;
    for (let i = 0; i < 20; i++) {
      if (fs.existsSync(result.audio_path)) { exists = true; break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(exists, true);
  } finally {
    http.request = origRequest;
  }
});

test("ensureLlamaBinary caps overall_progress at 50 for binary stage", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-binprog-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  manager.downloadFile = async (url, dest, cb) => {
    cb({ downloaded: 100, total: 100, progress: 100 });
  };
  manager.extractZip = async () => {
    await fs.promises.mkdir(manager.getBinaryDir(), { recursive: true });
    await fs.promises.writeFile(manager.getLlamaServerPath(), "x");
  };
  manager._forceDeletePath = () => {};
  const events = [];
  await manager.ensureLlamaBinary((p) => events.push(p));
  assert.ok(events.length >= 2);
  assert.ok(events[0].overall_progress <= 50);
  assert.equal(events[events.length - 1].stage, "finished");
  assert.equal(events[events.length - 1].overall_progress, 50);
});

test("ensureModelAvailable reports overall_progress in 50-100 range", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-modelprog-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  manager._forceDeletePath = () => {};
  const config = manager.getModelConfig();
  const writeFile = async (url, dest, cb) => {
    cb({ downloaded: 10, total: 20, progress: 50 });
    const expected = config.file_sizes && config.file_sizes[path.basename(dest)];
    const size = expected || 1024;
    const fd = await fs.promises.open(dest, "w");
    await fd.truncate(size);
    await fd.close();
  };
  manager.downloadFile = writeFile;
  const events = [];
  await manager.ensureModelAvailable((p) => events.push(p));
  assert.ok(events.length > 0);
  for (const ev of events.slice(0, -1)) {
    assert.ok(ev.overall_progress >= 50 && ev.overall_progress <= 100);
  }
  assert.equal(events[events.length - 1].stage, "finished");
  assert.equal(events[events.length - 1].overall_progress, 100);
});

test("checkModelFiles treats partial download as missing", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-partial-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  const dir = manager.getModelCachePath();
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "Qwen3-ASR-1.7B-Q4_K_M.gguf"), "partial");
  const result = await manager.checkModelFiles();
  assert.equal(result.models_downloaded, false);
  assert.deepEqual(result.details.missing_files, ["Qwen3-ASR-1.7B-Q4_K_M.gguf", "mmproj-Qwen3-ASR-1.7B-Q4_K_M.gguf"]);
});

test("cleanAsrText strips language prefix and asr_text markers", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-clean-"));
  const manager = new LlamaManager(null, { platform: "win32", userDataPath: tmp, projectRoot: tmp });
  assert.equal(
    manager._cleanAsrText("language Chinese<asr_text>大家好，這是測試。"),
    "大家好，這是測試。"
  );
  assert.equal(
    manager._cleanAsrText("language Chinese<asr_text>hello world<|endofasr|>"),
    "hello world"
  );
  assert.equal(
    manager._cleanAsrText("no markers here"),
    "no markers here"
  );
  assert.equal(manager._cleanAsrText(""), "");
});

test("startServer adds -ngl when acceleration resolves ngl true", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-ngl-"));
  let spawnedArgs = null;
  const fakeProc = new EventEmitter();
  fakeProc.kill = () => {};
  fakeProc.stdout = new EventEmitter();
  fakeProc.stderr = new EventEmitter();
  const manager = new LlamaManager(null, {
    platform: "win32",
    userDataPath: tmp,
    projectRoot: tmp,
    spawnFn: (_cmd, args) => { spawnedArgs = args; return fakeProc; },
  });
  manager.databaseManager = { getSetting: (k, d) => (k === "asr_acceleration" ? "gpu" : d) };
  manager.ensureLlamaBinary = async () => ({ success: true, binaryPath: path.join(manager.getBinaryDir(), "llama-server.exe") });
  manager.ensureModelAvailable = async () => ({ success: true, model_path: manager.getModelCachePath() });
  manager.ensureFfmpegAvailable = async () => ({ success: true, ffmpegDir: null });
  manager.ensureCudaRuntime = async () => ({ success: true });
  manager._findFfmpeg = async () => ({ success: true, ffmpegDir: null });
  manager._waitForServerReady = async () => true;
  manager.accelerationDetector = { resolveForEngine: async () => ({ ngl: true }) };
  await manager.startServer();
  assert.ok(spawnedArgs.includes("-ngl"));
  assert.ok(spawnedArgs.includes("999"));
  await manager.stopServer();
});

test("startServer omits -ngl when acceleration resolves ngl false", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-llama-nongl-"));
  let spawnedArgs = null;
  const fakeProc = new EventEmitter();
  fakeProc.kill = () => {};
  fakeProc.stdout = new EventEmitter();
  fakeProc.stderr = new EventEmitter();
  const manager = new LlamaManager(null, {
    platform: "win32",
    userDataPath: tmp,
    projectRoot: tmp,
    spawnFn: (_cmd, args) => { spawnedArgs = args; return fakeProc; },
  });
  manager.databaseManager = { getSetting: (k, d) => (k === "asr_acceleration" ? "cpu" : d) };
  manager.ensureLlamaBinary = async () => ({ success: true, binaryPath: path.join(manager.getBinaryDir(), "llama-server.exe") });
  manager.ensureModelAvailable = async () => ({ success: true, model_path: manager.getModelCachePath() });
  manager.ensureFfmpegAvailable = async () => ({ success: true, ffmpegDir: null });
  manager._findFfmpeg = async () => ({ success: true, ffmpegDir: null });
  manager._waitForServerReady = async () => true;
  manager.accelerationDetector = { resolveForEngine: async () => ({ ngl: false }) };
  await manager.startServer();
  assert.equal(spawnedArgs.includes("-ngl"), false);
  await manager.stopServer();
});

const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const AccelerationDetector = require("../src/helpers/acceleration");

function makeDetector({ gpuAvailable, spawnError = false, execFileError = false }) {
  let spawnCount = 0;
  const fakeSpawn = () => {
    spawnCount += 1;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    if (spawnError) {
      process.nextTick(() => child.emit("error", new Error("spawn ENOENT")));
    } else if (gpuAvailable) {
      process.nextTick(() => child.stdout.emit("data", "NVIDIA GeForce GTX 1660 Ti"));
      process.nextTick(() => child.emit("close", 0));
    } else {
      process.nextTick(() => child.emit("close", 1));
    }
    return child;
  };
  const detector = new AccelerationDetector({
    spawnFn: fakeSpawn,
    execFileSync: execFileError
      ? () => {
          throw new Error("ENOENT");
        }
      : () => "C:\\nvidia-smi.exe",
  });
  return { detector, spawnCount: () => spawnCount };
}

test("detectGpu returns available true when nvidia-smi reports GPU", async () => {
  const { detector } = makeDetector({ gpuAvailable: true });
  const result = await detector.detectGpu();
  assert.equal(result.available, true);
});

test("detectGpu returns available false when nvidia-smi fails", async () => {
  const { detector } = makeDetector({ gpuAvailable: false });
  const result = await detector.detectGpu();
  assert.equal(result.available, false);
});

test("detectGpu caches result so nvidia-smi is probed only once", async () => {
  const { detector, spawnCount } = makeDetector({ gpuAvailable: true });
  const first = await detector.detectGpu();
  const second = await detector.detectGpu();
  assert.equal(first.available, true);
  assert.equal(second.available, true);
  assert.equal(spawnCount(), 1);
});

test("detectGpu returns unavailable reason when nvidia-smi not on PATH", async () => {
  const { detector } = makeDetector({ gpuAvailable: true, execFileError: true });
  const result = await detector.detectGpu();
  assert.deepEqual(result, { available: false, reason: "nvidia-smi 不在 PATH" });
});

test("detectGpu returns unavailable reason when spawn fails", async () => {
  const { detector } = makeDetector({ gpuAvailable: true, spawnError: true });
  const result = await detector.detectGpu();
  assert.deepEqual(result, { available: false, reason: "無法執行 nvidia-smi" });
});

test("resolveForEngine llama cpu returns ngl false", async () => {
  const { detector } = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("llama", "cpu");
  assert.deepEqual(result, { ngl: false });
});

test("resolveForEngine sherpa cpu returns cpu", async () => {
  const { detector } = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("sherpa", "cpu");
  assert.deepEqual(result, { provider: "cpu" });
});

test("resolveForEngine llama auto with GPU returns ngl true", async () => {
  const { detector } = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("llama", "auto");
  assert.deepEqual(result, { ngl: true });
});

test("resolveForEngine llama gpu with GPU returns ngl true", async () => {
  const { detector } = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("llama", "gpu");
  assert.deepEqual(result, { ngl: true });
});

test("resolveForEngine sherpa auto with GPU returns cuda", async () => {
  const { detector } = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("sherpa", "auto");
  assert.deepEqual(result, { provider: "cuda" });
});

test("resolveForEngine sherpa gpu with GPU returns cuda", async () => {
  const { detector } = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("sherpa", "gpu");
  assert.deepEqual(result, { provider: "cuda" });
});

test("resolveForEngine llama auto without GPU returns ngl false", async () => {
  const { detector } = makeDetector({ gpuAvailable: false });
  const result = await detector.resolveForEngine("llama", "auto");
  assert.deepEqual(result, { ngl: false });
});

test("resolveForEngine llama gpu without GPU returns ngl false with warning", async () => {
  const { detector } = makeDetector({ gpuAvailable: false });
  const result = await detector.resolveForEngine("llama", "gpu");
  assert.deepEqual(result, { ngl: false, warning: "已選擇 GPU 加速但未偵測到 NVIDIA GPU，將退回 CPU" });
});

test("resolveForEngine sherpa auto without GPU returns cpu", async () => {
  const { detector } = makeDetector({ gpuAvailable: false });
  const result = await detector.resolveForEngine("sherpa", "auto");
  assert.deepEqual(result, { provider: "cpu" });
});

test("resolveForEngine sherpa gpu without GPU returns cpu with warning", async () => {
  const { detector } = makeDetector({ gpuAvailable: false });
  const result = await detector.resolveForEngine("sherpa", "gpu");
  assert.deepEqual(result, { provider: "cpu", warning: "已選擇 GPU 加速但未偵測到 NVIDIA GPU，將退回 CPU" });
});

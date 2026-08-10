const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const AccelerationDetector = require("../src/helpers/acceleration");

function makeDetector({ gpuAvailable, spawnError = false }) {
  const fakeSpawn = () => {
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
  return new AccelerationDetector({ spawnFn: fakeSpawn });
}

test("detectGpu returns available true when nvidia-smi reports GPU", async () => {
  const detector = makeDetector({ gpuAvailable: true });
  const result = await detector.detectGpu();
  assert.equal(result.available, true);
});

test("detectGpu returns available false when nvidia-smi fails", async () => {
  const detector = makeDetector({ gpuAvailable: false });
  const result = await detector.detectGpu();
  assert.equal(result.available, false);
});

test("detectGpu caches result", async () => {
  const detector = makeDetector({ gpuAvailable: true });
  await detector.detectGpu();
  const second = await detector.detectGpu();
  assert.equal(second.available, true);
});

test("resolveForEngine sherpa auto with GPU returns cuda", async () => {
  const detector = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("sherpa", "auto");
  assert.deepEqual(result, { provider: "cuda" });
});

test("resolveForEngine sherpa cpu returns cpu", async () => {
  const detector = makeDetector({ gpuAvailable: true });
  const result = await detector.resolveForEngine("sherpa", "cpu");
  assert.deepEqual(result, { provider: "cpu" });
});

test("resolveForEngine llama gpu without GPU returns ngl false with warning", async () => {
  const detector = makeDetector({ gpuAvailable: false });
  const result = await detector.resolveForEngine("llama", "gpu");
  assert.equal(result.ngl, false);
  assert.ok(result.warning);
});

test("resolveForEngine llama auto without GPU returns ngl false", async () => {
  const detector = makeDetector({ gpuAvailable: false });
  const result = await detector.resolveForEngine("llama", "auto");
  assert.equal(result.ngl, false);
});

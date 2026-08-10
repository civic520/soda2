const { spawn, execFileSync } = require("child_process");

const GPU_CACHE_TTL = 5 * 60 * 1000;

class AccelerationDetector {
  constructor(options = {}) {
    this.spawnFn = options.spawnFn || spawn;
    this.execFileSync = options.execFileSync || execFileSync;
    this._gpuCache = null;
    this._gpuCacheTime = 0;
  }

  async detectGpu() {
    const now = Date.now();
    if (this._gpuCache && now - this._gpuCacheTime < GPU_CACHE_TTL) {
      return this._gpuCache;
    }
    const result = await this._probeNvidiaSmi();
    this._gpuCache = result;
    this._gpuCacheTime = now;
    return result;
  }

  _probeNvidiaSmi() {
    return new Promise((resolve) => {
      let cmd = "nvidia-smi";
      let args = [];
      if (process.platform === "win32") {
        try {
          const found = this.execFileSync("where", ["nvidia-smi"], { windowsHide: true, stdio: "pipe" });
          cmd = found.toString().trim().split("\n")[0] || "nvidia-smi";
        } catch (e) {
          resolve({ available: false, reason: "nvidia-smi 不在 PATH" });
          return;
        }
      }
      let output = "";
      const child = this.spawnFn(cmd, args, { windowsHide: true });
      child.stdout && child.stdout.on("data", (d) => (output += d.toString()));
      child.stderr && child.stderr.on("data", () => {});
      child.on("error", () => resolve({ available: false, reason: "無法執行 nvidia-smi" }));
      child.on("close", (code) => {
        if (code === 0 && /NVIDIA|GeForce|RTX|GTX|Quadro|Tesla/.test(output)) {
          resolve({ available: true });
        } else {
          resolve({ available: false, reason: "未偵測到 NVIDIA GPU" });
        }
      });
    });
  }

  async resolveForEngine(engine, setting) {
    const mode = setting || "auto";
    if (mode === "cpu") {
      return engine === "sherpa" ? { provider: "cpu" } : { ngl: false };
    }
    if (mode === "gpu") {
      const gpu = await this.detectGpu();
      if (gpu.available) {
        return engine === "sherpa" ? { provider: "cuda" } : { ngl: true };
      }
      const warning = "已選擇 GPU 加速但未偵測到 NVIDIA GPU，將退回 CPU";
      return engine === "sherpa" ? { provider: "cpu", warning } : { ngl: false, warning };
    }
    const gpu = await this.detectGpu();
    if (gpu.available) {
      return engine === "sherpa" ? { provider: "cuda" } : { ngl: true };
    }
    return engine === "sherpa" ? { provider: "cpu" } : { ngl: false };
  }
}

module.exports = AccelerationDetector;

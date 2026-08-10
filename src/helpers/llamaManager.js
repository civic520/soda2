const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const LLAMA_MODEL_CONFIG = {
  name: "qwen3-asr-1.7b-gguf",
  expected_size: (1223 + 211) * 1024 * 1024,
  required_files: ["Qwen3-ASR-1.7B-Q4_K_M.gguf"],
  url: "https://huggingface.co/foryoung365/Qwen3-ASR-1.7B-Q4_K_M-GGUF/resolve/main/Qwen3-ASR-1.7B-Q4_K_M.gguf",
  mmproj_url: "https://huggingface.co/foryoung365/Qwen3-ASR-1.7B-Q4_K_M-GGUF/resolve/main/mmproj-Qwen3-ASR-1.7B-Q4_K_M.gguf",
  binary_url: "https://github.com/ggml-org/llama.cpp/releases/download/b9562/llama-b9562-bin-win-cuda-12.4-x64.zip",
  binary_filename: "llama-b9562-bin-win-cuda-12.4-x64.zip",
};

class LlamaManager {
  constructor(logger = null, options = {}) {
    this.logger = logger || console;
    this.platform = options.platform || process.platform;
    this.userDataPath = options.userDataPath || null;
    this.projectRoot = options.projectRoot || path.join(__dirname, "..", "..");
    this.spawnFn = options.spawnFn || spawn;
    this.httpsGet = options.httpsGet || https.get;
    this.databaseManager = null;
    this.serverProcess = null;
    this.serverReady = false;
    this.initializationPromise = null;
  }

  setDatabaseManager(databaseManager) {
    this.databaseManager = databaseManager;
  }

  getModelConfig() {
    return LLAMA_MODEL_CONFIG;
  }

  getUserDataPath() {
    if (this.userDataPath) return this.userDataPath;
    try {
      return require("electron").app.getPath("userData");
    } catch (e) {
      return path.join(os.homedir(), ".soda2");
    }
  }

  getModelCachePath() {
    return path.join(this.getUserDataPath(), "models", LLAMA_MODEL_CONFIG.name);
  }

  getBinaryDir() {
    return path.join(this.getUserDataPath(), "llama", "bin");
  }

  getLlamaServerPath() {
    const exe = this.platform === "win32" ? "llama-server.exe" : "llama-server";
    return path.join(this.getBinaryDir(), exe);
  }
}

module.exports = LlamaManager;

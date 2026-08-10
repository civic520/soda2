const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { spawn, execSync } = require("child_process");

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

  downloadFile(url, destPath, progressCallback = null) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const request = this.httpsGet(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.promises.unlink(destPath).catch(() => {});
          const location = response.headers.location;
          const next = location.startsWith("http") ? location : new URL(location, url).href;
          this.downloadFile(next, destPath, progressCallback).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          fs.promises.unlink(destPath).catch(() => {});
          reject(new Error(`Download failed with HTTP ${response.statusCode}`));
          return;
        }
        const total = Number(response.headers["content-length"] || 0);
        let downloaded = 0;
        response.on("data", (chunk) => {
          downloaded += chunk.length;
          if (progressCallback && total > 0) {
            progressCallback({ downloaded, total, progress: Math.round((downloaded / total) * 1000) / 10 });
          }
        });
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      });
      request.on("error", (error) => {
        file.close();
        fs.promises.unlink(destPath).catch(() => {});
        reject(error);
      });
      file.on("error", (error) => {
        request.destroy();
        reject(error);
      });
    });
  }

  extractZip(zipPath, targetDir) {
    return new Promise((resolve, reject) => {
      if (this.platform === "win32") {
        const { execFile } = require("child_process");
        execFile("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`], { windowsHide: true }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      } else {
        const { execFile } = require("child_process");
        execFile("unzip", ["-o", zipPath, "-d", targetDir], { windowsHide: true }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      }
    });
  }

  _forceDeletePath(filePath) {
    try { fs.unlinkSync(filePath); return; } catch (e) { /* continue */ }
    try { fs.chmodSync(filePath, 0o777); fs.unlinkSync(filePath); return; } catch (e) { /* continue */ }
    if (this.platform === "win32") {
      try {
        execSync(`attrib -R "${filePath}" & del /F /Q /A "${filePath}"`, { windowsHide: true, stdio: "ignore", timeout: 10000 });
        return;
      } catch (e) { /* continue */ }
      try {
        execSync(`takeown /F "${filePath}" & icacls "${filePath}" /grant Everyone:F & del /F /Q /A "${filePath}"`, { windowsHide: true, stdio: "ignore", timeout: 10000 });
      } catch (e) { /* give up */ }
    }
  }

  _removeDirectoryRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch (e) {
      this.logger.warn && this.logger.warn(`無法讀取目錄 ${dirPath}: ${e.message}`);
      this._forceDeletePath(dirPath);
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isDirectory()) {
          this._removeDirectoryRecursive(fullPath);
        } else {
          this._forceDeletePath(fullPath);
        }
      } catch (e) {
        if (e.code === "EPERM") {
          this.logger.warn && this.logger.warn(`無法存取 ${fullPath}，嘗試強制刪除`);
          this._forceDeletePath(fullPath);
        } else {
          this.logger.warn && this.logger.warn(`無法處理 ${fullPath}: ${e.message}`);
        }
      }
    }
    try {
      fs.rmdirSync(dirPath);
    } catch (e) {
      if (e.code === "ENOENT") return;
      this.logger.warn && this.logger.warn(`無法刪除目錄 ${dirPath}: ${e.message}`);
    }
  }

  _getExistingFileSize(filePath) {
    if (!fs.existsSync(filePath)) {
      this._forceDeletePath(filePath);
      return 0;
    }
    try {
      const st = fs.statSync(filePath);
      return st.size > 0 ? st.size : 0;
    } catch (e) {
      if (e.code === "EPERM") {
        this.logger.warn && this.logger.warn(`檔案權限異常，嘗試強制清除: ${filePath}`);
        this._forceDeletePath(filePath);
        return 0;
      }
      throw e;
    }
  }

  async ensureLlamaBinary(progressCallback = null) {
    const binPath = this.getLlamaServerPath();
    if (fs.existsSync(binPath)) {
      return { success: true, binaryPath: binPath, already_downloaded: true };
    }
    const config = this.getModelConfig();
    const zipPath = path.join(this.getBinaryDir(), config.binary_filename);
    await fs.promises.mkdir(this.getBinaryDir(), { recursive: true });
    await this.downloadFile(config.binary_url, zipPath, (p) => {
      if (progressCallback) progressCallback({ stage: "downloading-binary", model: "asr", progress: p.progress, overall_progress: Math.round(p.progress / 2) });
    });
    await this.extractZip(zipPath, this.getBinaryDir());
    this._forceDeletePath(zipPath);
    if (!fs.existsSync(binPath)) {
      throw new Error("llama.cpp 二進位解壓後未找到 llama-server");
    }
    if (progressCallback) {
      progressCallback({ stage: "finished", model: "asr", progress: 100, overall_progress: 100 });
    }
    return { success: true, binaryPath: binPath };
  }

  async ensureModelAvailable(progressCallback = null) {
    const status = await this.checkModelFiles();
    if (status.models_downloaded) {
      return { success: true, already_downloaded: true, model_path: status.details.model_path };
    }
    const config = this.getModelConfig();
    const targetDir = this.getModelCachePath();
    if (fs.existsSync(targetDir)) {
      this._removeDirectoryRecursive(targetDir);
    }
    await fs.promises.mkdir(targetDir, { recursive: true });
    let overallTotal = config.expected_size;
    let overallDownloaded = 0;
    const files = [];
    for (const f of config.required_files) files.push(f);
    if (config.mmproj_url) files.push(path.basename(config.mmproj_url));
    for (const filename of files) {
      const dest = path.join(targetDir, filename);
      const existing = this._getExistingFileSize(dest);
      if (existing > 0) {
        overallDownloaded += existing;
        continue;
      }
      const url = filename.startsWith("mmproj")
        ? config.mmproj_url
        : config.url;
      await this.downloadFile(url, dest, (p) => {
        const currentOverall = overallDownloaded + p.downloaded;
        const pct = Math.min(99, Math.round((currentOverall / overallTotal) * 100));
        if (progressCallback) {
          progressCallback({ stage: "downloading", model: "asr", progress: pct, overall_progress: pct });
        }
      });
      const postSize = this._getExistingFileSize(dest);
      if (postSize === 0) {
        this._forceDeletePath(dest);
        throw new Error(`下載的模型檔案為空（0 bytes）`);
      }
      overallDownloaded += postSize;
    }
    if (progressCallback) {
      progressCallback({ stage: "finished", model: "asr", progress: 100, overall_progress: 100 });
    }
    return { success: true, model_path: targetDir };
  }

  async checkModelFiles() {
    try {
      const modelPath = this.getModelCachePath();
      if (!fs.existsSync(modelPath)) {
        return {
          success: true,
          models_downloaded: false,
          missing_models: ["asr"],
          directory_exists: false,
          details: { model_path: modelPath, missing_files: [] },
        };
      }
      const config = this.getModelConfig();
      const missingFiles = [];
      for (const f of config.required_files) {
        if (this._getExistingFileSize(path.join(modelPath, f)) <= 0) missingFiles.push(f);
      }
      if (config.mmproj_url) {
        const m = path.basename(config.mmproj_url);
        if (this._getExistingFileSize(path.join(modelPath, m)) <= 0) missingFiles.push(m);
      }
      const allDownloaded = missingFiles.length === 0;
      return {
        success: true,
        models_downloaded: allDownloaded,
        missing_models: allDownloaded ? [] : ["asr"],
        directory_exists: true,
        details: { model_path: modelPath, missing_files: missingFiles },
      };
    } catch (error) {
      return { success: false, error: error.message, models_downloaded: false, missing_models: ["asr"], details: {} };
    }
  }

  async getDownloadProgress() {
    try {
      const config = this.getModelConfig();
      const modelPath = this.getModelCachePath();
      if (!fs.existsSync(modelPath)) {
        return { success: true, overall_progress: 0, models: { asr: { progress: 0, downloaded: 0, total: config.expected_size } } };
      }
      const mainFiles = [...config.required_files];
      if (config.mmproj_url) mainFiles.push(path.basename(config.mmproj_url));
      let fileSize = 0;
      for (const f of mainFiles) {
        const sz = this._getExistingFileSize(path.join(modelPath, f));
        if (sz > 0) fileSize += sz;
      }
      const progress = Math.min(100, (fileSize / config.expected_size) * 100);
      return {
        success: true,
        overall_progress: Math.round(progress * 10) / 10,
        models: { asr: { progress: Math.round(progress * 10) / 10, downloaded: fileSize, total: config.expected_size } },
      };
    } catch (error) {
      return { success: false, error: error.message, overall_progress: 0, models: {} };
    }
  }

  async deleteModelFiles() {
    const targetDir = this.getModelCachePath();
    if (fs.existsSync(targetDir)) {
      this._removeDirectoryRecursive(targetDir);
    }
    return { success: true };
  }
}

module.exports = LlamaManager;

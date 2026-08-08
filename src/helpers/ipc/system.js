const { ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

module.exports = function register(ctx) {
  // 环境和配置相关
  ipcMain.handle("get-config", () => {
    return ctx.environmentManager.exportConfig();
  });

  ipcMain.handle("validate-environment", () => {
    return ctx.environmentManager.validateEnvironment();
  });

  // 音訊檔案操作。
  // 安全：路徑來自渲染層（可能被 XSS 污染），必須限制在 userData/audio 內，
  // 否則 get-audio-file 等於「任意檔案讀取」、save-audio-file 等於「任意檔案複製」。
  const resolveAudioPath = (p) => {
    if (!p || typeof p !== "string") return null;
    const audioRoot = path.join(
      require("electron").app.getPath("userData"),
      "audio"
    );
    const resolved = path.resolve(p);
    return resolved.startsWith(audioRoot + path.sep) ? resolved : null;
  };

  ipcMain.handle("get-audio-file", async (event, audioPath) => {
    try {
      const safePath = resolveAudioPath(audioPath);
      if (!safePath || !fs.existsSync(safePath)) {
        return { success: false, error: '音訊檔案不存在' };
      }
      const buffer = fs.readFileSync(safePath);
      return { success: true, data: buffer.toString('base64'), mimeType: 'audio/wav' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("save-audio-file", async (event, audioPath, savePath) => {
    try {
      // 來源限制在 audio 目錄；目的地由系統存檔對話框產生（使用者明確選擇）
      const safeSource = resolveAudioPath(audioPath);
      if (!safeSource || !fs.existsSync(safeSource)) {
        return { success: false, error: '來源音訊檔案不存在' };
      }
      if (!savePath || typeof savePath !== "string") {
        return { success: false, error: '無效的儲存路徑' };
      }
      fs.copyFileSync(safeSource, savePath);
      return { success: true, path: savePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("show-save-dialog", async (event, options) => {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog(options);
    return result;
  });

  // 文件系统相关。
  // 安全：show-item-in-folder 限制在 userData 內；open-external 只允許 https。
  ipcMain.handle("show-item-in-folder", (event, fullPath) => {
    if (!fullPath || typeof fullPath !== "string") return;
    const userDataRoot = require("electron").app.getPath("userData");
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(userDataRoot + path.sep)) return;
    require("electron").shell.showItemInFolder(resolved);
  });

  ipcMain.handle("open-default-model-dir", () => {
    const shell = require("electron").shell;
    try {
      // 開發模式：專案根目錄/model/；打包版：userData/models/
      const isPackaged = !!(require("electron").app?.isPackaged);
      let modelsDir;
      if (isPackaged) {
        modelsDir = path.join(require("electron").app.getPath("userData"), "models");
      } else {
        modelsDir = path.join(__dirname, "..", "..", "..", "model");
      }
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      shell.openPath(modelsDir);
      return { success: true };
    } catch (_) { /* ignore */ }
  });

  // 取得目前模型目錄路徑
  ipcMain.handle("get-model-dir", () => {
    try {
      const customDir = ctx.databaseManager ? ctx.databaseManager.getSetting("custom_model_dir", "") : "";
      const isPackaged = !!(require("electron").app?.isPackaged);
      const defaultDir = isPackaged
        ? path.join(require("electron").app.getPath("userData"), "models")
        : path.join(__dirname, "..", "..", "..", "model");
      return { success: true, currentDir: customDir || defaultDir, isCustom: !!customDir, defaultDir };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 變更模型目錄：選資料夾 → 移動已有模型 → 存設定
  ipcMain.handle("change-model-dir", async () => {
    const { dialog, app } = require("electron");
    const isPackaged = !!(app?.isPackaged);
    const defaultDir = isPackaged
      ? path.join(app.getPath("userData"), "models")
      : path.join(__dirname, "..", "..", "..", "model");

    const currentCustom = ctx.databaseManager ? ctx.databaseManager.getSetting("custom_model_dir", "") : "";
    const oldDir = currentCustom || defaultDir;

    // 開啟選資料夾對話框
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "選擇模型存放目錄",
      defaultPath: oldDir,
    });
    if (result.canceled || !result.filePaths?.length) {
      return { success: false, canceled: true };
    }
    const newDir = result.filePaths[0];
    if (newDir === oldDir) {
      return { success: true, moved: false, message: "目錄未變更" };
    }

    // 確保新目錄存在
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }

    // 移動已有模型
    const movedModels = [];
    if (fs.existsSync(oldDir)) {
      const entries = fs.readdirSync(oldDir);
      for (const entry of entries) {
        const srcPath = path.join(oldDir, entry);
        const destPath = path.join(newDir, entry);
        try {
          const stat = fs.statSync(srcPath);
          if (!stat.isDirectory()) continue;
          if (fs.existsSync(destPath)) continue; // 目標已存在，跳過
          fs.renameSync(srcPath, destPath);
          movedModels.push(entry);
        } catch (e) {
          ctx.logger && ctx.logger.warn && ctx.logger.warn(`模型移動失敗 ${entry}:`, e.message);
        }
      }
    }

    // 儲存設定
    if (ctx.databaseManager) {
      ctx.databaseManager.setSetting("custom_model_dir", newDir);
    }

    // 清除 sherpaManager 的模型路徑快取
    if (ctx.sherpaManager) {
      ctx.sherpaManager.modelsDownloaded = null;
    }

    return { success: true, moved: true, movedModels, newDir };
  });

  ipcMain.handle("open-external", (event, url) => {
    try {
      if (new URL(url).protocol !== "https:") return;
    } catch (e) {
      return;
    }
    require("electron").shell.openExternal(url);
  });

  // 系统信息
  ipcMain.handle("get-system-info", () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron
    };
  });

  ipcMain.handle("check-permissions", async () => {
    try {
      // 检查辅助功能权限
      const hasAccessibility = await ctx.clipboardManager.checkAccessibilityPermissions();

      return {
        microphone: true, // 麦克风权限由前端检查
        accessibility: hasAccessibility
      };
    } catch (error) {
      ctx.logger.error("检查权限失败:", error);
      return {
        microphone: false,
        accessibility: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("request-permissions", async () => {
    try {
      // 对于辅助功能权限，我们只能引导用户手动授予
      // 这里可以打开系统设置页面
      if (process.platform === "darwin") {
        ctx.clipboardManager.openSystemSettings();
      }
      return { success: true };
    } catch (error) {
      ctx.logger.error("请求权限失败:", error);
      return { success: false, error: error.message };
    }
  });

  // 测试辅助功能权限
  ipcMain.handle("test-accessibility-permission", async () => {
    try {
      // 使用测试文本检查权限
      await ctx.clipboardManager.pasteText("說打兔權限測試");
      return { success: true, message: "辅助功能权限测试成功" };
    } catch (error) {
      ctx.logger.error("辅助功能权限测试失败:", error);
      return { success: false, error: error.message };
    }
  });

  // 打开系统权限设置
  ipcMain.handle("open-system-permissions", () => {
    try {
      if (process.platform === "darwin") {
        ctx.clipboardManager.openSystemSettings();
        return { success: true };
      } else {
        return { success: false, error: "当前平台不支持自动打开权限设置" };
      }
    } catch (error) {
      ctx.logger.error("打开系统权限设置失败:", error);
      return { success: false, error: error.message };
    }
  });

  // 应用信息
  ipcMain.handle("get-app-version", () => {
    return require("electron").app.getVersion();
  });

  ipcMain.handle("get-app-path", (event, name) => {
    return require("electron").app.getPath(name);
  });

  ipcMain.handle("check-for-updates", () => {
    // TODO: 实现更新检查功能
    return { hasUpdate: false };
  });

  // 调试和日志
  ipcMain.handle("log", (event, level, message, data) => {
    ctx.logger[level](`[渲染进程] ${message}`, data || "");
    return true;
  });

  ipcMain.handle("get-debug-info", () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      appVersion: require("electron").app.getVersion()
    };
  });

  // 保持向后兼容性
  ipcMain.handle("log-message", (event, level, message, data) => {
    ctx.logger[level](`[渲染进程] ${message}`, data || "");
    return true;
  });

  // 中文特定功能
  ipcMain.handle("detect-language", (event, text) => {
    // TODO: 实现语言检测功能
    return { language: "zh-CN", confidence: 0.95 };
  });

  ipcMain.handle("segment-chinese", (event, text) => {
    // TODO: 实现中文分词功能
    return { segments: text.split("") };
  });

  ipcMain.handle("add-punctuation", (event, text) => {
    // TODO: 实现标点符号添加功能
    return { text: text };
  });

  // 音频处理
  ipcMain.handle("convert-audio-format", (event, audioData, targetFormat) => {
    // TODO: 实现音频格式转换功能
    return { success: true, data: audioData };
  });

  ipcMain.handle("enhance-audio", (event, audioData) => {
    // TODO: 实现音频增强功能
    return { success: true, data: audioData };
  });

  // 性能监控
  ipcMain.handle("get-performance-stats", () => {
    // TODO: 实现性能统计功能
    return { stats: {} };
  });

  ipcMain.handle("clear-performance-stats", () => {
    // TODO: 实现清除性能统计功能
    return { success: true };
  });

  // 错误报告
  ipcMain.handle("report-error", (event, error) => {
    ctx.logger.error("渲染进程错误:", error);
    // TODO: 实现错误报告功能
    return true;
  });

  // 开发工具
  if (process.env.NODE_ENV === "development") {
    ipcMain.handle("open-dev-tools", (event) => {
      const window = require("electron").BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.webContents.openDevTools();
      }
    });

    ipcMain.handle("reload-window", (event) => {
      const window = require("electron").BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.reload();
      }
    });
  }

  // 日志和调试相关
  ipcMain.handle("get-app-logs", (event, lines = 100) => {
    try {
      if (ctx.logger && ctx.logger.getRecentLogs) {
        return {
          success: true,
          logs: ctx.logger.getRecentLogs(lines)
        };
      }
      return {
        success: false,
        error: "日志管理器不可用"
      };
    } catch (error) {
      ctx.logger.error("获取应用日志失败:", error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("get-sherpa-logs", (event, lines = 100) => {
    try {
      if (ctx.logger && ctx.logger.getSherpaLogs) {
        return {
          success: true,
          logs: ctx.logger.getSherpaLogs(lines)
        };
      }
      return {
        success: false,
        error: "日志管理器不可用"
      };
    } catch (error) {
      ctx.logger.error("获取Sherpa日志失败:", error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("get-log-file-path", () => {
    try {
      if (ctx.logger && ctx.logger.getLogFilePath) {
        return {
          success: true,
          appLogPath: ctx.logger.getLogFilePath(),
          sherpaLogPath: ctx.logger.getSherpaLogFilePath ? ctx.logger.getSherpaLogFilePath() : null
        };
      }
      return {
        success: false,
        error: "日志管理器不可用"
      };
    } catch (error) {
      ctx.logger.error("获取日志文件路径失败:", error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("open-log-file", (event, logType = 'app') => {
    try {
      if (ctx.logger) {
        const logPath = logType === 'sherpa'
          ? (ctx.logger.getSherpaLogFilePath ? ctx.logger.getSherpaLogFilePath() : ctx.logger.getLogFilePath())
          : ctx.logger.getLogFilePath();

        require("electron").shell.showItemInFolder(logPath);
        return { success: true };
      }
      return {
        success: false,
        error: "日志管理器不可用"
      };
    } catch (error) {
      ctx.logger.error("打开日志文件失败:", error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("get-system-debug-info", () => {
    try {
      const debugInfo = {
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          electronVersion: process.versions.electron,
          appVersion: require("electron").app.getVersion()
        },
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          AI_API_KEY: '通过控制面板设置',
          AI_BASE_URL: '通过控制面板设置',
          AI_MODEL: '通过控制面板设置'
        },
        sherpaStatus: {
          isInitialized: ctx.sherpaManager.isInitialized,
          serverReady: ctx.sherpaManager.serverReady
        }
      };

      if (ctx.logger && ctx.logger.getSystemInfo) {
        debugInfo.loggerInfo = ctx.logger.getSystemInfo();
      }

      return {
        success: true,
        debugInfo
      };
    } catch (error) {
      ctx.logger.error("获取系统调试信息失败:", error);
      return {
        success: false,
        error: error.message
      };
    }
  });
};

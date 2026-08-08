const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");

// 崩潰救援：錄音中把音訊（16kHz mono PCM16）持續 append 到一個暫存檔。
// 正常停止 → 刪掉。若 app 中途被砍 / 當機，下次開機把這檔轉成 WAV，
// 寫一筆「未轉錄」歷史，使用者可用既有的「重新辨識」把它轉出來。

function pcmPath() {
  return path.join(app.getPath("userData"), ".recovery.pcm");
}

let _stream = null;

function begin() {
  try {
    end(); // 收掉上一條（保險）
    const p = pcmPath();
    // 使用寫入空檔來清空暫存，不使用 unlinkSync，避免 Windows 上的 EPERM (鎖定或待刪除) 錯誤
    try { fs.writeFileSync(p, Buffer.alloc(0)); } catch (e) { /* ignore */ }
    _stream = fs.createWriteStream(p, { flags: "w" });
    _stream.on("error", (err) => {
      console.error("Recovery stream error:", err);
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function append(b64) {
  try {
    if (!b64) return { success: true };
    if (!_stream) {
      _stream = fs.createWriteStream(pcmPath(), { flags: "a" });
      _stream.on("error", (err) => {
        console.error("Recovery stream error:", err);
      });
    }
    _stream.write(Buffer.from(b64, "base64"));
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

// 正常停止 / 取消：關掉串流並清空暫存（這段已正常處理過，不是孤兒）
function end() {
  try {
    if (_stream) { 
      try { _stream.end(); } catch (e) {} 
      _stream = null; 
    }
    const p = pcmPath();
    try { fs.writeFileSync(p, Buffer.alloc(0)); } catch (e) { /* 不存在 */ }
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

// 16-bit mono PCM → WAV（固定 16kHz，與辨識用的取樣率一致）
function pcm16ToWav(pcm, sampleRate = 16000) {
  const numCh = 1, bits = 16;
  const blockAlign = (numCh * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(numCh, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// 開機時呼叫：若有上次中斷遺留的錄音 → 存成 WAV + 寫一筆「未轉錄」歷史
function recoverOnStartup(databaseManager, logger) {
  try {
    const p = pcmPath();
    if (!fs.existsSync(p)) return;
    const pcm = fs.readFileSync(p);
    try { fs.writeFileSync(p, Buffer.alloc(0)); } catch (e) {}
    // 門檻：至少約 1.5 秒（16000 樣本/秒 × 2 bytes × 1.5），太短不值得救
    if (!pcm || pcm.length < 48000) return;

    const wav = pcm16ToWav(pcm, 16000);
    const audioDir = path.join(app.getPath("userData"), "audio");
    fs.mkdirSync(audioDir, { recursive: true });
    const wavPath = path.join(audioDir, `recovered_${crypto.randomUUID()}.wav`);
    fs.writeFileSync(wavPath, wav);

    const durationSec = Math.round(pcm.length / (16000 * 2));
    if (databaseManager) {
      databaseManager.saveTranscription({
        text: "（上次中斷的錄音・尚未轉錄，可按「重新辨識」）",
        raw_text: "",
        confidence: 0,
        language: "zh-TW",
        duration: durationSec,
        file_size: wav.length,
        audio_path: wavPath,
      });
    }
    if (logger && logger.info) logger.info(`崩潰救援：已救回上次中斷的錄音（約 ${durationSec} 秒）→ 歷史`);
  } catch (e) {
    if (logger && logger.warn) logger.warn("崩潰救援失敗:", e.message || e);
  }
}

function safeUnlink(filePath, logger) {
  try {
    if (!fs.existsSync(filePath)) return;
    fs.unlinkSync(filePath);
  } catch (e) {
    try {
      fs.chmodSync(filePath, 0o666);
      fs.unlinkSync(filePath);
    } catch (e2) {
      try {
        const { execSync } = require("child_process");
        if (process.platform === "win32") {
          execSync(`attrib -R "${filePath}"`, { timeout: 2000 });
          execSync(`del /F /Q /A "${filePath}"`, { timeout: 2000 });
        } else {
          fs.unlinkSync(filePath);
        }
      } catch (e3) {
        if (logger && logger.warn) {
          logger.warn(`[Cleanup] 無法刪除檔案 ${filePath}: ${e3.message || e3}`);
        }
      }
    }
  }
}

function cleanOldRecordings(databaseManager, logger) {
  try {
    if (!databaseManager || !databaseManager.db) return;
    const retentionDays = Number(databaseManager.getSetting("audio_retention_days", 30));
    if (!retentionDays || retentionDays <= 0) {
      if (logger && logger.info) logger.info("[Cleanup] 錄音保留期限設定為永久，跳過自動清理");
      return;
    }

    if (logger && logger.info) logger.info(`[Cleanup] 開始清理超過 ${retentionDays} 天的舊錄音檔...`);

    const selectStmt = databaseManager.db.prepare(
      "SELECT id, audio_path FROM transcriptions WHERE audio_path IS NOT NULL AND created_at < datetime('now', '-' || ? || ' days')"
    );
    const oldRecords = selectStmt.all(retentionDays);

    if (oldRecords.length === 0) {
      if (logger && logger.info) logger.info("[Cleanup] 沒有需要清理的舊錄音檔");
      return;
    }

    const updateStmt = databaseManager.db.prepare(
      "UPDATE transcriptions SET audio_path = NULL WHERE id = ?"
    );

    let cleanedCount = 0;
    for (const record of oldRecords) {
      if (record.audio_path) {
        safeUnlink(record.audio_path, logger);
      }
      updateStmt.run(record.id);
      cleanedCount++;
    }

    if (logger && logger.info) {
      logger.info(`[Cleanup] 舊錄音檔清理完成，共清理 ${cleanedCount} 筆資料`);
    }
  } catch (err) {
    if (logger && logger.warn) {
      logger.warn("[Cleanup] 自動清理舊錄音檔失敗:", err.message || err);
    }
  }
}

module.exports = { begin, append, end, recoverOnStartup, cleanOldRecordings };

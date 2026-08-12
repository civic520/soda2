const os = require("os");
const fs = require("fs");
const path = require("path");

// Google Drive for desktop 串流模式：掛載成磁碟機（如 G:），根目錄會有
// "My Drive" / "我的雲端硬碟" 等資料夾。偵測磁碟根是否有這些標記。
// 注意：不含英文 "Google Drive" —— 那是使用者可能自建的普通資料夾，容易誤判；
// 真正的掛載磁碟根一定有 My Drive / 我的雲端硬碟 這類「雲端根」標記。
const GOOGLE_DRIVE_MOUNT_MARKERS = ["My Drive", "我的雲端硬碟", "我的云端硬盘", "Mon Drive", "Mon espace Google Drive"];

function findGoogleDriveMount() {
  try {
    const drives = [];
    if (process.platform === "win32") {
      for (let c = 67; c <= 90; c++) { // C: 到 Z:
        const letter = String.fromCharCode(c);
        const root = `${letter}:\\`;
        if (fs.existsSync(root)) drives.push(root);
      }
    } else {
      drives.push("/");
    }
    for (const root of drives) {
      if (root.toUpperCase() === `${path.parse(os.homedir()).root}`.toUpperCase()) continue; // 跳過系統槽
      try {
        const entries = fs.readdirSync(root);
        for (const marker of GOOGLE_DRIVE_MOUNT_MARKERS) {
          if (entries.includes(marker)) {
            // 回傳「My Drive / 我的雲端硬碟」資料夾本身（可寫），而非磁碟根（唯讀）
            return path.join(root, marker);
          }
        }
      } catch (e) { /* 磁碟不可讀則略過 */ }
    }
    return null;
  } catch (e) {
    return null;
  }
}

const CLOUD_PROVIDERS = [
  {
    id: "onedrive",
    name: "OneDrive",
    installNote: "settings.backupCloud.installNote.onedrive",
    steps: ["settings.backupCloud.step.onedrive.1", "settings.backupCloud.step.onedrive.2", "settings.backupCloud.step.onedrive.3"],
    folderCandidates: ["OneDrive", "OneDrive - Personal"],
    downloadUrl: "https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    installNote: "settings.backupCloud.installNote.gdrive",
    steps: ["settings.backupCloud.step.gdrive.1", "settings.backupCloud.step.gdrive.2", "settings.backupCloud.step.gdrive.3"],
    folderCandidates: ["Google Drive", "My Drive"],
    downloadUrl: "https://www.google.com/drive/download/",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    installNote: "settings.backupCloud.installNote.dropbox",
    steps: ["settings.backupCloud.step.dropbox.1", "settings.backupCloud.step.dropbox.2", "settings.backupCloud.step.dropbox.3"],
    folderCandidates: ["Dropbox"],
    downloadUrl: "https://www.dropbox.com/install",
  },
  {
    id: "box",
    name: "Box",
    installNote: "settings.backupCloud.installNote.box",
    steps: ["settings.backupCloud.step.box.1", "settings.backupCloud.step.box.2", "settings.backupCloud.step.box.3"],
    folderCandidates: ["Box"],
    downloadUrl: "https://www.box.com/drive",
  },
  {
    id: "icloud",
    name: "iCloud Drive",
    installNote: "settings.backupCloud.installNote.icloud",
    steps: ["settings.backupCloud.step.icloud.1", "settings.backupCloud.step.icloud.2", "settings.backupCloud.step.icloud.3"],
    folderCandidates: ["iCloud Drive"],
    downloadUrl: "https://apps.microsoft.com/detail/9pkszqfnhj7t",
  },
  {
    id: "nextcloud",
    name: "Nextcloud",
    installNote: "settings.backupCloud.installNote.nextcloud",
    steps: ["settings.backupCloud.step.nextcloud.1", "settings.backupCloud.step.nextcloud.2", "settings.backupCloud.step.nextcloud.3"],
    folderCandidates: ["Nextcloud"],
    downloadUrl: "https://nextcloud.com/install/",
  },
];

function detectCloudFolders(providers) {
  const home = os.homedir();
  const gdriveMount = findGoogleDriveMount();
  return providers.map((p) => {
    // Google Drive：先找資料夾，找不到再找掛載磁碟
    if (p.id === "gdrive" && gdriveMount) {
      return { id: p.id, name: p.name, detected: true, path: gdriveMount, installNoteKey: p.installNote, steps: p.steps, downloadUrl: p.downloadUrl };
    }
    for (const cand of p.folderCandidates) {
      const full = path.join(home, cand);
      if (fs.existsSync(full)) {
        return { id: p.id, name: p.name, detected: true, path: full, installNoteKey: p.installNote, steps: p.steps, downloadUrl: p.downloadUrl };
      }
    }
    return { id: p.id, name: p.name, detected: false, path: null, installNoteKey: p.installNote, steps: p.steps, downloadUrl: p.downloadUrl };
  });
}

module.exports = { CLOUD_PROVIDERS, detectCloudFolders, GOOGLE_DRIVE_MOUNT_MARKERS };

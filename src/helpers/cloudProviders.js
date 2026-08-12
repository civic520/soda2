const os = require("os");
const fs = require("fs");
const path = require("path");

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
  return providers.map((p) => {
    for (const cand of p.folderCandidates) {
      const full = path.join(home, cand);
      if (fs.existsSync(full)) {
        return { id: p.id, name: p.name, detected: true, path: full, installNoteKey: p.installNote, steps: p.steps, downloadUrl: p.downloadUrl };
      }
    }
    return { id: p.id, name: p.name, detected: false, path: null, installNoteKey: p.installNote, steps: p.steps, downloadUrl: p.downloadUrl };
  });
}

module.exports = { CLOUD_PROVIDERS, detectCloudFolders };

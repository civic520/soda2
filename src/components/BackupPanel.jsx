import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { UploadCloud, RefreshCw, HardDriveDownload, Download, CheckCircle, XCircle, AlertCircle, FolderOpen } from "lucide-react";

const RESTORE_SCOPES = [
  { id: "all", key: "settings.backup.restoreScopeAll" },
  { id: "settings", key: "settings.backup.restoreScopeSettings" },
  { id: "style", key: "settings.backup.restoreScopeStyle" },
  { id: "words", key: "settings.backup.restoreScopeWords" },
];

const BackupPanel = ({ t }) => {
  const [clouds, setClouds] = useState([]);
  const [status, setStatus] = useState({ backup_cloud_dir: "", backup_auto_enable: false, backup_last_auto: null });
  const [selectedId, setSelectedId] = useState("");
  const [selectedDir, setSelectedDir] = useState("");
  const [restoreScope, setRestoreScope] = useState("all");
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    const cloudsResult = await window.electronAPI?.backupDetectClouds?.();
    if (cloudsResult) setClouds(cloudsResult);
    const statusResult = await window.electronAPI?.backupGetStatus?.();
    if (statusResult) {
      setStatus(statusResult);
      const dir = statusResult.backup_cloud_dir || "";
      setSelectedDir(dir);
      // 若已存的路徑對應某個已偵測雲端 → 選中它；否則顯示自選資料夾
      const match = (cloudsResult || []).find(c => c.detected && c.path === dir);
      setSelectedId(match ? match.id : (dir ? "__custom__" : ""));
    }
  };

  useEffect(() => { loadAll(); }, []);

  const selectedProvider = clouds.find(c => c.id === selectedId) || null;
  const cloudReady = !!selectedDir;

  const pickFolder = async () => {
    const res = await window.electronAPI?.backupPickFolder?.();
    if (res?.success && res.path) {
      setSelectedDir(res.path);
      setSelectedId("__custom__");
      await window.electronAPI?.backupSetConfig?.({ key: "backup_cloud_dir", value: res.path });
      setStatus(prev => ({ ...prev, backup_cloud_dir: res.path, backup_cloud_dir_valid: true }));
      toast.success(t("settings.backup.cloudSet"), { description: res.path });
    }
  };

  const handleSelect = async (val) => {
    setSelectedId(val);
    if (val === "__custom__") { pickFolder(); return; }
    if (val === "") {
      setSelectedDir("");
      return;
    }
    const cloud = clouds.find(c => c.id === val);
    if (cloud && cloud.detected) {
      setSelectedDir(cloud.path);
      await window.electronAPI?.backupSetConfig?.({ key: "backup_cloud_dir", value: cloud.path });
      setStatus(prev => ({ ...prev, backup_cloud_dir: cloud.path, backup_cloud_dir_valid: true }));
    } else {
      // 未安裝：不設定雲端資料夾，僅顯示引導
      setSelectedDir("");
    }
  };

  const doBackup = async () => {
    if (!selectedDir) { toast.error(t("settings.backup.needCloud")); return; }
    setBusy(true);
    try {
      const res = await window.electronAPI?.backupExport?.({ dir: selectedDir, filename: "soda2-backup-latest.json" });
      if (res?.success) {
        toast.success(t("settings.backup.backupDone"), { description: res.path });
      } else {
        toast.error(t("settings.backup.backupFailed"), { description: res?.error || "" });
      }
    } finally { setBusy(false); }
  };

  const doSaveLocal = async () => {
    const picked = await window.electronAPI?.backupPickFolder?.();
    if (!picked?.success || !picked.path) return;
    setBusy(true);
    try {
      const res = await window.electronAPI?.backupExport?.({ dir: picked.path, filename: "soda2-backup-latest.json" });
      if (res?.success) {
        toast.success(t("settings.backup.backupDone"), { description: res.path });
      } else {
        toast.error(t("settings.backup.backupFailed"), { description: res?.error || "" });
      }
    } finally { setBusy(false); }
  };

  const doRestore = async () => {
    const picked = await window.electronAPI?.backupPickFile?.();
    if (!picked?.success || !picked.path) return;
    setBusy(true);
    try {
      const res = await window.electronAPI?.backupImport?.({ filePath: picked.path, scope: restoreScope });
      if (res?.success) {
        toast.success(t("settings.backup.restoreDone"));
      } else {
        toast.error(t("settings.backup.restoreFailed"), { description: res?.error || "" });
      }
    } finally { setBusy(false); }
  };

  const toggleAuto = async () => {
    if (!cloudReady) { toast.error(t("settings.backup.needCloud")); return; }
    const next = !status.backup_auto_enable;
    setStatus(prev => ({ ...prev, backup_auto_enable: next }));
    await window.electronAPI?.backupSetConfig?.({ key: "backup_auto_enable", value: next });
  };

  const fmtLastAuto = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleString(); } catch { return null; }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-lg border border-[hsl(var(--border))] p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">{t("settings.backup.title")}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t("settings.backup.desc")}</p>

        {/* 雲端空間下拉 */}
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("settings.backup.cloudTarget")}
        </label>
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">{t("settings.backup.noCloud")}</option>
            {clouds.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.detected ? "✅" : "⚠️"} — {c.detected ? (c.path || "") : t("settings.backup.notInstalled")}
              </option>
            ))}
            {selectedId === "__custom__" && selectedDir ? (
              <option value="__custom__">{t("settings.backup.customFolder")} — {selectedDir}</option>
            ) : (
              <option value="__custom__">{t("settings.backup.customFolder")}</option>
            )}
          </select>
          <button
            type="button"
            onClick={loadAll}
            className="shrink-0 p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={t("settings.backup.rescan")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* 選中未安裝的雲端 → 引導 */}
        {selectedProvider && !selectedProvider.detected && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-medium">{t("settings.backup.guideTitle", { name: selectedProvider.name })}</span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">{t(selectedProvider.installNoteKey || "settings.backupCloud.installNote.gdrive")}</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-amber-800 dark:text-amber-200 mb-2">
              {(selectedProvider.steps || []).map((stepKey, i) => (
                <li key={i}>{t(stepKey)}</li>
              ))}
            </ol>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.electronAPI?.openExternal(selectedProvider.downloadUrl)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
              >
                {t("settings.backup.download")} ↗
              </button>
              <button
                type="button"
                onClick={loadAll}
                className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3 h-3 inline mr-1" />
                {t("settings.backup.rescanAfterInstall")}
              </button>
            </div>
          </div>
        )}

        {selectedProvider && selectedProvider.detected && (
          <div className="mt-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span>{t("settings.backup.cloudReady", { path: selectedProvider.path })}</span>
          </div>
        )}
      </div>

      {/* 備份動作 */}
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-lg border border-[hsl(var(--border))] p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{t("settings.backup.actions")}</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={doBackup}
            disabled={busy || !cloudReady}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <UploadCloud className="w-4 h-4 inline mr-1" />
            {t("settings.backup.backupNow")}
          </button>
          <button
            type="button"
            onClick={doSaveLocal}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <HardDriveDownload className="w-4 h-4 inline mr-1" />
            {t("settings.backup.saveLocal")}
          </button>
        </div>

        {/* 自動備份 */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {t("settings.backup.autoBackup")}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t("settings.backup.autoBackupDesc")}
                {fmtLastAuto(status.backup_last_auto) && (
                  <span className="block mt-0.5"> {t("settings.backup.lastAuto")} {fmtLastAuto(status.backup_last_auto)}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={status.backup_auto_enable}
              onClick={toggleAuto}
              disabled={!cloudReady}
              className={`${
                status.backup_auto_enable ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              } relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span
                aria-hidden="true"
                className={`${
                  status.backup_auto_enable ? 'translate-x-4' : 'translate-x-0'
                } inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 還原 */}
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-lg border border-[hsl(var(--border))] p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{t("settings.backup.restore")}</h3>
        <div className="space-y-2 mb-3">
          {RESTORE_SCOPES.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="restore-scope"
                checked={restoreScope === s.id}
                onChange={() => setRestoreScope(s.id)}
                className="accent-blue-600"
              />
              {t(s.key)}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={doRestore}
          disabled={busy || !cloudReady}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          <Download className="w-4 h-4 inline mr-1" />
          {t("settings.backup.restoreNow")}
        </button>
      </div>
    </div>
  );
};

export default BackupPanel;

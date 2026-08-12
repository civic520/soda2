import { strict as assert } from "node:assert";
import test from "node:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const { buildBackupJson, restoreBackup, exportBackupToDir, APP_ID } = await import("../src/helpers/backup.js");

function makeFakeDB(settings, dictionary) {
  return {
    getAllSettings: () => ({ ...settings }),
    exportDictionary: () => [...dictionary],
    setSetting: (key, value) => { settings[key] = value; },
    importDictionary: (entries, mode) => {
      if (mode === "replace") dictionary.length = 0;
      for (const e of entries) dictionary.push(e);
      return { imported: entries.length, skipped: 0, errors: [] };
    },
  };
}

test("buildBackupJson includes settings and dictionary", () => {
  const db = makeFakeDB({ ai_style_settings: { a: 1 }, custom_words: ["w"] }, [{ original: "x", replacement: "y" }]);
  const json = buildBackupJson(db);
  assert.equal(json.app, APP_ID);
  assert.equal(json.settings.ai_style_settings.a, 1);
  assert.equal(json.settings.custom_words[0], "w");
  assert.equal(json.dictionary[0].original, "x");
});

test("restoreBackup scope=all writes settings and dictionary", () => {
  const db = makeFakeDB({}, []);
  const json = {
    app: APP_ID,
    settings: { theme: "dark", ai_style_settings: { m: 1 }, custom_words: ["a"] },
    dictionary: [{ original: "o", replacement: "r" }],
  };
  const res = restoreBackup({ databaseManager: db, json, scope: "all" });
  assert.equal(res.success, true);
  assert.equal(db.getAllSettings().theme, "dark");
  assert.equal(db.getAllSettings().ai_style_settings.m, 1);
  assert.equal(db.getAllSettings().custom_words[0], "a");
  assert.equal(db.exportDictionary().length, 1);
});

test("restoreBackup scope=style only writes ai_style_settings", () => {
  const db = makeFakeDB({ theme: "keep" }, []);
  const json = { app: APP_ID, settings: { theme: "overwrite", ai_style_settings: { m: 9 }, custom_words: ["z"] }, dictionary: [] };
  const res = restoreBackup({ databaseManager: db, json, scope: "style" });
  assert.equal(res.success, true);
  assert.equal(db.getAllSettings().theme, "keep");
  assert.equal(db.getAllSettings().ai_style_settings.m, 9);
  assert.equal(db.getAllSettings().custom_words, undefined);
});

test("restoreBackup scope=words writes custom_words and dictionary", () => {
  const db = makeFakeDB({ theme: "keep" }, []);
  const json = { app: APP_ID, settings: { theme: "overwrite", custom_words: ["a", "b"] }, dictionary: [{ original: "o", replacement: "r" }] };
  const res = restoreBackup({ databaseManager: db, json, scope: "words" });
  assert.equal(res.success, true);
  assert.equal(db.getAllSettings().theme, "keep");
  assert.deepEqual(db.getAllSettings().custom_words, ["a", "b"]);
  assert.equal(db.exportDictionary().length, 1);
});

test("restoreBackup rejects non-soda2 backup", () => {
  const db = makeFakeDB({}, []);
  const res = restoreBackup({ databaseManager: db, json: { app: "other", settings: {} }, scope: "all" });
  assert.equal(res.success, false);
  assert.equal(res.error, "not_soda2_backup");
});

test("restoreBackup rejects invalid scope", () => {
  const db = makeFakeDB({}, []);
  const res = restoreBackup({ databaseManager: db, json: { app: APP_ID, settings: {} }, scope: "bogus" });
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_scope");
});

test("exportBackupToDir writes parseable JSON file", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soda2-backup-test-"));
  const db = makeFakeDB({ theme: "dark" }, []);
  const res = await exportBackupToDir({ databaseManager: db, dir: tmp, filename: "soda2-backup-latest.json" });
  assert.equal(res.success, true);
  const parsed = JSON.parse(fs.readFileSync(res.path, "utf8"));
  assert.equal(parsed.settings.theme, "dark");
  fs.rmSync(tmp, { recursive: true, force: true });
});

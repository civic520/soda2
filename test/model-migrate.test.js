const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function migrateModels(oldDir, newDir, doMigrate = true) {
  const movedModels = [];
  const failedModels = [];
  if (doMigrate && fs.existsSync(oldDir)) {
    for (const entry of fs.readdirSync(oldDir)) {
      const srcPath = path.join(oldDir, entry);
      const destPath = path.join(newDir, entry);
      try {
        const stat = fs.statSync(srcPath);
        if (!stat.isDirectory()) continue;
        if (fs.existsSync(destPath)) continue;
        try {
          fs.renameSync(srcPath, destPath);
        } catch (e) {
          if (e.code === 'EXDEV') {
            fs.cpSync(srcPath, destPath, { recursive: true });
            fs.rmSync(srcPath, { recursive: true, force: true });
          } else {
            throw e;
          }
        }
        movedModels.push(entry);
      } catch (e) {
        failedModels.push(entry);
      }
    }
  }
  return { movedModels, failedModels };
}

test("migrate moves all model dirs when doMigrate true", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mm-"));
  const oldDir = path.join(tmp, "old");
  const newDir = path.join(tmp, "new");
  fs.mkdirSync(path.join(oldDir, "model-a"), { recursive: true });
  fs.mkdirSync(path.join(oldDir, "model-b"), { recursive: true });
  fs.mkdirSync(newDir, { recursive: true });
  const result = migrateModels(oldDir, newDir, true);
  assert.deepEqual(result.movedModels.sort(), ["model-a", "model-b"]);
  assert.deepEqual(result.failedModels, []);
  assert.ok(fs.existsSync(path.join(newDir, "model-a")));
  assert.equal(fs.existsSync(path.join(oldDir, "model-a")), false);
});

test("migrate skips existing destination", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mm2-"));
  const oldDir = path.join(tmp, "old");
  const newDir = path.join(tmp, "new");
  fs.mkdirSync(path.join(oldDir, "model-a"), { recursive: true });
  fs.mkdirSync(path.join(newDir, "model-a"), { recursive: true });
  const result = migrateModels(oldDir, newDir, true);
  assert.deepEqual(result.movedModels, []);
  assert.ok(fs.existsSync(path.join(oldDir, "model-a")));
});

test("migrate does nothing when doMigrate false", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mm3-"));
  const oldDir = path.join(tmp, "old");
  const newDir = path.join(tmp, "new");
  fs.mkdirSync(path.join(oldDir, "model-a"), { recursive: true });
  fs.mkdirSync(newDir, { recursive: true });
  const result = migrateModels(oldDir, newDir, false);
  assert.deepEqual(result.movedModels, []);
  assert.ok(fs.existsSync(path.join(oldDir, "model-a")));
});

import { strict as assert } from "node:assert";
import test from "node:test";

const { CLOUD_PROVIDERS, detectCloudFolders } = await import("../src/helpers/cloudProviders.js");

test("CLOUD_PROVIDERS has 6 providers each with required fields", () => {
  assert.equal(CLOUD_PROVIDERS.length, 6);
  for (const p of CLOUD_PROVIDERS) {
    assert.ok(p.id, `provider ${p.id} missing id`);
    assert.ok(p.name, `provider ${p.id} missing name`);
    assert.ok(Array.isArray(p.folderCandidates) && p.folderCandidates.length > 0, `provider ${p.id} missing folderCandidates`);
    assert.ok(Array.isArray(p.steps) && p.steps.length >= 3, `provider ${p.id} missing steps`);
    assert.ok(p.downloadUrl && p.downloadUrl.startsWith("https://"), `provider ${p.id} missing downloadUrl`);
  }
});

test("detectCloudFolders returns detected:false for non-existent folders", () => {
  const results = detectCloudFolders([{ id: "fake", name: "Fake", folderCandidates: ["__definitely_not_exists__" + Date.now()] }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].detected, false);
  assert.equal(results[0].path, null);
});

test("detectCloudFolders returns objects with id and name", () => {
  const results = detectCloudFolders(CLOUD_PROVIDERS);
  assert.equal(results.length, CLOUD_PROVIDERS.length);
  for (const r of results) {
    assert.ok(r.id);
    assert.ok(r.name);
    assert.equal(typeof r.detected, "boolean");
  }
});

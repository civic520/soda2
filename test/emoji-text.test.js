import { strict as assert } from "node:assert";
import test from "node:test";
import { applyEmoji, BUILTIN_EMOJI_MAP } from "../src/helpers/emojiText.js";

test("applyEmoji replaces emoji words with 表情 suffix", () => {
  assert.equal(applyEmoji("我笑死表情"), "我🤣");
  assert.equal(applyEmoji("我笑死符號"), "我🤣");
});

test("applyEmoji replaces bare emoji words ONLY with 符號/表情/emoji suffix", () => {
  assert.equal(applyEmoji("笑死符號"), "🤣");
  assert.equal(applyEmoji("比讚表情"), "👍");
});

test("applyEmoji replaces punctuation words with 符號 suffix", () => {
  assert.equal(applyEmoji("句號符號"), "。");
  assert.equal(applyEmoji("逗號符號"), "，");
  assert.equal(applyEmoji("頓號符號"), "、");
  assert.equal(applyEmoji("問號符號"), "？");
});

test("applyEmoji replaces paired brackets with 符號 suffix", () => {
  assert.equal(applyEmoji("書名號符號"), "《》");
  assert.equal(applyEmoji("引號符號"), "「」");
  assert.equal(applyEmoji("括號符號"), "（）");
});

test("applyEmoji handles 錶 misrecognition and trailing punctuation", () => {
  assert.equal(applyEmoji("比讚表情。"), "👍");
  assert.equal(applyEmoji("愛你符號，"), "😍");
});

test("applyEmoji custom map overrides builtin", () => {
  assert.equal(applyEmoji("笑死符號", { "笑死": "X" }), "X");
});

test("applyEmoji does NOT replace bare common words (no 符號/表情 suffix)", () => {
  assert.equal(applyEmoji("車"), "車");
  assert.equal(applyEmoji("我今天開車去上班"), "我今天開車去上班");
  assert.equal(applyEmoji("火"), "火");
  assert.equal(applyEmoji("句號"), "句號");
  assert.equal(applyEmoji("笑死"), "笑死");
  assert.equal(applyEmoji("書名號"), "書名號");
});

test("applyEmoji leaves unknown text unchanged", () => {
  assert.equal(applyEmoji("這是一般的句子沒有符號"), "這是一般的句子沒有符號");
});

test("BUILTIN_EMOJI_MAP contains key punctuation entries", () => {
  assert.ok(BUILTIN_EMOJI_MAP["句號"] === "。");
  assert.ok(BUILTIN_EMOJI_MAP["逗號"] === "，");
  assert.ok(BUILTIN_EMOJI_MAP["書名號"] === "《》");
  assert.ok(Object.keys(BUILTIN_EMOJI_MAP).length > 100);
});

let audioCtx = null;
let unlocked = false;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export async function tryUnlock() {
  if (unlocked) return;
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (e) { /* ignore */ }
  }
  unlocked = true;
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export async function playBase64Sound(b64, mimeType, volume = 0.8) {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const audioBuf = await ctx.decodeAudioData(base64ToArrayBuffer(b64));
    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(gain).connect(ctx.destination);
    source.start(0);
    return audioBuf.duration;
  } catch (e) {
    console.warn('playBase64Sound failed:', e);
    return null;
  }
}

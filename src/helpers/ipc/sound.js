const path = require("path");
const fs = require("fs");
const { ipcMain } = require("electron");

// ── 統一的靜音/解靜音函數（主進程與渲染進程共用） ──
let _nativeMute = null;
let _nativeMuteChecked = false;

function _tryLoadNativeMute() {
  if (_nativeMuteChecked) return _nativeMute;
  _nativeMuteChecked = true;
  try {
    _nativeMute = require("../../../native/mute-native/index.node");
    console.log("[mute] Loaded native mute addon");
    return _nativeMute;
  } catch (e) {
    console.log("[mute] Native addon not available, using exe fallback:", e.message);
    return null;
  }
}

function muteSystemAudioSync(mute, logger) {
  const os = require("os");
  const platform = os.platform();
  if (platform !== "win32") {
    const { execSync } = require("child_process");
    if (platform === "darwin") {
      execSync(`osascript -e "set volume output muted ${mute ? "true" : "false"}"`, { timeout: 5000 });
    } else {
      try {
        execSync(`wpctl set-mute @DEFAULT_AUDIO_SINK@ ${mute ? 1 : 0}`, { timeout: 3000 });
      } catch {
        execSync(`amixer set Master ${mute ? "mute" : "unmute"}`, { timeout: 3000 });
      }
    }
    return { success: true };
  }

  // ── Windows: 先嘗試原生模組 ──
  const native = _tryLoadNativeMute();
  if (native) {
    const action = mute ? "靜音" : "解靜音";
    try {
      console.log(`[mute] Calling native set_mute(${mute ? 1 : 0})...`);
      const ok = native.setMute(mute);
      console.log(`[mute] Native ${action}回傳: ${ok}`);
      if (logger) logger.info(`[mute] 原生模組${action}成功: ${ok}`);
      return { success: ok };
    } catch (e) {
      console.error(`[mute] Native ${action}異常:`, e.message);
      if (logger) logger.warn(`[mute] 原生模組${action}失敗:`, e.message);
      // fallthrough to exe
    }
  }

  // ── Fallback: C# exe ──
  const { execSync } = require("child_process");
  const cscPath = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  const exeFile = path.join(os.tmpdir(), "soda2_mute.exe");
  const csFile = path.join(os.tmpdir(), "soda2_mute.cs");

  // C# 程式碼：加入 Console.WriteLine 診斷 + GetMute 驗證 + 重試機制
  const cs = [
    "using System;",
    "using System.Runtime.InteropServices;",
    "using System.Threading;",
    "class P {",
    "  static readonly Guid MMDEVGUID = new Guid(\"BCDE0395-E52F-467C-8E3D-C4579291692E\");",
    "  static readonly Guid EPV_GUID = new Guid(\"5CDF2C82-841E-4546-9722-0CF74078229A\");",
    "",
    "  [ComImport, Guid(\"A95664D2-9614-4F35-A746-DE8DB63617E6\")]",
    "  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
    "  interface IMMDeviceEnumerator {",
    "    [PreserveSig] int EnumAudioEndpoints(int d, int st, int cm, [MarshalAs(UnmanagedType.IUnknown)] out object pp);",
    "    [PreserveSig] int GetDefaultAudioEndpoint(int r, int c, [MarshalAs(UnmanagedType.IUnknown)] out object pp);",
    "  }",
    "",
    "  [ComImport, Guid(\"D666063F-1587-4E43-81F1-B948E807363F\")]",
    "  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
    "  interface IMMDevice {",
    "    [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);",
    "  }",
    "",
    "  [UnmanagedFunctionPointer(CallingConvention.StdCall)]",
    "  delegate int FnSetMute(IntPtr t, int mute, IntPtr pguid);",
    "",
    "  [UnmanagedFunctionPointer(CallingConvention.StdCall)]",
    "  delegate int FnGetMute(IntPtr t, [MarshalAs(UnmanagedType.Bool)] out int mute);",
    "",
    "  static int CallSlot7(IntPtr pUnk, int mute) {",
    "    IntPtr vt = Marshal.ReadIntPtr(pUnk);",
    "    IntPtr g = Marshal.AllocHGlobal(16);",
    "    Marshal.Copy(Guid.Empty.ToByteArray(), 0, g, 16);",
    "    var fn = (FnSetMute)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt + 7 * 8), typeof(FnSetMute));",
    "    int hr = fn(pUnk, mute, g);",
    "    Marshal.FreeHGlobal(g);",
    "    return hr;",
    "  }",
    "",
    "  static bool ReadMute(IntPtr pUnk) {",
    "    IntPtr vt = Marshal.ReadIntPtr(pUnk);",
    "    var fn = (FnGetMute)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt + 9 * 8), typeof(FnGetMute));",
    "    int m; int hr = fn(pUnk, out m);",
    "    if (hr != 0) { Console.WriteLine(\"[csharp] GetMute failed hr=0x\" + hr.ToString(\"X8\")); return false; }",
    "    Console.WriteLine(\"[csharp] GetMute => \" + m);",
    "    return m != 0;",
    "  }",
    "",
    "  static int Main(string[] args) {",
    "    int mute = args.Length > 0 ? int.Parse(args[0]) : 0;",
    "    int maxRetries = 3;",
    "    for (int attempt = 1; attempt <= maxRetries; attempt++) {",
    "      Console.WriteLine(\"[csharp] attempt=\" + attempt + \" mute=\" + mute);",
    "      try {",
    "        var en = (IMMDeviceEnumerator)new Co.MMDeviceEnumerator();",
    "        object dd; en.GetDefaultAudioEndpoint(0, 1, out dd);",
    "        var dev = (IMMDevice)dd;",
    "        object epv; dev.Activate(ref EPV_GUID, 1, IntPtr.Zero, out epv);",
    "        IntPtr pUnk = Marshal.GetIUnknownForObject(epv);",
    "        int hr = CallSlot7(pUnk, mute);",
    "        Console.WriteLine(\"[csharp] SetMute hr=0x\" + hr.ToString(\"X8\"));",
    "        if (hr != 0) { Console.WriteLine(\"[csharp] SetMute FAILED\"); Marshal.Release(pUnk); return 1; }",
    "        Thread.Sleep(50);",
    "        bool current = ReadMute(pUnk);",
    "        Marshal.Release(pUnk);",
    "        if (current == (mute != 0)) {",
    "          Console.WriteLine(\"[csharp] Verify OK\");",
    "          return 0;",
    "        }",
    "        Console.WriteLine(\"[csharp] Verify MISMATCH, retrying...\");",
    "      } catch (Exception e) {",
    "        Console.WriteLine(\"[csharp] Exception: \" + e.Message);",
    "        return 2;",
    "      }",
    "    }",
    "    Console.WriteLine(\"[csharp] All retries exhausted\");",
    "    return 3;",
    "  }",
    "}",
    "namespace Co {",
    "  [ComImport, Guid(\"BCDE0395-E52F-467C-8E3D-C4579291692E\")]",
    "  class MMDeviceEnumerator {}",
    "}",
  ].join("\r\n");

  let needCompile = true;
  if (fs.existsSync(exeFile)) {
    try {
      const stat = fs.statSync(exeFile);
      if (stat.size > 0) needCompile = false;
    } catch (e) {}
  }
  if (needCompile) {
    console.log("[mute] Compiling mute exe...");
    fs.writeFileSync(csFile, cs, "utf8");
    try {
      execSync(`"${cscPath}" /nologo /out:"${exeFile}" "${csFile}"`, { windowsHide: true, timeout: 15000 });
      console.log("[mute] Compiled mute exe OK");
    } catch (e) {
      console.error("[mute] Compile FAILED:", e.message);
      return { success: false, error: "Compile failed: " + e.message };
    } finally {
      try { fs.unlinkSync(csFile); } catch (e) {}
    }
  }

  // 嘗試最多 3 次（exe 內部也有重試）
  const action = mute ? "靜音" : "解靜音";
  for (let i = 1; i <= 3; i++) {
    try {
      const cmd = `"${exeFile}" ${mute ? 1 : 0}`;
      console.log(`[mute] Exe attempt ${i}: ${cmd}`);
      const result = execSync(cmd, { windowsHide: true, timeout: 10000 });
      const stdout = result.toString().trim();
      console.log(`[mute] Exe stdout: ${stdout}`);
      if (logger) logger.info(`[mute] Exe ${action}成功 (attempt ${i}), stdout: ${stdout}`);
      return { success: true, stdout };
    } catch (e) {
      const exitCode = e.status != null ? e.status : "unknown";
      console.error(`[mute] Exe ${action}失敗 attempt ${i}, exit=${exitCode}:`, e.message);
      if (i === 3) {
        if (logger) logger.warn(`[mute] Exe ${action}最終失敗:`, e.message);
        return { success: false, error: e.message, exitCode };
      }
      // 等待 100ms 後重試
      const { execSync: es } = require("child_process");
      try { es("ping -n 2 127.0.0.1 >nul", { windowsHide: true }); } catch {}
    }
  }
  return { success: true };
}

const exported = function (ipcHandlers) {
  ipcMain.handle("play-sound", (event, soundName) => {
    const soundDir = path.join(__dirname, "..", "..", "..", "assets", "sounds");
    const ext = soundName.endsWith(".wav") ? "" : ".wav";
    const filePath = path.join(soundDir, soundName + ext);
    try {
      const buffer = fs.readFileSync(filePath);
      return { data: buffer.toString("base64"), mimeType: "audio/wav" };
    } catch (e) {
      ipcHandlers.logger && ipcHandlers.logger.warn("Play sound failed:", e.message);
      return null;
    }
  });

  ipcMain.handle("mute-system-audio", (event, mute) => {
    console.log(`[mute] IPC mute=${mute}`);
    const result = muteSystemAudioSync(mute, ipcHandlers.logger);
    return result;
  });
};
exported.muteSystemAudioSync = muteSystemAudioSync;
module.exports = exported;

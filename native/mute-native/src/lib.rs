#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use napi_derive::napi;

#[cfg(target_os = "windows")]
mod windows_mute {
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator,
        MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    pub fn set_mute(mute: bool) -> bool {
        unsafe {
            // Initialize COM for this thread (multithreaded apartment)
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            // Create device enumerator
            let enumerator: IMMDeviceEnumerator = match CoCreateInstance(
                &MMDeviceEnumerator,
                None,
                CLSCTX_ALL,
            ) {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("[mute-native] CoCreateInstance failed: {e}");
                    return false;
                }
            };

            // Get default render endpoint
            let device = match enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("[mute-native] GetDefaultAudioEndpoint failed: {e}");
                    return false;
                }
            };

            // Activate IAudioEndpointVolume
            let volume: IAudioEndpointVolume = match device.Activate(CLSCTX_ALL, None) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[mute-native] Activate IAudioEndpointVolume failed: {e}");
                    return false;
                }
            };

            // SetMute — null GUID = no event context
            match volume.SetMute(mute, std::ptr::null()) {
                Ok(()) => {
                    eprintln!("[mute-native] SetMute({mute}) OK");
                    true
                }
                Err(e) => {
                    eprintln!("[mute-native] SetMute({mute}) failed: {e}");
                    false
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod windows_mute {
    pub fn set_mute(_mute: bool) -> bool {
        eprintln!("[mute-native] set_mute only supported on Windows");
        false
    }
}

#[napi]
fn set_mute(mute: bool) -> bool {
    windows_mute::set_mute(mute)
}

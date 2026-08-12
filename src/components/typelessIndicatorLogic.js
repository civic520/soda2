export function indicatorClass(aiOptimizeRecording, cloudAsrActive, commandMode) {
  if (aiOptimizeRecording) return "pill-ai";
  if (commandMode) return "pill-command";
  if (cloudAsrActive) return "pill-cloud";
  return "pill-recording";
}

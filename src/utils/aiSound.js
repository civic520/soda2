export function resolveAiSoundName(theme, type) {
  const t = theme || 'coin02';
  const isStart = type === 'start';
  if (t === 'marimba') {
    return isStart ? 'marimba_start' : 'marimba_stop';
  }
  return `${t}_${isStart ? 'start' : 'stop'}`;
}

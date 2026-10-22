// On phones, go fullscreen and lock to landscape on the first tap.
// Android Chrome supports both; iOS Safari supports neither, so it relies on the
// CSS rotate overlay instead. Failures are expected there and ignored.
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

export function enableLandscapeLock(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return;

  const onFirstTouch = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
      await (screen.orientation as LockableOrientation).lock?.('landscape');
    } catch {
      // Not supported (iOS) or not allowed; the rotate overlay covers it.
    }
  };

  window.addEventListener('touchend', onFirstTouch, { once: true });
}

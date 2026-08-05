import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore.ts'
import { CHECK_INTERVAL_MS, checkAndFireDueNotifications } from './scheduler.ts'

/**
 * Mounted once at the app root. Checks for due notifications on mount, whenever the
 * app is foregrounded, and on a periodic timer while it stays open — see
 * scheduler.ts's own header comment for why this is best-effort rather than a true
 * background schedule.
 */
export function useNotificationScheduler() {
  const recordNotificationFired = useAppStore((s) => s.recordNotificationFired)

  useEffect(() => {
    async function check() {
      const state = useAppStore.getState()
      const fired = await checkAndFireDueNotifications(state)
      for (const item of fired) recordNotificationFired(item)
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [recordNotificationFired])
}

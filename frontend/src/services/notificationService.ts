import type { NotificationSettings } from '../types/notification'

const SETTINGS_KEY = 'qdoc.notification.settings'
const DEFAULT_OTP = '123456'

const DEFAULT_SETTINGS: NotificationSettings = {
  inAppEnabled: true,
  voiceEnabled: false,
  triggerMode: 'people',
  stage1People: 2,
  stage2People: 1,
  stage1Minutes: 10,
  stage2Minutes: 5,
  phoneNumber: '',
  phoneVerified: false,
}

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS
  }

  const raw = window.localStorage.getItem(SETTINGS_KEY)
  if (!raw) {
    return DEFAULT_SETTINGS
  }

  try {
    const parsed = JSON.parse(raw) as NotificationSettings

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      inAppEnabled: true,
    }
  } catch {
    window.localStorage.removeItem(SETTINGS_KEY)
    return DEFAULT_SETTINGS
  }
}

export function saveNotificationSettings(input: NotificationSettings) {
  if (typeof window === 'undefined') {
    return
  }

  const next: NotificationSettings = {
    ...input,
    inAppEnabled: true,
  }

  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
}

export function verifyVoiceOtp(code: string) {
  return code.trim() === DEFAULT_OTP
}

export function getVoiceOtpHint() {
  return DEFAULT_OTP
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppTopNav } from '../components/AppTopNav'
import {
  getNotificationSettings,
  getVoiceOtpHint,
  saveNotificationSettings,
  verifyVoiceOtp,
} from '../services/notificationService'
import type { NotificationSettings } from '../types/notification'

export function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>(() => getNotificationSettings())
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function persist(next: NotificationSettings) {
    setSettings(next)
    saveNotificationSettings(next)
  }

  function handleVoiceToggle(enabled: boolean) {
    const next: NotificationSettings = {
      ...settings,
      voiceEnabled: enabled,
      phoneVerified: enabled ? settings.phoneVerified : false,
    }

    persist(next)
    setMessage(enabled ? 'Voice notifications enabled.' : 'Voice notifications disabled.')
    setError(null)
  }

  function handleTriggerMode(mode: NotificationSettings['triggerMode']) {
    const next: NotificationSettings = {
      ...settings,
      triggerMode: mode,
    }

    persist(next)
    setMessage('Trigger mode updated.')
    setError(null)
  }

  function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!settings.phoneNumber.trim()) {
      setError('Phone number is required for voice alerts.')
      return
    }

    setOtpSent(true)
    setMessage(`Verification code sent. Demo OTP: ${getVoiceOtpHint()}`)
    setError(null)
  }

  function handleVerifyCode() {
    if (!verifyVoiceOtp(otpCode)) {
      setError('Invalid OTP code. Use the demo code shown above.')
      return
    }

    const next: NotificationSettings = {
      ...settings,
      phoneVerified: true,
    }

    persist(next)
    setMessage('Phone verification completed.')
    setError(null)
    setOtpCode('')
  }

  return (
    <main className="app-shell">
      <AppTopNav />

      <section className="page-layout">
        <header className="page-header">
          <div>
            <p className="muted">Alert behavior and channel preferences</p>
            <h2>Notification Settings</h2>
            <p>Configure Stage1 and Stage2 alert channels and trigger mode.</p>
          </div>
          <div className="header-actions">
            <Link to="/" className="text-link button-link">
              Back to Dashboard
            </Link>
          </div>
        </header>

        <section className="panel">
          <h3>Channels</h3>
          <p>In-app notifications are always enabled for MVP.</p>

          <label className="toggle-row">
            <span>In-app notifications</span>
            <input type="checkbox" checked readOnly disabled />
          </label>

          <label className="toggle-row">
            <span>Voice notifications (Stretch)</span>
            <input
              type="checkbox"
              checked={settings.voiceEnabled}
              onChange={(event) => handleVoiceToggle(event.target.checked)}
            />
          </label>
        </section>

        <section className="panel">
          <h3>Trigger Mode</h3>
          <div className="quick-links stack-links">
            <label className="radio-row">
              <input
                type="radio"
                name="trigger-mode"
                checked={settings.triggerMode === 'people'}
                onChange={() => handleTriggerMode('people')}
              />
              People based (Stage1: 2 ahead, Stage2: 1 ahead)
            </label>

            <label className="radio-row">
              <input
                type="radio"
                name="trigger-mode"
                checked={settings.triggerMode === 'time'}
                onChange={() => handleTriggerMode('time')}
              />
              Time based (Stage1: 10 min, Stage2: 5 min)
            </label>
          </div>
        </section>

        {settings.voiceEnabled ? (
          <section className="panel">
            <h3>Voice Verification</h3>
            <form className="form-grid" onSubmit={handlePhoneSubmit}>
              <label>
                Phone Number
                <input
                  type="text"
                  value={settings.phoneNumber}
                  onChange={(event) => {
                    const next: NotificationSettings = {
                      ...settings,
                      phoneNumber: event.target.value,
                      phoneVerified: false,
                    }
                    persist(next)
                  }}
                  placeholder="+1-416-555-0177"
                />
              </label>

              <div className="form-actions">
                <button type="submit">Send OTP</button>
              </div>
            </form>

            {otpSent ? (
              <div className="verification-box">
                <label>
                  OTP Code
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    placeholder="Enter verification code"
                  />
                </label>
                <button type="button" onClick={handleVerifyCode}>
                  Verify
                </button>
              </div>
            ) : null}

            <p>Verification status: {settings.phoneVerified ? 'Verified' : 'Not verified'}</p>
          </section>
        ) : null}

        {message ? <p className="info-banner">{message}</p> : null}
        {error ? <p className="error-banner">{error}</p> : null}
      </section>
    </main>
  )
}

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import type { AccountStatus, UiTheme } from '../../shared/home-api'
import {
  AI_PROVIDERS,
  type AiProviderId,
  type AiProviderMeta,
  type AiSettings,
} from '@genoffice/ai-provider'
import './settings.css'

// ── Settings modal (opened from the account menu) ─────────
// Genspark-style two-pane dialog: section nav on the left, fields on the right.
// All values go through the existing home IPC; nothing is stored locally.

// sorted by ISO 639 language code — native-script labels have no natural
// shared alphabet, so the code is the ordering key
const LANG_OPTIONS = [
  { value: 'ar', label: 'العربية' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'he', label: 'עברית' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'th', label: 'ไทย' },
  { value: 'zh', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
] as const

// GenMail's option order: follow-system first, then the manual picks
const THEME_OPTIONS = [
  { value: 'system', labelKey: 'themeSystem' },
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
] as const satisfies readonly { value: UiTheme; labelKey: StringKey }[]

const CHANNEL_OPTIONS = [
  { value: 'stable', labelKey: 'channelStable' },
  { value: 'beta', labelKey: 'channelBeta' },
] as const satisfies readonly { value: 'stable' | 'beta'; labelKey: StringKey }[]

type SectionId = 'account' | 'general' | 'ai' | 'about'

const SECTIONS: readonly { id: SectionId; labelKey: StringKey }[] = [
  { id: 'account', labelKey: 'setSecAccount' },
  { id: 'general', labelKey: 'setSecGeneral' },
  { id: 'ai', labelKey: 'setSecAi' },
  { id: 'about', labelKey: 'setSecAbout' },
]

// Providers selectable in the UI; "genspark" is included so users can switch back to the default.
const AI_PROVIDER_OPTIONS: readonly { value: AiProviderId; label: string }[] = AI_PROVIDERS.map(
  (p: AiProviderMeta) => ({ value: p.id, label: p.label }),
)

function SectionIcon({ id }: { id: SectionId }) {
  if (id === 'account') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.2" r="2.9" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M2.7 13.6a5.5 5.5 0 0 1 10.6 0"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'general') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 5h8M13 5h1M2 11h1M6 11h8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="11.5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }
  if (id === 'ai') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 2v2.2M8 11.8V14M2 8h2.2M11.8 8H14M3.7 3.7l1.6 1.6M10.7 10.7l1.6 1.6M12.3 3.7l-1.6 1.6M5.3 10.7l-1.6 1.6"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.4v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  )
}

/** label-over-value field row with an optional right-aligned action */
function Field({
  label,
  value,
  valueTitle,
  action,
}: {
  label: string
  value: string
  valueTitle?: string
  action?: ReactNode
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-label">{label}</div>
        <div className="set-field-value" data-tip={valueTitle}>
          {value}
        </div>
      </div>
      {action}
    </div>
  )
}

export interface SettingsModalProps {
  status: AccountStatus | null
  loggingOut: boolean
  /** browser sign-in in progress (spinner shows on the account entry) */
  loginWaiting: boolean
  /** device auth URL while waiting — rescue actions when the browser did not auto-open */
  loginUrl: string | null
  urlCopied: boolean
  onOpenLoginUrl: () => void
  onCopyLoginUrl: () => void
  onClose: () => void
  /** closes the modal and launches the Genspark login flow (progress shows on the account entry) */
  onLogin: () => void
  onLogout: () => void
}

export function SettingsModal({
  status,
  loggingOut,
  loginWaiting,
  loginUrl,
  urlCopied,
  onOpenLoginUrl,
  onCopyLoginUrl,
  onClose,
  onLogin,
  onLogout,
}: SettingsModalProps) {
  const { lang, setLang, t } = useI18n()
  const [section, setSection] = useState<SectionId>('account')
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [appVersion, setAppVersion] = useState('')

  // AI provider config (loaded on first visit of the AI section)
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSavedAt, setAiSavedAt] = useState(0)

  useEffect(() => {
    let alive = true
    void window.aiOffice.getTheme?.().then((th) => {
      if (alive) setTheme(th)
    })
    void window.aiOffice.getDefaultSaveDir?.().then((dir) => {
      if (alive && dir) setSaveDir(dir)
    })
    void window.aiOffice.getUpdateChannel?.().then((ch) => {
      if (alive) setChannel(ch)
    })
    void window.aiOffice.getAppVersion?.().then((v) => {
      if (alive && v) setAppVersion(v)
    })
    void window.aiOffice.getAiSettings?.().then((s) => {
      if (alive && s) setAiSettings(s)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const applyTheme = (next: UiTheme) => {
    setTheme(next)
    void window.aiOffice.setTheme(next)
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  }

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  // ── AI provider config helpers ──
  // Local edits update the in-memory snapshot; "Save" persists via setAiSettings.
  const currentProvider = aiSettings?.provider ?? 'genspark'
  const currentProviderMeta = AI_PROVIDERS.find((p) => p.id === currentProvider)
  const currentProviderConfig = aiSettings?.providers?.[currentProvider]

  const updateAiField = (field: 'apiKey' | 'model' | 'baseUrl', value: string) => {
    setAiSettings((prev) => {
      if (!prev) return prev
      const cfg = prev.providers[currentProvider] ?? { apiKey: '', model: '', baseUrl: '' }
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [currentProvider]: { ...cfg, [field]: value },
        },
      }
    })
  }

  const switchAiProvider = (next: AiProviderId) => {
    setAiSettings((prev) => (prev ? { ...prev, provider: next } : prev))
  }

  const saveAiSettings = () => {
    if (!aiSettings) return
    setAiSaving(true)
    void window.aiOffice.setAiSettings?.(aiSettings).then(() => {
      setAiSaving(false)
      setAiSavedAt(Date.now())
    })
  }

  const loggedIn = status?.loggedIn ?? false
  const email = status?.email ?? ''

  return (
    <div
      className="set-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="set-dialog" role="dialog" aria-modal="true" aria-label={t('settings')}>
        <div className="set-header">
          <h2 className="set-title">{t('settings')}</h2>
          <button className="set-close" onClick={onClose} aria-label={t('cancel')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="set-body">
          <nav className="set-nav" aria-label={t('settings')}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`set-nav-item${section === s.id ? ' active' : ''}`}
                aria-current={section === s.id}
                onClick={() => setSection(s.id)}
              >
                <SectionIcon id={s.id} />
                {t(s.labelKey)}
              </button>
            ))}
          </nav>
          <div className="set-pane">
            {section === 'account' && (
              <>
                <h3 className="set-pane-title">{t('setSecAccount')}</h3>
                <Field label={t('setEmail')} value={loggedIn ? email : t('setNotLoggedIn')} />
                {loggedIn && (
                  <Field
                    label={t('credits')}
                    value={
                      status?.creditBalance === undefined
                        ? '—'
                        : Math.floor(status.creditBalance).toLocaleString('en-US')
                    }
                    action={
                      <button
                        className="set-btn"
                        data-tip={t('creditsTip')}
                        onClick={() => void window.aiOffice.openCreditUsage?.()}
                      >
                        {t('setViewUsage')}
                      </button>
                    }
                  />
                )}
                <div className="set-pane-footer">
                  {loggedIn ? (
                    <button className="set-btn danger" disabled={loggingOut} onClick={onLogout}>
                      {loggingOut ? t('loggingOut') : t('logout')}
                    </button>
                  ) : (
                    <>
                      {loginWaiting && loginUrl && (
                        <>
                          <button className="set-btn" onClick={onOpenLoginUrl}>
                            {t('loginOpenManually')}
                          </button>
                          <button className="set-btn" onClick={onCopyLoginUrl}>
                            {urlCopied ? t('loginCopied') : t('loginCopyUrl')}
                          </button>
                        </>
                      )}
                      <button className="set-btn primary" onClick={onLogin}>
                        {loginWaiting ? t('waitingShort') : t('loginGenspark')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {section === 'general' && (
              <>
                <h3 className="set-pane-title">{t('setSecGeneral')}</h3>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-lang">
                      {t('language')}
                    </label>
                  </div>
                  <span className="set-select-wrap">
                    <span className="set-select-text" aria-hidden="true">
                      {LANG_OPTIONS.find((o) => o.value === lang)?.label ?? lang}
                    </span>
                    <select
                      id="set-lang"
                      className="set-select"
                      value={lang}
                      onChange={(e) => setLang(e.target.value as typeof lang)}
                    >
                      {LANG_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-theme">
                      {t('theme')}
                    </label>
                  </div>
                  <span className="set-select-wrap">
                    <span className="set-select-text" aria-hidden="true">
                      {t(THEME_OPTIONS.find((o) => o.value === theme)?.labelKey ?? 'themeSystem')}
                    </span>
                    <select
                      id="set-theme"
                      className="set-select"
                      value={theme}
                      onChange={(e) => applyTheme(e.target.value as UiTheme)}
                    >
                      {THEME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
                <Field
                  label={t('saveLocation')}
                  value={saveDir || '—'}
                  valueTitle={saveDir}
                  action={
                    <button className="set-btn" onClick={changeSaveDir}>
                      {t('setChange')}
                    </button>
                  }
                />
              </>
            )}
            {section === 'ai' && (
              <>
                <h3 className="set-pane-title">{t('setSecAi')}</h3>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-ai-provider">
                      {t('setAiProvider')}
                    </label>
                  </div>
                  <span className="set-select-wrap">
                    <span className="set-select-text" aria-hidden="true">
                      {AI_PROVIDER_OPTIONS.find((o) => o.value === currentProvider)?.label ??
                        currentProvider}
                    </span>
                    <select
                      id="set-ai-provider"
                      className="set-select"
                      value={currentProvider}
                      onChange={(e) => switchAiProvider(e.target.value as AiProviderId)}
                    >
                      {AI_PROVIDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>

                {currentProvider === 'genspark' && (
                  <div className="set-ai-hint">{t('setAiGensparkHint')}</div>
                )}

                {currentProvider !== 'genspark' && (
                  <>
                    <div className="set-field set-field-input">
                      <div className="set-field-text">
                        <label className="set-field-label" htmlFor="set-ai-key">
                          {t('setAiApiKey')}
                        </label>
                      </div>
                      <input
                        id="set-ai-key"
                        className="set-input"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={currentProviderMeta?.keyPlaceholder ?? ''}
                        value={currentProviderConfig?.apiKey ?? ''}
                        onChange={(e) => updateAiField('apiKey', e.target.value)}
                      />
                    </div>
                    <div className="set-field set-field-input">
                      <div className="set-field-text">
                        <label className="set-field-label" htmlFor="set-ai-model">
                          {t('setAiModel')}
                        </label>
                      </div>
                      <input
                        id="set-ai-model"
                        className="set-input"
                        type="text"
                        spellCheck={false}
                        placeholder={currentProviderMeta?.defaultModel ?? ''}
                        value={currentProviderConfig?.model ?? ''}
                        onChange={(e) => updateAiField('model', e.target.value)}
                        list="set-ai-model-list"
                      />
                      <datalist id="set-ai-model-list">
                        {currentProviderMeta?.models.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                    {currentProviderMeta?.needsBaseUrl && (
                      <div className="set-field set-field-input">
                        <div className="set-field-text">
                          <label className="set-field-label" htmlFor="set-ai-baseurl">
                            {t('setAiBaseUrl')}
                          </label>
                        </div>
                        <input
                          id="set-ai-baseurl"
                          className="set-input"
                          type="text"
                          spellCheck={false}
                          placeholder="https://api.openai.com/v1"
                          value={currentProviderConfig?.baseUrl ?? ''}
                          onChange={(e) => updateAiField('baseUrl', e.target.value)}
                        />
                      </div>
                    )}
                    <div className="set-pane-footer">
                      <button
                        className="set-btn primary"
                        disabled={aiSaving || !aiSettings}
                        onClick={saveAiSettings}
                      >
                        {aiSaving
                          ? t('waitingShort')
                          : aiSavedAt
                            ? t('setAiSaved')
                            : t('setAiSave')}
                      </button>
                    </div>
                    <div className="set-ai-hint">{t('setAiCustomHint')}</div>
                  </>
                )}
              </>
            )}
            {section === 'about' && (
              <>
                <h3 className="set-pane-title">{t('setSecAbout')}</h3>
                <Field label={t('versionLabel')} value={appVersion || '—'} />
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-channel">
                      {t('updateChannel')}
                    </label>
                  </div>
                  <span className="set-select-wrap">
                    <span className="set-select-text" aria-hidden="true">
                      {t(
                        CHANNEL_OPTIONS.find((o) => o.value === channel)?.labelKey ??
                          'channelStable',
                      )}
                    </span>
                    <select
                      id="set-channel"
                      className="set-select"
                      value={channel}
                      onChange={(e) => {
                        const next = e.target.value === 'beta' ? 'beta' : 'stable'
                        setChannel(next)
                        void window.aiOffice.setUpdateChannel(next)
                      }}
                    >
                      {CHANNEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

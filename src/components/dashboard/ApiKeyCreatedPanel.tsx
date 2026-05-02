'use client'

type ApiKeyCreatedPanelProps = {
  rawKey: string
}

export function ApiKeyCreatedPanel({ rawKey }: ApiKeyCreatedPanelProps) {
  if (!rawKey) return null

  return (
    <div className="tw-once-panel" role="status">
      <strong>Copy this key now. You will not be able to see it again.</strong>
      <code>{rawKey}</code>
      <button className="tw-secondary-btn" type="button" onClick={() => navigator.clipboard.writeText(rawKey)}>
        Copy key
      </button>
    </div>
  )
}

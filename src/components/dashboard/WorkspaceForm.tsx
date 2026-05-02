'use client'

import type { FormEvent } from 'react'

type WorkspaceFormProps = {
  workspaceName: string
  onWorkspaceNameChange: (name: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function WorkspaceForm({ workspaceName, onWorkspaceNameChange, onSubmit }: WorkspaceFormProps) {
  return (
    <form className="tw-form-grid" onSubmit={onSubmit}>
      <label className="tw-field">
        New workspace
        <input required maxLength={100} value={workspaceName} onChange={event => onWorkspaceNameChange(event.target.value)} placeholder="Acme AI" />
      </label>
      <button className="tw-primary-btn" type="submit">Create workspace</button>
    </form>
  )
}

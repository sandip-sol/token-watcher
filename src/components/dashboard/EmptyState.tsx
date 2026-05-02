type EmptyStateProps = {
  children: string
}

export function EmptyState({ children }: EmptyStateProps) {
  return <div className="tw-empty-state">{children}</div>
}

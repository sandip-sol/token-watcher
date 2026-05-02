import { EmptyState } from './EmptyState'

type LoadingStateProps = {
  children: string
}

export function LoadingState({ children }: LoadingStateProps) {
  return <EmptyState>{children}</EmptyState>
}

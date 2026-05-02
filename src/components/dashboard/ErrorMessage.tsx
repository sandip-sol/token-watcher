type ErrorMessageProps = {
  message: string
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) return null

  return <p className="tw-form-error">{message}</p>
}

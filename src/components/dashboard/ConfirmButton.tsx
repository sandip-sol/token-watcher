'use client'

type ConfirmButtonProps = {
  className: string
  disabled?: boolean
  confirmMessage: string
  children: string
  onConfirm: () => void
}

export function ConfirmButton({ className, disabled, confirmMessage, children, onConfirm }: ConfirmButtonProps) {
  return (
    <button
      className={className}
      type="button"
      disabled={disabled}
      onClick={() => {
        if (window.confirm(confirmMessage)) onConfirm()
      }}
    >
      {children}
    </button>
  )
}

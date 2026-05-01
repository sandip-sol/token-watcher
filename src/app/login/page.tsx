type LoginPageProps = {
  searchParams?: {
    error?: string
  }
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const hasError = searchParams?.error === 'invalid'
  const hasConfigError = searchParams?.error === 'config'

  return (
    <main className="tw-login-page">
      <section className="tw-login-card" aria-labelledby="login-title">
        <div className="tw-login-brand">
          <span className="tw-logo">⬡ TokenWatcher</span>
          <span className="tw-tagline">Dashboard sign in</span>
        </div>

        <form className="tw-login-form" action="/api/auth/login" method="post">
          <label className="tw-field">
            <span>Username</span>
            <input name="username" autoComplete="username" required />
          </label>

          <label className="tw-field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>

          {hasError ? (
            <p className="tw-form-error" role="alert">
              Invalid username or password.
            </p>
          ) : null}

          {hasConfigError ? (
            <p className="tw-form-error" role="alert">
              Dashboard authentication is not configured.
            </p>
          ) : null}

          <button className="tw-primary-btn" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  )
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function endOfUtcDay(date: Date): Date {
  const start = startOfUtcDay(date)
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1) - 1)
}

export function startOfUtcHour(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()))
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ))
}

export function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ))
}

export function parseDateRangeUtc(params: URLSearchParams | Record<string, string | null | undefined>): {
  from: Date
  to: Date
} {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) : params[key] ?? null
  const now = new Date()
  const preset = get('range') || ''
  const daysParam = Number(get('days') ?? '')

  if (preset === 'today') return { from: startOfUtcDay(now), to: now }
  if (preset === 'this_month') return { from: startOfUtcMonth(now), to: now }

  const safeDays = Number.isFinite(daysParam) ? Math.min(Math.max(1, Math.floor(daysParam)), 365) : 30
  const from = startOfUtcDay(addUtcDays(now, -(safeDays - 1)))

  return { from, to: now }
}

export function parseUtcDateInput(value: string, endExclusive = false): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = startOfUtcDay(new Date(`${value}T00:00:00.000Z`))
    return endExclusive ? addUtcDays(day, 1) : day
  }

  return new Date(value)
}

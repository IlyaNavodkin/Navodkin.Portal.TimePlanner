const DAY_MS = 24 * 60 * 60 * 1000

export function parseIsoDayToUtcMs(isoDay: string): number {
  return new Date(`${isoDay}T00:00:00Z`).getTime()
}

export function toIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function addIsoDays(isoDay: string, delta: number): string {
  const source = new Date(`${isoDay}T00:00:00Z`)
  source.setUTCDate(source.getUTCDate() + delta)
  return toIsoDateUtc(source)
}

export function getIsoDayDiff(fromDay: string, toDay: string): number {
  return Math.round((parseIsoDayToUtcMs(toDay) - parseIsoDayToUtcMs(fromDay)) / DAY_MS)
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function getDaysFromIndexes(days: string[], startIndex: number, endIndex: number): string[] {
  if (days.length === 0) {
    return []
  }

  const start = clampNumber(Math.min(startIndex, endIndex), 0, days.length - 1)
  const end = clampNumber(Math.max(startIndex, endIndex), 0, days.length - 1)
  return days.slice(start, end + 1)
}

export function formatShortDayLabel(isoDay: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${isoDay}T00:00:00Z`))
}

export function formatMonthLabel(isoDay: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${isoDay}T00:00:00Z`))
}

export function isWeekendIsoDay(isoDay: string): boolean {
  const dayOfWeek = new Date(`${isoDay}T00:00:00Z`).getUTCDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

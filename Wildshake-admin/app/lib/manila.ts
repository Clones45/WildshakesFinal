/**
 * Branch time helpers.
 *
 * Every date the portal shows or files is a branch-local (Asia/Manila) date,
 * whatever clock the server (Vercel runs on UTC) or the viewer's browser is on.
 * Use these instead of `toISOString().split('T')[0]` or a bare `toLocale*String`.
 */
export const MANILA = 'Asia/Manila'

/** yyyy-mm-dd in Manila for the given moment (default: now). */
export function manilaDay(at: Date | string | number = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA }).format(new Date(at))
}

/** Midnight in Manila, as a Date, for a yyyy-mm-dd day (default: today). */
export function manilaMidnight(day: string = manilaDay()): Date {
  return new Date(`${day}T00:00:00+08:00`)
}

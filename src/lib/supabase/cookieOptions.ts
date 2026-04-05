const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

export const supabaseCookieOptions = {
  name: 'golfbetting-auth',
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: false,
  maxAge: ONE_YEAR_IN_SECONDS,
}

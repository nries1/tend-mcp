// ---------------------------------------------------------------------------
// Unofficial Tend Dental API client. Tend has no public developer API — this
// talks to whatever internal endpoints their own web app calls, discovered
// via browser devtools. Everything below is a skeleton: fill in real
// endpoints/payloads as they're found (see README's "Adding a real endpoint"
// section), and expect them to shift without notice since none of this is
// contractually stable the way a documented public API would be.
//
// Auth is a placeholder guess (email/password -> some kind of session).
// Replace once the real login flow (form POST vs OAuth-style redirect vs
// magic link/OTP, and whether the resulting session is a bearer token or a
// cookie jar) is known from the network tab.
// ---------------------------------------------------------------------------

import axios, { type AxiosInstance } from 'axios'

const BASE_URL = process.env.TEND_BASE_URL || 'https://api.tend.com' // TODO: confirm real API host from devtools

export interface TendConfig {
  email: string
  password: string
}

export function configFromEnv(): TendConfig {
  const email = process.env.TEND_EMAIL
  const password = process.env.TEND_PASSWORD
  if (!email || !password) {
    throw new TendApiError('Missing TEND_EMAIL or TEND_PASSWORD environment variable')
  }
  return { email, password }
}

export class TendApiError extends Error {}

export interface Appointment {
  id: string
  startsAt: string
  provider: string
  location: string
  type: string
}

export class TendClient {
  private http: AxiosInstance
  private sessionToken: string | null = null

  constructor(private config: TendConfig) {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 10_000 })
  }

  // TODO: replace with the real login request once known. Likely candidates
  // to check in devtools: a POST to something like /auth/login or
  // /api/session returning either a bearer token in the JSON body or a
  // Set-Cookie session — and whether MFA/a verification step is involved.
  private async login(): Promise<void> {
    throw new TendApiError(
      'TendClient.login() is not implemented yet — fill in the real auth flow from devtools (see README).'
    )
  }

  private async ensureSession(): Promise<void> {
    if (!this.sessionToken) await this.login()
  }

  // TODO: once login() is real, attach the resulting session here — either
  // an Authorization header or rely on the shared cookie jar (axios needs a
  // cookie-jar-aware adapter, e.g. axios-cookiejar-support, if Tend uses
  // cookie-based sessions rather than a bearer token).
  private async request<T>(method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
    await this.ensureSession()
    const res = await this.http.request<T>({
      method,
      url: path,
      data,
      headers: this.sessionToken ? { Authorization: `Bearer ${this.sessionToken}` } : {},
    })
    return res.data
  }

  // TODO: fill in the real endpoint/response shape.
  async listAppointments(): Promise<Appointment[]> {
    return this.request<Appointment[]>('GET', '/appointments')
  }

  // TODO: fill in the real endpoint/request shape (likely needs a provider
  // or slot ID discovered from an availability-search endpoint first, not
  // just a raw date/time).
  async bookAppointment(params: { slotId: string }): Promise<Appointment> {
    return this.request<Appointment>('POST', '/appointments', params)
  }
}

// ---------------------------------------------------------------------------
// Unofficial Tend Dental API client. Tend has no public developer API — this
// talks to internal endpoints their own web app (hellotend.com) calls,
// reverse-engineered from two HAR captures: 2026-08-01 (already-logged-in
// session — booking flow, GraphQL patient lookup) and a follow-up capture of
// a real logged-out -> logged-in flow, which revealed real login.
//
// Auth: Tend authenticates via AWS Cognito (user pool us-east-1_20Y4JZuKy,
// app client 6oinjm62ui6cee747nrd2u90um — the client ID identifies Tend's
// own web app, not a per-user secret, same as any public OAuth client_id),
// but fronts it with their own thin proxy rather than exposing raw Cognito
// SRP to the browser:
//   - Real login: `POST https://identity.hellotend.com/login` with plain
//     JSON `{username, password}` (username = email) — no Cognito
//     SRP/USER_PASSWORD_AUTH dance client-side, Tend's backend handles that
//     internally. Returns `{idToken, accessToken, refreshToken}` directly.
//   - Session renewal: Cognito's own `InitiateAuth` REFRESH_TOKEN_AUTH flow
//     (COGNITO_ENDPOINT below), using the refreshToken from login. No
//     password needed for this, confirmed live; the refresh token isn't
//     rotated on use, so it's reusable for a long time (Cognito refresh
//     tokens are typically valid 30-60 days).
//   - API calls: `Authorization: Bearer <idToken>` (NOT a cookie — an
//     idToken cookie alone gets rejected, confirmed live). idToken is a
//     ~24h JWT.
//
// Either credential works standalone: password logs in fresh and captures
// a refreshToken for subsequent renewals; a refreshToken obtained by hand
// (DevTools -> Application -> Cookies -> `refreshToken`) skips login
// entirely. Treat both like a password, not an API key — a refreshToken in
// particular is a long-lived standing credential, not a short-lived
// session artifact.
// ---------------------------------------------------------------------------

import axios, { type AxiosInstance } from 'axios'

const BASE_URL = 'https://api.hellotend.com'
const IDENTITY_BASE_URL = 'https://identity.hellotend.com'
const COGNITO_ENDPOINT = 'https://cognito-idp.us-east-1.amazonaws.com/'
const COGNITO_CLIENT_ID = '6oinjm62ui6cee747nrd2u90um'

export interface TendConfig {
  email: string
  /** Tend account password. Used once to obtain a refreshToken if one isn't already provided. */
  password?: string
  /**
   * Cognito refresh token. If provided, skips password login entirely. If
   * omitted but `password` is set, obtained automatically on first use and
   * kept in memory for the process lifetime (not persisted back to .env).
   */
  refreshToken?: string
}

export function configFromEnv(): TendConfig {
  const email = process.env.TEND_EMAIL
  const password = process.env.TEND_PASSWORD || undefined
  const refreshToken = process.env.TEND_REFRESH_TOKEN || undefined
  if (!email) throw new TendApiError('Missing TEND_EMAIL environment variable')
  if (!password && !refreshToken) {
    throw new TendApiError('Set either TEND_PASSWORD or TEND_REFRESH_TOKEN (see README)')
  }
  return { email, password, refreshToken }
}

// Decodes a JWT's `exp` claim without verifying the signature — fine here
// since we only ever use tokens we just received directly from Tend/Cognito
// ourselves, ownership is not in question.
function decodeJwtExpiresAt(token: string): number {
  const payload = token.split('.')[1]
  const json = Buffer.from(payload, 'base64url').toString('utf8')
  const { exp } = JSON.parse(json) as { exp: number }
  return exp * 1000
}

export class TendApiError extends Error {}

// ---------------------------------------------------------------------------
// Static reference data. Tend has no "list studios" / "list service types"
// API endpoint we could find — every studio/service-type value below was
// read out of CMS-driven Next.js page props (booking/services.json) in the
// 2026-08-01 capture, not a stable JSON API. It will drift as Tend opens/
// closes studios or changes their service catalog, with no live source to
// re-fetch it from short of re-capturing the booking flow periodically.
// ---------------------------------------------------------------------------

export interface Studio {
  slug: string
  market: string
  serviceCodes: string[]
}

export const STUDIOS: Studio[] = [
  { slug: 'mosaic-district', market: 'washington-dc', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'VENCONS', 'EMGNCY', 'CRNCON', 'BRGCON', 'INVISALN', 'IMPCON', 'BOTOXCON', 'SLPCONS'] },
  { slug: 'ballston', market: 'washington-dc', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'GENOCON', 'IMPCON', 'BOTOXCON', 'SLPCONS'] },
  { slug: 'buckhead', market: 'atlanta', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'VENCONS', 'EMGNCY', 'CRNCON', 'BRGCON', 'INVISALN', 'GENOCON', 'BOTOXCON', 'IMPCON', 'SLPCONS'] },
  { slug: '14th-and-u', market: 'washington-dc', serviceCodes: ['CLNCHK', 'CRNCON', 'WHTNG', 'COSCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'IMPCON', 'SLPCONS'] },
  { slug: 'navy-yard', market: 'washington-dc', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'GENOCON', 'BOTOXCON', 'IMPCON', 'SLPCONS'] },
  { slug: 'pentagon-city', market: 'washington-dc', serviceCodes: ['COSCON', 'EMGNCY', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'CLNCHK', 'WHTNG', 'IMPCON', 'SLPCONS'] },
  { slug: 'ponce-city-market', market: 'atlanta', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'EMGNCY', 'INVISALN', 'GENOCON', 'BOTOXCON', 'IMPCON', 'SLPCONS'] },
  { slug: 'capitol-hill', market: 'washington-dc', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'IMPCON', 'BOTOXCON', 'SLPCONS'] },
  { slug: 'atlanta-midtown', market: 'atlanta', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'VENCONS', 'EMGNCY', 'CRNCON', 'BRGCON', 'INVISALN', 'BOTOXCON', 'IMPCON', 'SLPCONS'] },
  { slug: 'east-nashville', market: 'nashville', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'VENCONS', 'BRGCON', 'EMGNCY', 'INVISALN', 'BOTOXCON', 'IMPCON', 'GENOCON', 'SLPCONS'] },
  { slug: 'westport', market: 'connecticut', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'VENCONS', 'INVISALN', 'BRGCON', 'EMGNCY', 'IMPCON', 'GENOCON', 'BOTOXCON', 'SLPCONS'] },
  { slug: 'wall-street', market: 'new-york-city', serviceCodes: ['IMPCON', 'WHTNG', 'EMGNCY', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'CLNCHK', 'GENOCON', 'BOTOXCON'] },
  { slug: 'kendall-square', market: 'boston', serviceCodes: ['CLNCHK', 'CRNCON', 'WHTNG', 'COSCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'GENOCON', 'IMPCON'] },
  { slug: 'post-office-square', market: 'boston', serviceCodes: ['CRNCON', 'WHTNG', 'COSCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'GENOCON', 'CLNCHK', 'BOTOXCON', 'IMPCON'] },
  { slug: 'golden-triangle', market: 'washington-dc', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'GENOCON', 'IMPCON', 'BOTOXCON', 'SLPCONS'] },
  { slug: 'metro-center', market: 'washington-dc', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'IMPCON', 'BOTOXCON', 'SLPCONS'] },
  { slug: 'grand-central', market: 'new-york-city', serviceCodes: ['IMPCON', 'WHTNG', 'EMGNCY', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'CLNCHK', 'BOTOXCON'] },
  { slug: 'upper-west-side', market: 'new-york-city', serviceCodes: ['IMPCON', 'WHTNG', 'EMGNCY', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'GENOCON', 'CLNCHK', 'BOTOXCON'] },
  { slug: 'south-boston', market: 'boston', serviceCodes: ['CLNCHK', 'WHTNG', 'COSCON', 'EMGNCY', 'CRNCON', 'BRGCON', 'INVISALN', 'VENCONS', 'IMPCON'] },
  { slug: 'east-village', market: 'new-york-city', serviceCodes: ['COSCON', 'EMGNCY', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'WHTNG', 'CLNCHK', 'IMPCON'] },
  { slug: 'west-village', market: 'new-york-city', serviceCodes: ['COSCON', 'EMGNCY', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'WHTNG', 'CLNCHK', 'BOTOXCON', 'IMPCON'] },
  { slug: 'clinton-hill', market: 'new-york-city', serviceCodes: ['WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'CLNCHK', 'EMGNCY', 'IMPCON'] },
  { slug: 'upper-east-side', market: 'new-york-city', serviceCodes: ['WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'CLNCHK', 'BOTOXCON', 'IMPCON'] },
  { slug: 'hells-kitchen', market: 'new-york-city', serviceCodes: ['WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'CLNCHK', 'BOTOXCON', 'IMPCON'] },
  { slug: 'fenway', market: 'boston', serviceCodes: ['COSCON', 'EMGNCY', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'WHTNG', 'CLNCHK', 'IMPCON'] },
  { slug: 'williamsburg', market: 'new-york-city', serviceCodes: ['IMPCON', 'WHTNG', 'EMGNCY', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'GENOCON', 'CLNCHK', 'BOTOXCON'] },
  { slug: 'chelsea', market: 'new-york-city', serviceCodes: ['CLNCHK', 'WHTNG', 'IMPCON', 'EMGNCY', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'GENOCON', 'BOTOXCON'] },
  { slug: 'rockefeller-center', market: 'new-york-city', serviceCodes: ['WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'GENOCON', 'CLNCHK', 'BOTOXCON', 'IMPCON'] },
  { slug: 'long-island-city', market: 'new-york-city', serviceCodes: ['COSCON', 'EMGNCY', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'WHTNG', 'CLNCHK', 'IMPCON'] },
  { slug: 'flatiron', market: 'new-york-city', serviceCodes: ['IMPCON', 'INVISALN', 'GENOCON'] },
  { slug: 'park-slope', market: 'new-york-city', serviceCodes: ['WHTNG', 'COSCON', 'CRNCON', 'BRGCON', 'VENCONS', 'EMGNCY', 'INVISALN', 'CLNCHK', 'BOTOXCON', 'IMPCON'] },
  { slug: 'downtown-brooklyn', market: 'new-york-city', serviceCodes: ['COSCON', 'EMGNCY', 'CRNCON', 'BRGCON', 'VENCONS', 'INVISALN', 'WHTNG', 'CLNCHK', 'IMPCON'] },
  { slug: 'cobble-hill', market: 'new-york-city', serviceCodes: ['VENCONS', 'BRGCON', 'CRNCON', 'COSCON', 'EMGNCY', 'WHTNG', 'INVISALN', 'GENOCON', 'CLNCHK', 'BOTOXCON', 'IMPCON'] },
  // No serviceCodes captured for these two (null in the source payload) —
  // "virtual" is presumably teleconsult-only; "stella" is unclear.
  { slug: 'stella', market: 'new-york-city', serviceCodes: [] },
  { slug: 'virtual', market: 'new-york-city', serviceCodes: [] },
]

export interface ServiceType {
  code: string
  bookingFlowName: string
  longName: string
  bookingDescription: string
  duration: string
}

// Only the codes that happened to carry full metadata in this capture.
// STUDIOS above references many more codes (WHTNG, COSCON, EMGNCY, CRNCON,
// BRGCON, INVISALN, IMPCON, BOTOXCON, SLPCONS, GENOCON) with no definition
// here yet — add them as they're seen with full detail.
export const SERVICE_TYPES: ServiceType[] = [
  {
    code: 'CLNCHK',
    bookingFlowName: 'Dental Exam',
    longName: 'Dental Exam',
    bookingDescription: 'Routine cleaning, x-rays, and exam',
    duration: '70 minutes or less',
  },
  {
    code: 'AESBOTFL',
    bookingFlowName: 'Aesthetic Injectables',
    longName: 'Aesthetic Botox & Filler Consult',
    bookingDescription: 'Subtle, dentist-led wrinkle smoothing and volume restoration',
    duration: '30 minutes or less',
  },
  {
    code: 'AESBOTOX',
    bookingFlowName: 'Aesthetic Injectables',
    longName: 'Aesthetic Botox Consult',
    bookingDescription: 'Subtle, precise dentist-led wrinkle smoothing',
    duration: '30 minutes or less',
  },
  {
    code: 'AESFILL',
    bookingFlowName: 'Aesthetic Injectables',
    longName: 'Aesthetic Filler Consult',
    bookingDescription: 'Natural, precise dentist-led volume and contouring',
    duration: '30 minutes or less',
  },
]

export interface TimeSlot {
  operatoryId: string
  providerId: string
  startsAt: string
  endsAt: string
}

export interface Appointment {
  id: string
  status?: string
  serviceType: string
  studio: string
  startsAt: string
  endsAt: string
  externalId: string
  canCancel?: boolean
  canBeRescheduledOnline?: boolean
}

interface RawAppointment {
  id: string
  status?: string
  service_type: string
  studio: string
  starts_at: string
  ends_at: string
  external_id: string
  can_cancel?: boolean
  can_be_rescheduled_online?: boolean
}

interface RawTimeSlot {
  operatory_id: string
  provider_id: string
  starts_at: string
  ends_at: string
}

interface RawAvailabilityResponse {
  location_id: string
  service_type_id: string
  timeslots: RawTimeSlot[]
}

interface RawBookedAppointment {
  id: string
  service_type: string
  studio: string
  starts_at: string
  ends_at: string
  external_id: string
}

export class TendClient {
  private http: AxiosInstance
  private cognito: AxiosInstance
  private identity: AxiosInstance
  private patientId: string | null = null
  private idToken: string | null = null
  private idTokenExpiresAt = 0
  // Populated from config, or from a password login's response if config
  // didn't already provide one. Kept in memory only — never written back to
  // .env, so a password-only setup re-logs-in every process restart rather
  // than persisting a refresh token to disk on your behalf.
  private refreshToken: string | undefined

  constructor(private config: TendConfig) {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 10_000 })
    this.cognito = axios.create({ timeout: 10_000 })
    this.identity = axios.create({ baseURL: IDENTITY_BASE_URL, timeout: 10_000 })
    this.refreshToken = config.refreshToken
  }

  // Real login — POSTs directly to Tend's own auth proxy, not raw Cognito.
  private async login(): Promise<void> {
    if (!this.config.password) {
      throw new TendApiError('No password configured — cannot log in (see TendConfig.password)')
    }
    const res = await this.identity.post<{
      idToken: string
      accessToken: string
      refreshToken: string
    }>('/login', { username: this.config.email, password: this.config.password })

    this.idToken = res.data.idToken
    this.idTokenExpiresAt = decodeJwtExpiresAt(res.data.idToken)
    this.refreshToken = res.data.refreshToken
  }

  // Session renewal via Cognito directly — used once we have a refresh
  // token, whether it came from config or from a prior login() call here.
  private async refreshSession(): Promise<void> {
    const res = await this.cognito.post<{
      AuthenticationResult?: { IdToken: string; ExpiresIn: number }
    }>(
      COGNITO_ENDPOINT,
      {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: COGNITO_CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: this.refreshToken },
      },
      {
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
      }
    )

    const result = res.data.AuthenticationResult
    if (!result) {
      throw new TendApiError(
        'Cognito refresh failed — the refresh token is likely expired or revoked. ' +
          (this.config.password
            ? 'Will fall back to password login on next attempt.'
            : 'Get a fresh one from DevTools or set TEND_PASSWORD (see README).')
      )
    }
    this.idToken = result.IdToken
    this.idTokenExpiresAt = Date.now() + result.ExpiresIn * 1000
    // Cognito's refresh response doesn't include a new refreshToken (not
    // rotated on use here, confirmed live) — this.refreshToken stays valid.
  }

  private async ensureIdToken(): Promise<string> {
    if (this.idToken && this.idTokenExpiresAt > Date.now() + 60_000) return this.idToken

    if (this.refreshToken) {
      try {
        await this.refreshSession()
        return this.idToken!
      } catch (err) {
        if (!this.config.password) throw err
        // Fall through to password login below.
      }
    }

    await this.login()
    return this.idToken!
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { params?: Record<string, unknown>; data?: unknown } = {}
  ): Promise<T> {
    const idToken = await this.ensureIdToken()
    const res = await this.http.request<T>({
      method,
      url: path,
      params: opts.params,
      data: opts.data,
      headers: { Authorization: `Bearer ${idToken}` },
    })
    return res.data
  }

  // Every REST endpoint below needs the patient's internal UUID, not their
  // email. Resolved via the same GraphQL query the profile page uses
  // (verified live in the capture) and cached for the process lifetime.
  async getPatientId(): Promise<string> {
    if (this.patientId) return this.patientId
    const res = await this.request<{ data: { patient: { id: string } } }>('POST', '/api/graphql', {
      data: { query: '\n  query {\n    patient {\n      id\n    }\n  }\n' },
    })
    const id = res.data?.patient?.id
    if (!id) throw new TendApiError('Could not resolve patient id from GraphQL response')
    this.patientId = id
    return id
  }

  async listAppointments(): Promise<Appointment[]> {
    const raw = await this.request<RawAppointment[]>(
      'GET',
      `/api/v2/patients/${encodeURIComponent(this.config.email)}/appointments`
    )
    return raw.map((a) => ({
      id: a.id,
      status: a.status,
      serviceType: a.service_type,
      studio: a.studio,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      externalId: a.external_id,
      canCancel: a.can_cancel,
      canBeRescheduledOnline: a.can_be_rescheduled_online,
    }))
  }

  async searchAvailability(params: {
    studio: string
    service: string
    startsAt: string
    endsAt: string
  }): Promise<TimeSlot[]> {
    const patientId = await this.getPatientId()
    const res = await this.request<RawAvailabilityResponse>('GET', '/api/availabilities', {
      params: {
        studio: params.studio,
        service: params.service,
        patient_id: patientId,
        patient_type: 'EXIST',
        starts_at: params.startsAt,
        ends_at: params.endsAt,
        aggregate_requests_starts_at: params.startsAt,
      },
    })
    return (res.timeslots || []).map((t) => ({
      operatoryId: t.operatory_id,
      providerId: t.provider_id,
      startsAt: t.starts_at,
      endsAt: t.ends_at,
    }))
  }

  // Fields/shape verified against a real booking made during the 2026-08-01
  // capture (201 response, real external_id assigned in Dentrix).
  async bookAppointment(params: {
    studio: string
    service: string
    startsAt: string
    endsAt: string
    operatoryId: string
    providerId: string
    isSelfPay?: boolean
  }): Promise<Appointment> {
    const patientId = await this.getPatientId()
    const res = await this.request<RawBookedAppointment>('POST', '/api/appointments', {
      data: {
        service_type: params.service,
        studio: params.studio,
        starts_at: params.startsAt,
        ends_at: params.endsAt,
        is_self_pay: params.isSelfPay ?? false,
        patient_id: patientId,
        provider_id: params.providerId,
        operatory_id: params.operatoryId,
        friendbuy_referral_code: '',
        friendbuy_referral_version: 'v1',
        meta: { consult: '' },
      },
    })
    return {
      id: res.id,
      serviceType: res.service_type,
      studio: res.studio,
      startsAt: res.starts_at,
      endsAt: res.ends_at,
      externalId: res.external_id,
    }
  }
}

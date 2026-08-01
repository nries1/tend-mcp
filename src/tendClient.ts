// ---------------------------------------------------------------------------
// Unofficial Tend Dental API client. Tend has no public developer API — this
// talks to internal endpoints their own web app (hellotend.com) calls,
// reverse-engineered from a HAR capture on 2026-08-01 covering: login (via
// an already-valid browser session — see the auth note below), list offices,
// select office, select appointment type, list available times, and book.
//
// Auth is the one real open gap. The captured session never showed a login
// POST (the browser was already authenticated), and Chrome's HAR export
// strips Authorization/Cookie/Set-Cookie headers before writing the file, so
// even an authenticated request in the capture doesn't reveal the mechanism.
// What we do know: it's not a bearer token in a request body or a custom
// header (none appeared anywhere), and the API sends
// `access-control-allow-credentials: true`, consistent with a same-site
// session cookie. Confirming the actual cookie name and the real login
// request needs a fresh HAR captured from a logged-out state (private
// window). Until then, TEND_COOKIE_HEADER below is a manual bridge.
// ---------------------------------------------------------------------------

import axios, { type AxiosInstance } from 'axios'

const BASE_URL = 'https://api.hellotend.com'

export interface TendConfig {
  email: string
  /**
   * Raw `Cookie:` request header value, copied from DevTools' Network tab
   * (Headers view of any authenticated request — NOT a HAR export, which
   * strips it) while logged into hellotend.com. Interim stand-in for real
   * login() until the actual auth flow is captured; stops working whenever
   * that browser session expires or you log out, so needs periodic manual
   * refreshing. Never commit this value.
   */
  cookieHeader?: string
}

export function configFromEnv(): TendConfig {
  const email = process.env.TEND_EMAIL
  if (!email) throw new TendApiError('Missing TEND_EMAIL environment variable')
  return {
    email,
    cookieHeader: process.env.TEND_COOKIE_HEADER || undefined,
  }
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
  private patientId: string | null = null

  constructor(private config: TendConfig) {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 10_000, withCredentials: true })
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { params?: Record<string, unknown>; data?: unknown } = {}
  ): Promise<T> {
    if (!this.config.cookieHeader) {
      throw new TendApiError(
        'No session available. Real login() is not implemented yet (auth flow unknown — see tendClient.ts header comment); set TEND_COOKIE_HEADER as an interim bridge (see README).'
      )
    }
    const res = await this.http.request<T>({
      method,
      url: path,
      params: opts.params,
      data: opts.data,
      headers: { Cookie: this.config.cookieHeader },
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

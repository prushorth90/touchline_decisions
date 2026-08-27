import type { CaptainRecommendation, FplFixture, FplPlayer, FplSquad, FplTeam, LineupRecommendation, TransferRecommendationResponse } from '../models/fpl'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export class TeamVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeamVerificationError'
  }
}

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface ProblemDetailsResponse {
  title?: string
  detail?: string
}

export async function request<T>(path: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError('The backend is unavailable. Check your connection and try again.')
  }

  if (!response.ok) {
    const problem = await readProblemDetails(response)
    throw new ApiError(
      problem?.detail ?? problem?.title ?? statusMessage(response.status),
      response.status,
    )
  }

  try {
    return await response.json() as T
  } catch {
    throw new ApiError('The backend returned an invalid response.', response.status)
  }
}

async function readProblemDetails(response: Response): Promise<ProblemDetailsResponse | null> {
  try {
    return await response.clone().json() as ProblemDetailsResponse
  } catch {
    return null
  }
}

function statusMessage(status: number) {
  if (status === 404) return 'The requested FPL data was not found.'
  if (status === 429) return 'Too many requests. Wait briefly and try again.'
  if (status === 502) return 'Fantasy Premier League is temporarily unavailable.'
  if (status === 503) return 'Application services are temporarily unavailable.'
  return status >= 500 ? 'The backend is temporarily unavailable. Try again shortly.' : 'The request could not be completed.'
}

export function getTeam(teamId: number, signal?: AbortSignal) {
  return request<FplTeam>(`/api/fpl/team/${teamId}`, signal)
}

export function getSquad(teamId: number, signal?: AbortSignal) {
  return request<FplSquad>(`/api/fpl/team/${teamId}/squad`, signal)
}

export function getPlayers(signal?: AbortSignal) {
  return request<FplPlayer[]>('/api/fpl/players', signal)
}

export function getFixtures(signal?: AbortSignal) {
  return request<FplFixture[]>('/api/fpl/fixtures', signal)
}

export function getCaptainRecommendation(teamId: number, signal?: AbortSignal) {
  return request<CaptainRecommendation>(`/api/recommendations/${teamId}/captain`, signal)
}

export function getLineupRecommendation(teamId: number, signal?: AbortSignal) {
  return request<LineupRecommendation>(`/api/recommendations/${teamId}/lineup`, signal)
}

export function getTransferRecommendations(teamId: number, signal?: AbortSignal) {
  return request<TransferRecommendationResponse>(`/api/recommendations/${teamId}/transfers?limit=10`, signal)
}

export async function verifyTeam(teamId: number, signal?: AbortSignal): Promise<FplTeam> {
  try {
    return await getTeam(teamId, signal)
  } catch (error) {
    if (error instanceof ApiError) {
      throw new TeamVerificationError(
        error.status === 404
          ? 'We could not find that FPL team. Check the ID and try again.'
          : error.message,
      )
    }
    throw error
  }
}
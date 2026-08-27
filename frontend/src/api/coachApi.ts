import type { CoachChatRequest, CoachChatResponse } from '../models/coach'
import { request } from './fplApi'
import { ApiError } from './fplApi'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export interface CoachProgressUpdate {
  code: string
  message: string
}

export function sendCoachMessage(payload: CoachChatRequest, signal?: AbortSignal) {
  return request<CoachChatResponse>('/api/coach/chat', signal, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function sendCoachMessageStream(
  payload: CoachChatRequest,
  onProgress: (update: CoachProgressUpdate) => void,
  signal?: AbortSignal,
): Promise<CoachChatResponse> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/coach/chat/stream`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('The backend is unavailable. Check your connection and try again.')
  }

  if (!response.ok) {
    const problem = await readError(response)
    throw new ApiError(problem, response.status)
  }
  if (!response.body) throw new ApiError('The backend did not provide a progress stream.', response.status)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: CoachChatResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    buffer = (buffer + decoder.decode(value, { stream: !done })).replaceAll('\r\n', '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const event = parseEvent(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
      if (event?.name === 'progress') onProgress(JSON.parse(event.data) as CoachProgressUpdate)
      if (event?.name === 'complete') result = JSON.parse(event.data) as CoachChatResponse
      if (event?.name === 'error') {
        const error = JSON.parse(event.data) as { message?: string }
        throw new ApiError(error.message ?? 'The coach could not complete this request.')
      }
      boundary = buffer.indexOf('\n\n')
    }
    if (done) break
  }

  if (!result) throw new ApiError('The coach stream ended before returning a recommendation.')
  return result
}

function parseEvent(block: string): { name: string; data: string } | null {
  let name = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  return data.length > 0 ? { name, data: data.join('\n') } : null
}

async function readError(response: Response) {
  try {
    const problem = await response.json() as { title?: string; detail?: string }
    return problem.detail ?? problem.title ?? 'The coach request could not be completed.'
  } catch {
    return 'The coach request could not be completed.'
  }
}
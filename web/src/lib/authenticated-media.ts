/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { getFreshAuthHeaders } from '@/lib/auth-session'

type MediaFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

type AuthenticatedMediaOptions = {
  fetcher?: MediaFetcher
  getAuthHeaders?: () => Promise<Record<string, string>>
  currentOrigin?: string
  signal?: AbortSignal
}

type AuthenticatedMediaObjectUrlOptions = AuthenticatedMediaOptions & {
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
}

export type ResolvedMediaObjectUrl = {
  url: string
  release: () => void
}

type SharedMediaEntry = {
  url: string
  references: number
}

const sharedMediaEntries = new Map<string, SharedMediaEntry>()
const pendingSharedMedia = new Map<string, Promise<string>>()

function currentBrowserOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

function normalizeOrigin(value: string): string {
  if (!value) return ''
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

export function isSameOriginMediaUrl(
  url: string,
  currentOrigin = currentBrowserOrigin()
): boolean {
  if (/^(?:data|blob):/i.test(url)) return false
  const origin = normalizeOrigin(currentOrigin)
  if (!origin) return !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)

  try {
    return new URL(url, origin).origin === origin
  } catch {
    return false
  }
}

export async function fetchAuthenticatedMedia(
  url: string,
  options: AuthenticatedMediaOptions = {}
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch
  const currentOrigin = options.currentOrigin ?? currentBrowserOrigin()
  if (!isSameOriginMediaUrl(url, currentOrigin)) {
    return fetcher(url, { signal: options.signal })
  }

  const headers = await (options.getAuthHeaders ?? getFreshAuthHeaders)()
  return fetcher(url, {
    credentials: 'include',
    headers,
    signal: options.signal,
  })
}

export async function resolveAuthenticatedMediaObjectUrl(
  url: string,
  options: AuthenticatedMediaObjectUrlOptions = {}
): Promise<ResolvedMediaObjectUrl> {
  const currentOrigin = options.currentOrigin ?? currentBrowserOrigin()
  if (!isSameOriginMediaUrl(url, currentOrigin)) {
    return { url, release: () => undefined }
  }

  if (canShareMediaObjectUrl(options)) {
    return await resolveSharedMediaObjectUrl(url, currentOrigin, options)
  }

  const response = await fetchAuthenticatedMedia(url, options)
  if (!response.ok) {
    throw new Error(`Media request failed (HTTP ${response.status})`)
  }

  const createObjectUrl = options.createObjectUrl ?? URL.createObjectURL
  const revokeObjectUrl = options.revokeObjectUrl ?? URL.revokeObjectURL
  const objectUrl = createObjectUrl(await response.blob())
  return {
    url: objectUrl,
    release: () => revokeObjectUrl(objectUrl),
  }
}

function canShareMediaObjectUrl(options: AuthenticatedMediaObjectUrlOptions) {
  return !(
    options.fetcher ||
    options.getAuthHeaders ||
    options.createObjectUrl ||
    options.revokeObjectUrl
  )
}

async function resolveSharedMediaObjectUrl(
  url: string,
  currentOrigin: string,
  options: AuthenticatedMediaObjectUrlOptions
): Promise<ResolvedMediaObjectUrl> {
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const cacheKey = `${normalizeOrigin(currentOrigin)}\n${url}`
  const objectUrl = await getSharedMediaObjectUrl(cacheKey, url)
  const entry = sharedMediaEntries.get(cacheKey)
  if (!entry || entry.url !== objectUrl) {
    throw new Error('Media cache entry missing')
  }
  entry.references += 1
  let released = false
  const release = () => {
    if (released) return
    released = true
    releaseSharedMediaObjectUrl(cacheKey)
  }
  if (options.signal?.aborted) {
    release()
    throw new DOMException('Aborted', 'AbortError')
  }
  return {
    url: objectUrl,
    release,
  }
}

async function getSharedMediaObjectUrl(
  cacheKey: string,
  url: string
): Promise<string> {
  const cached = sharedMediaEntries.get(cacheKey)
  if (cached) return cached.url

  let pending = pendingSharedMedia.get(cacheKey)
  if (!pending) {
    pending = fetchAuthenticatedMedia(url, { signal: undefined })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Media request failed (HTTP ${response.status})`)
        }
        const objectUrl = URL.createObjectURL(await response.blob())
        sharedMediaEntries.set(cacheKey, { url: objectUrl, references: 0 })
        return objectUrl
      })
      .finally(() => {
        pendingSharedMedia.delete(cacheKey)
      })
    pendingSharedMedia.set(cacheKey, pending)
  }
  return await pending
}

function releaseSharedMediaObjectUrl(cacheKey: string) {
  const entry = sharedMediaEntries.get(cacheKey)
  if (!entry) return
  entry.references -= 1
  if (entry.references > 0) return
  queueMicrotask(() => {
    const current = sharedMediaEntries.get(cacheKey)
    if (current !== entry || current.references > 0) return
    sharedMediaEntries.delete(cacheKey)
    URL.revokeObjectURL(entry.url)
  })
}

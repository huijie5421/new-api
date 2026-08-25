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
import {
  fetchAuthenticatedMedia,
  isSameOriginMediaUrl,
} from '@/lib/authenticated-media'

type ReferenceMediaFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

type ResolveReferenceMediaOptions = {
  fetcher?: ReferenceMediaFetcher
  encodeBlob?: (blob: Blob) => Promise<string>
  getAuthHeaders?: () => Promise<Record<string, string>>
  currentOrigin?: string
}

export async function resolveReferenceMediaUrl(
  url: string,
  options: ResolveReferenceMediaOptions = {}
): Promise<string> {
  const normalizedUrl = url.trim()
  if (!normalizedUrl) {
    throw new Error('参考素材链接为空')
  }
  if (normalizedUrl.startsWith('data:')) {
    return normalizedUrl
  }

  const currentOrigin =
    options.currentOrigin ??
    (typeof window === 'undefined' ? '' : window.location.origin)
  if (
    /^https?:\/\//i.test(normalizedUrl) &&
    !isSameOriginMediaUrl(normalizedUrl, currentOrigin)
  ) {
    return normalizedUrl
  }

  const response = await fetchAuthenticatedMedia(normalizedUrl, {
    fetcher: options.fetcher,
    getAuthHeaders: options.getAuthHeaders,
    currentOrigin,
  })
  if (!response.ok) {
    throw new Error(`参考素材读取失败（HTTP ${response.status}）`)
  }
  return await (options.encodeBlob ?? blobToDataUrl)(await response.blob())
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      'load',
      () => resolve(typeof reader.result === 'string' ? reader.result : ''),
      { once: true }
    )
    reader.addEventListener(
      'error',
      () => reject(reader.error ?? new Error('参考素材读取失败')),
      { once: true }
    )
    reader.readAsDataURL(blob)
  })
}

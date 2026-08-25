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
import { Zip, ZipPassThrough } from 'fflate'

import {
  fetchAuthenticatedMedia,
  isSameOriginMediaUrl,
} from '@/lib/authenticated-media'

import type { WorkshopResult } from './types'

type AssetFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export type WorkshopArchiveProgress = {
  completed: number
  total: number
}

export type WorkshopArchiveResult = {
  blob: Blob
  downloaded: number
  skipped: number
}

function contentTypeExtension(contentType?: string | null): string | undefined {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase()
  const extensions: Record<string, string> = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  }
  return mime ? extensions[mime] : undefined
}

function urlExtension(url: string): string | undefined {
  try {
    const pathname = new URL(url, window.location.href).pathname
    const filename = pathname.split('/').pop() ?? ''
    return /\.([a-z0-9]{2,8})$/i.exec(filename)?.[1]?.toLowerCase()
  } catch {
    return undefined
  }
}

function dataUrlContentType(url: string): string | undefined {
  return /^data:([^;,]+)/i.exec(url)?.[1]
}

export function sanitizeDownloadName(name: string): string {
  const normalized = name
    .replaceAll(/[\\/:*?"<>|]+/g, '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
  return normalized || 'aigc-asset'
}

export function workshopDownloadName(
  result: WorkshopResult,
  contentType?: string | null
): string {
  const baseName = sanitizeDownloadName(result.title)
  if (/\.[a-z0-9]{2,8}$/i.test(baseName)) {
    return baseName
  }

  const extension =
    contentTypeExtension(contentType) ??
    contentTypeExtension(
      result.url ? dataUrlContentType(result.url) : undefined
    ) ??
    (result.url ? urlExtension(result.url) : undefined) ??
    (result.type === 'video' ? 'mp4' : 'png')
  return `${baseName}.${extension}`
}

function uniqueArchiveEntryName(
  filename: string,
  usedNames: Set<string>
): string {
  const normalized = filename.toLowerCase()
  if (!usedNames.has(normalized)) {
    usedNames.add(normalized)
    return filename
  }

  const extensionMatch = /^(.*?)(\.[a-z0-9]{2,8})$/i.exec(filename)
  const stem = extensionMatch?.[1] ?? filename
  const extension = extensionMatch?.[2] ?? ''
  let index = 2
  let candidate = `${stem} (${index})${extension}`
  while (usedNames.has(candidate.toLowerCase())) {
    index += 1
    candidate = `${stem} (${index})${extension}`
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

function triggerWorkshopDownload(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function fetchWorkshopAsset(
  result: WorkshopResult,
  fetcher: AssetFetcher,
  getAuthHeaders?: () => Promise<Record<string, string>>
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  if (!result.url) {
    throw new Error(`素材“${result.title}”没有下载地址`)
  }
  const response = await fetchAuthenticatedMedia(result.url, {
    fetcher,
    getAuthHeaders,
  })
  if (!response.ok) {
    throw new Error(`素材“${result.title}”下载失败`)
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  }
}

export async function createWorkshopArchiveBlob(
  results: WorkshopResult[],
  onProgress?: (progress: WorkshopArchiveProgress) => void,
  fetcher: AssetFetcher = fetch,
  getAuthHeaders?: () => Promise<Record<string, string>>
): Promise<WorkshopArchiveResult> {
  const downloadable = results.filter(
    (result) => result.status === 'succeeded' && result.url
  )
  if (downloadable.length === 0) {
    throw new Error('所选素材中没有可下载内容')
  }

  return await new Promise<WorkshopArchiveResult>((resolve, reject) => {
    const chunks: ArrayBuffer[] = []
    const usedNames = new Set<string>()
    let settled = false
    const archive = new Zip((error, chunk, final) => {
      if (settled) return
      if (error) {
        settled = true
        reject(error)
        return
      }
      const chunkBuffer = new ArrayBuffer(chunk.byteLength)
      new Uint8Array(chunkBuffer).set(chunk)
      chunks.push(chunkBuffer)
      if (final) {
        settled = true
        resolve({
          blob: new Blob(chunks, { type: 'application/zip' }),
          downloaded: downloadable.length,
          skipped: results.length - downloadable.length,
        })
      }
    })

    void (async () => {
      try {
        for (const [index, result] of downloadable.entries()) {
          const asset = await fetchWorkshopAsset(
            result,
            fetcher,
            getAuthHeaders
          )
          const filename = uniqueArchiveEntryName(
            workshopDownloadName(result, asset.contentType),
            usedNames
          )
          const file = new ZipPassThrough(filename)
          if (Number.isFinite(result.createdAt)) {
            file.mtime = new Date(result.createdAt)
          }
          archive.add(file)
          file.push(asset.bytes, true)
          onProgress?.({ completed: index + 1, total: downloadable.length })
        }
        archive.end()
      } catch (error) {
        archive.terminate()
        if (!settled) {
          settled = true
          reject(error)
        }
      }
    })()
  })
}

function workshopArchiveName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
  return `aigc-assets-${stamp}.zip`
}

export async function downloadWorkshopResultsAsZip(
  results: WorkshopResult[],
  onProgress?: (progress: WorkshopArchiveProgress) => void
): Promise<Omit<WorkshopArchiveResult, 'blob'>> {
  const archive = await createWorkshopArchiveBlob(results, onProgress)
  const objectUrl = URL.createObjectURL(archive.blob)
  try {
    triggerWorkshopDownload(objectUrl, workshopArchiveName())
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
  return { downloaded: archive.downloaded, skipped: archive.skipped }
}

export async function downloadWorkshopResult(
  result: WorkshopResult
): Promise<void> {
  if (!result.url) {
    throw new Error('素材链接为空')
  }

  if (result.url.startsWith('data:') || result.url.startsWith('blob:')) {
    triggerWorkshopDownload(result.url, workshopDownloadName(result))
    return
  }

  const sameOrigin = isSameOriginMediaUrl(result.url)
  try {
    const response = await fetchAuthenticatedMedia(result.url)
    if (!response.ok) {
      throw new Error('素材下载失败')
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      triggerWorkshopDownload(
        objectUrl,
        workshopDownloadName(result, response.headers.get('content-type'))
      )
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
  } catch (error: unknown) {
    if (sameOrigin) throw error
    triggerWorkshopDownload(result.url, workshopDownloadName(result))
  }
}

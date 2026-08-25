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
import { api } from '@/lib/api'
import {
  fetchAuthenticatedMedia,
  isSameOriginMediaUrl,
} from '@/lib/authenticated-media'

type AigcReferenceFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export type AigcReferenceKind = 'image' | 'video' | 'audio'

export type AigcReferenceSource = {
  kind: AigcReferenceKind
  name: string
  url?: string
  blob?: Blob | null
}

type UploadedAigcReferenceAsset = {
  url: string
  kind: AigcReferenceKind
  mime_type: string
  bytes: number
  expires_at: number
}

type AigcReferenceUploadResponse = {
  success: boolean
  message?: string
  data?: {
    assets?: UploadedAigcReferenceAsset[]
  }
}

const AIGC_REFERENCE_UPLOAD_BATCH_BYTES = 80 * 1024 * 1024

export type AigcReferenceAssetDependencies = {
  currentOrigin?: string
  fetcher?: AigcReferenceFetcher
  getAuthHeaders?: () => Promise<Record<string, string>>
  loadBlob?: (url: string) => Promise<Blob>
  upload?: (
    sources: ReadonlyArray<{
      kind: AigcReferenceKind
      name: string
      blob: Blob
    }>
  ) => Promise<string[]>
}

export function isPublicAigcReferenceUrl(value?: string): value is string {
  try {
    const parsed = new URL(value?.trim() ?? '')
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname)
    )
  } catch {
    return false
  }
}

export async function ensurePublicAigcReferenceUrls(
  sources: readonly AigcReferenceSource[],
  dependencies: AigcReferenceAssetDependencies = {}
): Promise<string[]> {
  const loadBlob =
    dependencies.loadBlob ??
    ((url: string) => loadAigcReferenceBlob(url, dependencies))
  const upload = dependencies.upload ?? uploadAigcReferenceAssets
  const currentOrigin =
    dependencies.currentOrigin ??
    (typeof window === 'undefined' ? '' : window.location.origin)
  const resolved = Array.from({ length: sources.length }, () => '')
  const localSources: Array<{
    sourceIndex: number
    kind: AigcReferenceKind
    name: string
    blob: Blob
  }> = []
  const pendingBlobs = new Map<string, Promise<Blob>>()

  await Promise.all(
    sources.map(async (source, sourceIndex) => {
      const sourceUrl = source.url?.trim() ?? ''
      if (canPassAigcReferenceUrlThrough(sourceUrl, currentOrigin)) {
        resolved[sourceIndex] = sourceUrl
        return
      }

      let blob = source.blob ?? undefined
      if (!blob) {
        if (!sourceUrl) {
          throw new Error(`参考素材 ${source.name} 缺少可读取的文件`)
        }
        let pending = pendingBlobs.get(sourceUrl)
        if (!pending) {
          pending = loadBlob(sourceUrl)
          pendingBlobs.set(sourceUrl, pending)
        }
        blob = await pending
      }
      if (blob.size <= 0) {
        throw new Error(`参考素材 ${source.name} 为空文件`)
      }
      localSources.push({
        sourceIndex,
        kind: source.kind,
        name: source.name,
        blob,
      })
    })
  )

  if (localSources.length > 0) {
    localSources.sort((left, right) => left.sourceIndex - right.sourceIndex)
    const uploadedUrls = await upload(localSources)
    if (uploadedUrls.length !== localSources.length) {
      throw new Error('参考素材上传结果数量不一致')
    }
    uploadedUrls.forEach((url, uploadIndex) => {
      if (!isPublicAigcReferenceUrl(url)) {
        throw new Error('参考素材上传后未返回公网 HTTP(S) 地址')
      }
      resolved[localSources[uploadIndex].sourceIndex] = url.trim()
    })
  }

  if (resolved.some((url) => !isPublicAigcReferenceUrl(url))) {
    throw new Error('部分参考素材未转换为公网 HTTP(S) 地址')
  }
  return resolved
}

function canPassAigcReferenceUrlThrough(
  value: string,
  currentOrigin: string
): boolean {
  if (!isPublicAigcReferenceUrl(value) || !currentOrigin) {
    return isPublicAigcReferenceUrl(value)
  }
  const parsed = new URL(value)
  if (!isSameOriginMediaUrl(value, currentOrigin)) {
    return true
  }
  return parsed.pathname.includes('/api/aigc/reference-assets/')
}

async function loadAigcReferenceBlob(
  url: string,
  dependencies: Pick<
    AigcReferenceAssetDependencies,
    'currentOrigin' | 'fetcher' | 'getAuthHeaders'
  >
): Promise<Blob> {
  let response: Response
  try {
    response = await fetchAuthenticatedMedia(url, {
      currentOrigin: dependencies.currentOrigin,
      fetcher: dependencies.fetcher,
      getAuthHeaders: dependencies.getAuthHeaders,
    })
  } catch {
    throw new Error('参考素材读取失败，请重新选择后再试')
  }
  if (!response.ok) {
    throw new Error(`参考素材读取失败（HTTP ${response.status}）`)
  }
  return response.blob()
}

async function uploadAigcReferenceAssets(
  sources: ReadonlyArray<{
    kind: AigcReferenceKind
    name: string
    blob: Blob
  }>
): Promise<string[]> {
  const uploadedUrls: string[] = []
  let batch: typeof sources = []
  let batchBytes = 0
  for (const source of sources) {
    if (
      batch.length > 0 &&
      batchBytes + source.blob.size > AIGC_REFERENCE_UPLOAD_BATCH_BYTES
    ) {
      uploadedUrls.push(...(await uploadAigcReferenceAssetBatch(batch)))
      batch = []
      batchBytes = 0
    }
    batch = [...batch, source]
    batchBytes += source.blob.size
  }
  if (batch.length > 0) {
    uploadedUrls.push(...(await uploadAigcReferenceAssetBatch(batch)))
  }
  return uploadedUrls
}

async function uploadAigcReferenceAssetBatch(
  sources: ReadonlyArray<{
    kind: AigcReferenceKind
    name: string
    blob: Blob
  }>
): Promise<string[]> {
  const form = new FormData()
  sources.forEach((source) => {
    form.append('kind', source.kind)
    form.append('file', source.blob, source.name || `${source.kind}-reference`)
  })
  const response = await api.post<AigcReferenceUploadResponse>(
    '/api/aigc/reference-assets',
    form,
    { skipBusinessError: true }
  )
  const body = response.data
  if (!body.success) {
    throw new Error(body.message || '参考素材上传失败')
  }
  const assets = body.data?.assets ?? []
  if (assets.length !== sources.length) {
    throw new Error('参考素材上传结果数量不一致')
  }
  if (assets.some((asset, index) => asset.kind !== sources[index].kind)) {
    throw new Error('参考素材上传结果类型或顺序不一致')
  }
  return assets.map((asset) => asset.url)
}

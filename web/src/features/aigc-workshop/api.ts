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

import type {
  AigcAssetsResponse,
  AigcAsset,
  AigcEstimatePayload,
  AigcEstimateResponse,
  AigcAssetType,
  AigcWorkshopModelsResponse,
  ChatCompletionPayload,
  ChatCompletionResponse,
  ImageGenerationPayload,
  ImageGenerationResponse,
  VideoGenerationPayload,
  VideoGenerationResponse,
} from './types'

const AIGC_GROUP_HEADER = 'X-AIGC-Group'

export async function generateChatCompletion(
  payload: ChatCompletionPayload,
  group?: string
): Promise<ChatCompletionResponse> {
  const res = await api.post('/api/aigc/chat/completions', payload, {
    skipBusinessError: true,
    headers: aigcGroupHeaders(group),
  })
  return res.data as ChatCompletionResponse
}

export async function generateImage(
  payload: ImageGenerationPayload,
  group?: string
): Promise<ImageGenerationResponse> {
  const responses = await submitImageGenerationBatch(payload, group)
  const completedResponses = await Promise.all(
    responses.map(async (response) => {
      if (response.error?.message) {
        return response
      }
      const taskId = response.task_id ?? response.id
      if (!taskId || response.data) {
        return response
      }
      try {
        return await waitForImageGeneration(taskId)
      } catch (error) {
        return imageGenerationErrorResponse(error)
      }
    })
  )

  const data = completedResponses.flatMap((response) => response.data ?? [])
  if (data.length === 0) {
    const message = completedResponses.find(
      (response) => response.error?.message
    )?.error?.message
    throw new Error(message || '图片生成请求失败')
  }

  const firstResponse =
    completedResponses.find((response) => !response.error?.message) ?? {}
  return {
    ...firstResponse,
    created: completedResponses.find((response) => response.created)?.created,
    data,
  }
}

async function postImageGeneration(
  payload: ImageGenerationPayload,
  group?: string
): Promise<ImageGenerationResponse> {
  const res = await api.post('/api/aigc/images/generations', payload, {
    skipBusinessError: true,
    headers: aigcGroupHeaders(group),
  })
  return res.data as ImageGenerationResponse
}

/** Submit one single-image request for every requested output. */
export async function submitImageGenerationBatch(
  payload: ImageGenerationPayload,
  group?: string
): Promise<ImageGenerationResponse[]> {
  const count = normalizeImageRequestCount(payload.n)
  const singleImagePayload = { ...payload, n: 1 }
  const requests = await Promise.allSettled(
    Array.from({ length: count }, () =>
      postImageGeneration({ ...singleImagePayload }, group)
    )
  )
  return requests.map((request) =>
    request.status === 'fulfilled'
      ? request.value
      : imageGenerationErrorResponse(request.reason)
  )
}

export async function fetchImageGenerationTask(
  taskId: string
): Promise<ImageGenerationResponse> {
  const res = await api.get(`/api/aigc/images/generations/${taskId}`, {
    skipBusinessError: true,
    disableDuplicate: true,
  })
  return res.data as ImageGenerationResponse
}

export async function waitForImageGeneration(
  taskId: string,
  maxAttempts = 180
): Promise<ImageGenerationResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchImageGenerationTask(taskId)
    if (response.status === 'succeeded' || response.status === 'failed') {
      return response
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('图片生成任务等待超时')
}

export async function generateVideo(
  payload: VideoGenerationPayload,
  group?: string
): Promise<VideoGenerationResponse> {
  const res = await api.post('/api/aigc/video/generations', payload, {
    skipBusinessError: true,
    headers: aigcGroupHeaders(group),
  })
  return res.data as VideoGenerationResponse
}

export async function fetchVideoTask(
  taskId: string
): Promise<VideoGenerationResponse> {
  const res = await api.get(`/api/aigc/video/generations/${taskId}`, {
    skipBusinessError: true,
    disableDuplicate: true,
  })
  return res.data as VideoGenerationResponse
}

export async function fetchAigcWorkshopModels(): Promise<AigcWorkshopModelsResponse> {
  const res = await api.get('/api/aigc/models')
  return res.data as AigcWorkshopModelsResponse
}

export async function fetchAigcEstimate(
  payload: AigcEstimatePayload
): Promise<AigcEstimateResponse> {
  const res = await api.post('/api/aigc/estimate', payload, {
    skipBusinessError: true,
    headers: aigcGroupHeaders(payload.group),
  })
  return res.data as AigcEstimateResponse
}

export async function fetchAigcAssets(
  type: AigcAssetType
): Promise<AigcAssetsResponse> {
  const res = await api.get('/api/aigc/assets', {
    params: {
      type,
      p: 1,
      page_size: 24,
    },
    timeout: 20_000,
  })
  return normalizeAigcAssetsResponse(res.data)
}

export async function deleteAigcAsset(assetId: string): Promise<void> {
  await api.delete(`/api/aigc/assets/${assetId}`)
}

export async function batchDeleteAigcAssets(assetIds: string[]): Promise<void> {
  await api.post('/api/aigc/assets/batch', {
    action: 'delete',
    ids: assetIds,
  })
}

function normalizeAigcAssetsResponse(raw: unknown): AigcAssetsResponse {
  if (!raw || typeof raw !== 'object') {
    return { success: false, message: '资料库响应为空' }
  }

  const response = raw as AigcAssetsResponse & {
    data?: {
      page?: number
      page_size?: number
      total?: number
      items?: AigcAsset[]
      Page?: number
      PageSize?: number
      Total?: number
      Items?: AigcAsset[]
    }
  }
  const data = response.data
  if (!data) {
    return response as AigcAssetsResponse
  }

  return {
    success: response.success,
    message: response.message,
    data: {
      page: data.page ?? data.Page ?? 1,
      page_size: data.page_size ?? data.PageSize ?? 24,
      total: data.total ?? data.Total ?? 0,
      items: data.items ?? data.Items ?? [],
    },
  }
}

function aigcGroupHeaders(group?: string): Record<string, string> | undefined {
  if (!group) {
    return undefined
  }
  return { [AIGC_GROUP_HEADER]: `uri:${encodeURIComponent(group)}` }
}

function normalizeImageRequestCount(value: number | undefined): number {
  const count = Number.isFinite(value) ? Math.trunc(value as number) : 1
  return Math.max(1, Math.min(10, count))
}

function imageGenerationErrorResponse(error: unknown): ImageGenerationResponse {
  return {
    status: 'failed',
    error: {
      message: error instanceof Error ? error.message : '图片生成请求失败',
    },
  }
}

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
export type WorkshopModule = 'image' | 'video' | 'commerce'

export type WorkshopResultType = 'image' | 'video'

export type WorkshopResultStatus = 'succeeded' | 'processing' | 'failed'

export type WorkshopResult = {
  id: string
  type: WorkshopResultType
  status: WorkshopResultStatus
  title: string
  prompt: string
  createdAt: number
  url?: string
  taskId?: string
  meta?: string
}

export type ImageGenerationPayload = {
  model: string
  prompt: string
  n: number
  size: string
  quality?: string
  seed?: number
  response_format: 'url'
}

export type AigcModelOption = {
  model: string
  group: string
  label: string
  resolution?: string
  fixed_seconds?: boolean
  fixed_duration_seconds?: number
  group_ratio: number
}

export type AigcWorkshopModels = {
  image: AigcModelOption[]
  video: AigcModelOption[]
  text: AigcModelOption[]
}

export type AigcWorkshopModelsResponse = {
  success: boolean
  message?: string
  data?: AigcWorkshopModels
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatCompletionPayload = {
  model: string
  messages: ChatMessage[]
  temperature?: number
  stream?: false
}

export type ChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string
    }
  }[]
  error?: {
    message?: string
  }
}

export type ImageGenerationResponse = {
  created?: number
  data?: {
    url?: string
    b64_json?: string
    revised_prompt?: string
  }[]
  error?: {
    message?: string
  }
}

export type VideoGenerationPayload = {
  model: string
  prompt: string
  seconds: string
  seed?: number
  input_reference?: string
}

export type VideoGenerationResponse = {
  id?: string
  task_id?: string
  status?: string
  url?: string
  video_url?: string
  error?: {
    message?: string
  }
}

export type CommerceScene = {
  id: string
  titleKey: string
  promptKey: string
}

export type AigcAssetType = 'all' | 'image' | 'video'

export type AigcAsset = {
  id: string
  type: WorkshopResultType
  status: string
  title: string
  prompt: string
  model: string
  url?: string
  task_id?: string
  quota: number
  created_at: number
  meta?: string
}

export type AigcAssetsPage = {
  page: number
  page_size: number
  total: number
  items: AigcAsset[]
}

export type AigcAssetsResponse = {
  success: boolean
  message?: string
  data?: AigcAssetsPage
}

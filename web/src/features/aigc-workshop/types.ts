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

export type ImageQuality = 'auto' | 'low' | 'medium' | 'high'
export type ImageBackground = 'auto' | 'transparent' | 'opaque'
export type ImageModeration = 'auto' | 'low'
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'

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
  quality?: ImageQuality
  background?: ImageBackground
  moderation?: ImageModeration
  output_format?: ImageOutputFormat
  output_compression?: number
  image?: string
  images?: string[]
  mask?: string
}

export type AigcModelOption = {
  model: string
  group: string
  label: string
  resolution?: string
  duration_controlled?: boolean
  fixed_seconds?: boolean
  fixed_price?: boolean
  fixed_duration_seconds?: number
  max_duration_seconds?: number
  required_image_count?: number
  max_reference_images?: number
  max_reference_videos?: number
  max_reference_audios?: number
  max_reference_video_duration_seconds?: number
  video_references_disabled?: boolean
  audio_references_disabled?: boolean
  group_ratio: number
  quota_type: number
  billing_mode: string
  price_unit:
    | 'dynamic'
    | 'fixed_total'
    | 'per_request'
    | 'per_second'
    | 'per_million_tokens'
  unit_price: number
  input_price: number
  output_price: number
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

export type AigcEstimatePayload = {
  module: 'image' | 'video'
  model: string
  group?: string
  prompt: string
  n?: number
  count?: number
  size?: string
  aspect_ratio?: string
  resolution?: string
  quality?: string
  seconds?: string
  mySeconds?: string
  input_reference?: string
  reference_image_urls?: string[]
  reference_videos?: string[]
  reference_audios?: string[]
}

export type AigcEstimateData = {
  module: 'image' | 'video'
  model: string
  group: string
  quota: number
  count: number
}

export type AigcEstimateResponse = {
  success: boolean
  message?: string
  data?: AigcEstimateData
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
  tools?: unknown[]
  tool_choice?: unknown
  parallel_tool_calls?: boolean
}

export type ChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string
      tool_calls?: {
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }[]
    }
  }[]
  error?: {
    message?: string
  }
}

export type ImageGenerationResponse = {
  id?: string
  task_id?: string
  status?: 'processing' | 'succeeded' | 'failed'
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
  aspect_ratio?: string
  resolution?: string
  size?: string
  mySeconds?: string
  input_reference?: string
  reference_image_urls?: string[]
  reference_videos?: string[]
  reference_audios?: string[]
  bypass_face_check?: boolean
  grid_strength?: number
  persist?: boolean
}

export type VideoGenerationResponse = {
  id?: string
  task_id?: string
  status?: string
  url?: string
  video_url?: string
  result_url?: string
  metadata?: {
    url?: string
  }
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

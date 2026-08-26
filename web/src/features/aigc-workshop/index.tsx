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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import {
  Bot,
  Check,
  ChevronDownIcon,
  ClipboardList,
  Copy,
  Download,
  FileAudio,
  FileImage,
  Film,
  GripVertical,
  ImageIcon,
  Images,
  Layers3,
  Library,
  ListChecks,
  Loader2,
  MessageSquare,
  Package,
  Play,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
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
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatQuota } from '@/lib/format'
import { resolveReferenceMediaUrl } from '@/lib/reference-media'
import { SEEDANCE_REFERENCE_LIMITS } from '@/lib/seedance-video'
import { cn } from '@/lib/utils'
import { ensurePublicAigcReferenceUrls } from '@/services/aigc-reference-assets'

import {
  batchDeleteAigcAssets,
  deleteAigcAsset,
  fetchAigcEstimate,
  fetchAigcWorkshopModels,
  fetchAigcAssets,
  fetchVideoTask,
  generateChatCompletion,
  generateVideo,
  submitImageGenerationBatch,
  waitForImageGeneration,
} from './api'
import {
  downloadWorkshopResult,
  downloadWorkshopResultsAsZip,
  type WorkshopArchiveProgress,
} from './asset-download'
import { AuthenticatedAssetImage } from './components/authenticated-asset-image'
import { AuthenticatedAssetVideo } from './components/authenticated-asset-video'
import {
  AigcWorkspaceDock,
  type AigcWorkspaceDockValue,
} from './components/workspace-dock'
import {
  COMMERCE_SCENES,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTION_LEVELS,
  WORKSHOP_MODULES,
} from './constants'
import {
  boundWorkshopResults,
  collectWorkshopLiveUrls,
  createImageObjectUrl,
  createWorkshopObjectUrlOwner,
} from './result-memory'
import type {
  AigcAsset,
  AigcAssetType,
  AigcModelOption,
  ChatMessage,
  CommerceScene,
  ImageBackground,
  ImageGenerationPayload,
  ImageGenerationResponse,
  ImageModeration,
  ImageOutputFormat,
  ImageQuality,
  VideoGenerationPayload,
  VideoGenerationResponse,
  WorkshopModule,
  WorkshopResult,
  WorkshopResultStatus,
} from './types'

type ImageAspectRatioValue = (typeof IMAGE_ASPECT_RATIOS)[number]['value']
type ImageResolutionValue = (typeof IMAGE_RESOLUTION_LEVELS)[number]['value']
type VideoAspectRatio = '16:9' | '9:16'
type CommerceQueueStatus = 'pending' | 'running' | 'succeeded' | 'failed'
type AigcWorkspace = 'studio' | 'canvas' | 'prompts' | 'assets'
type ChipSelectOption = { value: string; label: string }
type AigcWorkshopProps = {
  initialWorkspace?: AigcWorkspace
  initialCanvasId?: string
}

type LocalMaterial = {
  id: string
  name: string
  type: 'image' | 'video'
  url: string
  source: 'upload' | 'generated'
  createdAt: number
}

type ImageReferenceAsset = {
  id: string
  name: string
  url: string
  size?: number
}

type VideoReferenceKind = 'image' | 'video' | 'audio'

type VideoReferenceAsset = {
  id: string
  name: string
  kind: VideoReferenceKind
  url: string
  size?: number
  durationMs?: number
}

type CommerceQueueItem = {
  id: string
  sceneId: string
  title: string
  prompt: string
  status: CommerceQueueStatus
  resultCount?: number
  error?: string
}

const MODULE_ICON = {
  image: ImageIcon,
  video: Film,
  commerce: Layers3,
} satisfies Record<WorkshopModule, typeof ImageIcon>

const VIDEO_SECONDS_MIN = 5
const VIDEO_SECONDS_DEFAULT_MAX = 15
const VIDEO_SECONDS_MAX = 30
const CUSTOM_IMAGE_SIZE_MIN = 256
const CUSTOM_IMAGE_SIZE_MAX = 3840
const CUSTOM_IMAGE_SIZE_STEP = 16
const IMAGE_REFERENCE_LIMIT = 9
const IMAGE_GENERATION_MAX_COUNT = 10
const MATERIAL_COMPRESSION_THRESHOLD_BYTES = 8 * 1024 * 1024
const VIDEO_REFERENCE_LIMITS = {
  image: SEEDANCE_REFERENCE_LIMITS.images,
  video: SEEDANCE_REFERENCE_LIMITS.videos,
  audio: SEEDANCE_REFERENCE_LIMITS.audios,
  total: SEEDANCE_REFERENCE_LIMITS.total,
  imageMaxBytes: SEEDANCE_REFERENCE_LIMITS.imageMaxBytes,
  videoMaxBytes: SEEDANCE_REFERENCE_LIMITS.videoMaxBytes,
  audioMaxBytes: SEEDANCE_REFERENCE_LIMITS.audioMaxBytes,
  videoMaxDurationSeconds: 29,
} as const
const VIDEO_REFERENCE_DEFAULT_LIMITS = {
  image: 9,
  video: 3,
  audio: 3,
  videoMaxDurationSeconds: 15,
} as const
const MATERIAL_URL_MIME = 'application/x-aigc-material-url'
const MATERIAL_NAME_MIME = 'application/x-aigc-material-name'
const MATERIAL_TYPE_MIME = 'application/x-aigc-material-type'
const MODEL_OPTION_SEPARATOR = '\u001f'

function buildResultId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clampInteger(value: string, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`
  }
  return `${Math.max(1, Math.round(size / 1024))}KB`
}

function imageOutputMimeType(format: ImageOutputFormat): string {
  if (format === 'jpeg') {
    return 'image/jpeg'
  }
  if (format === 'webp') {
    return 'image/webp'
  }
  return 'image/png'
}

function isGptImage2Model(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  return (
    normalized === 'image-2' ||
    normalized === 'gpt-image-2' ||
    normalized.startsWith('gpt-image-2-')
  )
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      'load',
      () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
          return
        }
        reject(new Error('文件读取失败'))
      },
      { once: true }
    )
    reader.addEventListener(
      'error',
      () => reject(reader.error ?? new Error('文件读取失败')),
      { once: true }
    )
    reader.readAsDataURL(blob)
  })
}

function readVideoSourceDurationMs(
  source: string
): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let settled = false
    let timeout = 0
    const finish = (durationMs?: number) => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timeout)
      video.removeAttribute('src')
      video.load()
      resolve(durationMs)
    }
    timeout = window.setTimeout(() => finish(), 8_000)
    video.addEventListener(
      'loadedmetadata',
      () => {
        const durationMs = Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : undefined
        finish(durationMs)
      },
      { once: true }
    )
    video.addEventListener('error', () => finish(), { once: true })
    video.preload = 'metadata'
    video.src = source
  })
}

async function readVideoDurationMs(file: File): Promise<number | undefined> {
  const url = URL.createObjectURL(file)
  try {
    return await readVideoSourceDurationMs(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function normalizeVideoReferenceLimit(
  value: number | undefined,
  fallback: number,
  maximum: number
): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(maximum, Math.max(0, Math.trunc(value ?? fallback)))
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error('图片压缩失败'))
      },
      type,
      quality
    )
  })
}

type DecodedImage = HTMLImageElement | ImageBitmap

function decodedImageWidth(image: DecodedImage): number {
  return image instanceof HTMLImageElement ? image.naturalWidth : image.width
}

function decodedImageHeight(image: DecodedImage): number {
  return image instanceof HTMLImageElement ? image.naturalHeight : image.height
}

async function decodeImageFile(file: File): Promise<DecodedImage> {
  if ('createImageBitmap' in window) {
    return await createImageBitmap(file)
  }

  const dataUrl = await readBlobAsDataUrl(file)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.addEventListener('load', () => resolve(element), { once: true })
    element.addEventListener('error', () => reject(new Error('图片解码失败')), {
      once: true,
    })
    element.src = dataUrl
  })
  return image
}

async function compressImageFile(file: File): Promise<Blob> {
  const image = await decodeImageFile(file)
  try {
    const sourceWidth = decodedImageWidth(image)
    const sourceHeight = decodedImageHeight(image)
    const maxEdge = Math.max(sourceWidth, sourceHeight)
    let scale = Math.min(1, 2600 / maxEdge)
    let quality = 0.86
    let bestBlob: Blob | null = null

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const width = Math.max(256, Math.round(sourceWidth * scale))
      const height = Math.max(256, Math.round(sourceHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('图片压缩失败')
      }
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)

      const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      bestBlob = blob
      if (blob.size <= MATERIAL_COMPRESSION_THRESHOLD_BYTES) {
        return blob
      }

      if (quality > 0.58) {
        quality = Math.max(0.58, quality - 0.12)
      } else {
        scale *= 0.82
      }
    }

    return bestBlob ?? file
  } finally {
    if ('close' in image) {
      image.close()
    }
  }
}

function normalizeVideoStatus(
  status: string | undefined
): WorkshopResultStatus {
  if (!status) {
    return 'processing'
  }
  const normalized = status.toLowerCase()
  if (['succeeded', 'success', 'completed', 'complete'].includes(normalized)) {
    return 'succeeded'
  }
  if (['failed', 'failure', 'error', 'cancelled'].includes(normalized)) {
    return 'failed'
  }
  return 'processing'
}

function getVideoTaskId(response: VideoGenerationResponse): string | undefined {
  return response.task_id ?? response.id
}

function getVideoUrl(response: VideoGenerationResponse): string | undefined {
  return (
    response.video_url ??
    response.result_url ??
    response.url ??
    response.metadata?.url
  )
}

function getStatusVariant(
  status: WorkshopResultStatus
): 'secondary' | 'destructive' {
  if (status === 'failed') {
    return 'destructive'
  }
  return 'secondary'
}

function assetToResult(asset: AigcAsset): WorkshopResult {
  return {
    id: asset.id,
    type: asset.type,
    status: normalizeVideoStatus(asset.status),
    title: asset.title,
    prompt: asset.prompt,
    createdAt: asset.created_at * 1000,
    url: asset.url,
    taskId: asset.task_id,
    meta: asset.meta || asset.model,
  }
}

function materialReference(material: { name: string; url?: string }): string {
  if (material.url?.startsWith('http')) {
    return `参考素材：${material.name}\n${material.url}`
  }
  return `参考素材：${material.name}`
}

function modelOptionValue(option: AigcModelOption): string {
  return `${option.group}${MODEL_OPTION_SEPARATOR}${option.model}`
}

function modelOptionLabel(option: AigcModelOption, t: TFunction): string {
  const baseLabel = option.label || `${option.model} · ${option.group}`
  let durationLabel: string | undefined
  if (option.fixed_seconds && option.fixed_duration_seconds) {
    durationLabel = t('固定 {{seconds}} 秒', {
      seconds: option.fixed_duration_seconds,
    })
  } else if (option.max_duration_seconds) {
    durationLabel = t('最长 {{seconds}} 秒', {
      seconds: option.max_duration_seconds,
    })
  }
  const videoMeta = [
    option.resolution,
    durationLabel,
    option.required_image_count
      ? t('至少 {{count}} 张参考图', {
          count: option.required_image_count,
        })
      : undefined,
    option.video_references_disabled ? t('不支持参考视频') : undefined,
    option.audio_references_disabled ? t('No reference audio') : undefined,
    option.max_reference_images != null
      ? t('Up to {{images}} images / {{videos}} videos / {{audios}} audios', {
          images: option.max_reference_images,
          videos: option.max_reference_videos ?? VIDEO_REFERENCE_LIMITS.video,
          audios: option.max_reference_audios ?? VIDEO_REFERENCE_LIMITS.audio,
        })
      : undefined,
  ].filter(Boolean)
  const descriptiveLabel =
    videoMeta.length > 0 ? `${baseLabel} · ${videoMeta.join(' · ')}` : baseLabel
  const priceLabel = modelOptionPriceLabel(option, t)
  return priceLabel ? `${descriptiveLabel} · ${priceLabel}` : descriptiveLabel
}

function modelOptionPriceLabel(option: AigcModelOption, t: TFunction): string {
  if (option.billing_mode === 'tiered_expr') {
    return t('Dynamic Pricing')
  }

  const formatPrice = (price: number) =>
    formatBillingCurrencyFromUSD(price, {
      digitsLarge: 4,
      digitsSmall: 6,
      abbreviate: false,
    })
  if (option.quota_type === 1 && Number.isFinite(option.unit_price)) {
    if (option.price_unit === 'per_second') {
      return `${formatPrice(option.unit_price)}/s`
    }
    if (option.price_unit === 'fixed_total') {
      return `${t('Fixed total price')} ${formatPrice(option.unit_price)}`
    }
    return `${t('Per-call')} ${formatPrice(option.unit_price)}`
  }
  if (
    option.quota_type === 0 &&
    Number.isFinite(option.input_price) &&
    Number.isFinite(option.output_price)
  ) {
    return `${t('Input')} ${formatPrice(option.input_price)}/M · ${t('Output')} ${formatPrice(option.output_price)}/M`
  }
  return ''
}

function toChipOptions(
  options: AigcModelOption[],
  t: TFunction
): ChipSelectOption[] {
  return options.map((option) => ({
    value: modelOptionValue(option),
    label: modelOptionLabel(option, t),
  }))
}

function selectedModelOption(
  options: AigcModelOption[],
  value: string
): AigcModelOption | undefined {
  return (
    options.find((option) => modelOptionValue(option) === value) ?? options[0]
  )
}

function appendTextBlock(current: string, next: string): string {
  return [current.trim(), next.trim()].filter(Boolean).join('\n')
}

function readDraggedMaterial(
  event: DragEvent<HTMLElement>
): { name: string; url: string; type: LocalMaterial['type'] } | null {
  const url =
    event.dataTransfer.getData(MATERIAL_URL_MIME) ||
    event.dataTransfer.getData('text/uri-list') ||
    event.dataTransfer.getData('text/plain')
  if (!url) {
    return null
  }
  return {
    url,
    name: event.dataTransfer.getData(MATERIAL_NAME_MIME) || '拖拽素材',
    type:
      event.dataTransfer.getData(MATERIAL_TYPE_MIME) === 'video'
        ? 'video'
        : 'image',
  }
}

function setDraggedMaterial(
  event: DragEvent<HTMLElement>,
  material: { name: string; url?: string; type?: LocalMaterial['type'] }
): void {
  if (!material.url) {
    return
  }
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(MATERIAL_URL_MIME, material.url)
  event.dataTransfer.setData(MATERIAL_NAME_MIME, material.name)
  if (material.type) {
    event.dataTransfer.setData(MATERIAL_TYPE_MIME, material.type)
  }
  event.dataTransfer.setData('text/plain', material.url)
}

function resultToMaterials(results: WorkshopResult[]): LocalMaterial[] {
  return results
    .filter((result) => result.url)
    .map((result) => ({
      id: buildResultId('material'),
      name: result.title,
      type: result.type,
      url: result.url ?? '',
      source: 'generated',
      createdAt: Date.now(),
    }))
}

function getChatContent(response: {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}): string {
  if (response.error?.message) {
    throw new Error(response.error.message)
  }
  return response.choices?.[0]?.message?.content?.trim() ?? ''
}

export function AigcWorkshop(props: AigcWorkshopProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const imageReferenceInputRef = useRef<HTMLInputElement>(null)
  const imageMaskInputRef = useRef<HTMLInputElement>(null)
  const videoReferenceImageInputRef = useRef<HTMLInputElement>(null)
  const videoReferenceVideoInputRef = useRef<HTMLInputElement>(null)
  const videoReferenceAudioInputRef = useRef<HTMLInputElement>(null)
  const objectUrlOwnerRef = useRef<ReturnType<
    typeof createWorkshopObjectUrlOwner
  > | null>(null)
  if (!objectUrlOwnerRef.current) {
    objectUrlOwnerRef.current = createWorkshopObjectUrlOwner()
  }
  const objectUrlOwner = objectUrlOwnerRef.current
  const [activeWorkspace, setActiveWorkspace] = useState<AigcWorkspace>(
    props.initialWorkspace ?? 'studio'
  )
  const [activeModule, setActiveModule] = useState<WorkshopModule>('image')
  const [prompt, setPrompt] = useState('')
  const [debouncedPrompt, setDebouncedPrompt] = useState('')
  const [imageReferences, setImageReferences] = useState<ImageReferenceAsset[]>(
    []
  )
  const [imageMask, setImageMask] = useState<ImageReferenceAsset | null>(null)
  const [videoReferenceImages, setVideoReferenceImages] = useState<
    VideoReferenceAsset[]
  >([])
  const [videoReferenceVideos, setVideoReferenceVideos] = useState<
    VideoReferenceAsset[]
  >([])
  const [videoReferenceAudios, setVideoReferenceAudios] = useState<
    VideoReferenceAsset[]
  >([])
  const [textModel, setTextModel] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')
  const [imageRatio, setImageRatio] =
    useState<ImageAspectRatioValue>('portrait')
  const [imageResolution, setImageResolution] =
    useState<ImageResolutionValue>('1k')
  const [customImageWidth, setCustomImageWidth] = useState(1024)
  const [customImageHeight, setCustomImageHeight] = useState(1536)
  const [imageCount, setImageCount] = useState(1)
  const [imageQuality, setImageQuality] = useState<ImageQuality>('auto')
  const [imageBackground, setImageBackground] =
    useState<ImageBackground>('auto')
  const [imageModeration, setImageModeration] =
    useState<ImageModeration>('auto')
  const [imageOutputFormat, setImageOutputFormat] =
    useState<ImageOutputFormat>('png')
  const [imageOutputCompression, setImageOutputCompression] = useState(100)
  const [videoSeconds, setVideoSeconds] = useState(5)
  const [videoCount, setVideoCount] = useState(1)
  const [videoAspectRatio, setVideoAspectRatio] =
    useState<VideoAspectRatio>('16:9')
  const [videoBypassFaceCheck, setVideoBypassFaceCheck] = useState(false)
  const [videoGridStrengthEnabled, setVideoGridStrengthEnabled] =
    useState(false)
  const [videoGridStrength, setVideoGridStrength] = useState(0.2)
  const [resultTab, setResultTab] = useState<'mine' | 'template'>('mine')
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [commerceEditorOpen, setCommerceEditorOpen] = useState(false)
  const [productName] = useState('')
  const [brandTone] = useState('')
  const [commerceBrief, setCommerceBrief] = useState('')
  const [commerceChatInput, setCommerceChatInput] = useState('')
  const [commercePlan, setCommercePlan] = useState('')
  const [commerceMessages, setCommerceMessages] = useState<ChatMessage[]>([])
  const [commerceQueue, setCommerceQueue] = useState<CommerceQueueItem[]>([])
  const [materials, setMaterials] = useState<LocalMaterial[]>([])
  const [selectedScenes, setSelectedScenes] = useState<string[]>([
    'main',
    'white',
    'lifestyle',
    'detail',
  ])
  const [results, setResults] = useState<WorkshopResult[]>([])
  const [assetView, setAssetView] = useState<'session' | 'library'>(
    props.initialWorkspace === 'assets' ? 'library' : 'session'
  )
  const [assetType, setAssetType] = useState<AigcAssetType>('all')
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [batchDownloadProgress, setBatchDownloadProgress] =
    useState<WorkshopArchiveProgress | null>(null)

  useEffect(() => {
    objectUrlOwner.retainOnly(
      collectWorkshopLiveUrls([
        ...results.map((item) => item.url),
        ...materials.map((item) => item.url),
        ...imageReferences.map((item) => item.url),
        imageMask?.url,
        ...videoReferenceImages.map((item) => item.url),
        ...videoReferenceVideos.map((item) => item.url),
        ...videoReferenceAudios.map((item) => item.url),
      ])
    )
  }, [
    imageMask,
    imageReferences,
    materials,
    objectUrlOwner,
    results,
    videoReferenceAudios,
    videoReferenceImages,
    videoReferenceVideos,
  ])

  useEffect(() => () => objectUrlOwner.dispose(), [objectUrlOwner])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedPrompt(prompt.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [prompt])

  useEffect(() => {
    if (!props.initialWorkspace) {
      return
    }
    const nextWorkspace = props.initialWorkspace
    setActiveWorkspace(nextWorkspace)
    if (nextWorkspace === 'assets') {
      setAssetView('library')
    }
  }, [props.initialWorkspace])

  const { data: modelsResponse, isLoading: isLoadingModels } = useQuery({
    queryKey: ['aigc-workshop-models'],
    queryFn: fetchAigcWorkshopModels,
  })

  const {
    data: assetsResponse,
    isFetching: isFetchingAssets,
    refetch: refetchAssets,
  } = useQuery({
    queryKey: ['aigc-workshop-assets', assetType],
    queryFn: () => fetchAigcAssets(assetType),
    enabled: activeWorkspace === 'assets' || assetView === 'library',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const textModels = useMemo(
    () => modelsResponse?.data?.text ?? [],
    [modelsResponse?.data?.text]
  )
  const imageModels = useMemo(
    () =>
      (modelsResponse?.data?.image ?? []).filter((option) =>
        isGptImage2Model(option.model)
      ),
    [modelsResponse?.data?.image]
  )
  const videoModels = useMemo(
    () => modelsResponse?.data?.video ?? [],
    [modelsResponse?.data?.video]
  )
  const textModelOptions = useMemo(
    () => toChipOptions(textModels, t),
    [t, textModels]
  )
  const imageModelOptions = useMemo(
    () => toChipOptions(imageModels, t),
    [imageModels, t]
  )
  const videoModelOptions = useMemo(
    () => toChipOptions(videoModels, t),
    [t, videoModels]
  )
  const selectedTextOption = selectedModelOption(textModels, textModel)
  const selectedImageOption = selectedModelOption(imageModels, imageModel)
  const selectedVideoOption = selectedModelOption(videoModels, videoModel)
  const selectedTextModel = selectedTextOption?.model ?? ''
  const selectedImageModel = selectedImageOption?.model ?? ''
  const selectedVideoModel = selectedVideoOption?.model ?? ''
  const selectedVideoDurationControlled = Boolean(
    selectedVideoOption?.duration_controlled &&
    selectedVideoOption.max_duration_seconds
  )
  const selectedVideoMaxDuration =
    selectedVideoOption?.max_duration_seconds ?? VIDEO_SECONDS_DEFAULT_MAX
  const selectedVideoFixedDuration =
    selectedVideoOption?.fixed_seconds &&
    selectedVideoOption.fixed_duration_seconds
      ? selectedVideoOption.fixed_duration_seconds
      : undefined
  const selectedVideoEffectiveSeconds =
    selectedVideoFixedDuration ??
    (selectedVideoMaxDuration
      ? Math.min(
          selectedVideoMaxDuration,
          Math.max(
            selectedVideoDurationControlled ? 1 : VIDEO_SECONDS_MIN,
            videoSeconds
          )
        )
      : videoSeconds)
  const selectedVideoRequestSeconds = selectedVideoDurationControlled
    ? '1'
    : String(selectedVideoEffectiveSeconds)
  const selectedVideoMySeconds = selectedVideoDurationControlled
    ? String(selectedVideoEffectiveSeconds)
    : undefined
  const selectedVideoRequiredImages =
    selectedVideoOption?.required_image_count ?? 0
  const selectedVideoMaxReferenceImages = normalizeVideoReferenceLimit(
    selectedVideoOption?.max_reference_images,
    VIDEO_REFERENCE_DEFAULT_LIMITS.image,
    VIDEO_REFERENCE_LIMITS.image
  )
  const selectedVideoMaxReferenceVideos = normalizeVideoReferenceLimit(
    selectedVideoOption?.max_reference_videos,
    VIDEO_REFERENCE_DEFAULT_LIMITS.video,
    VIDEO_REFERENCE_LIMITS.video
  )
  const selectedVideoMaxReferenceAudios = normalizeVideoReferenceLimit(
    selectedVideoOption?.max_reference_audios,
    VIDEO_REFERENCE_DEFAULT_LIMITS.audio,
    VIDEO_REFERENCE_LIMITS.audio
  )
  const selectedVideoReferencesDisabled =
    selectedVideoOption?.video_references_disabled ??
    selectedVideoMaxReferenceVideos === 0
  const selectedVideoAudioReferencesDisabled =
    selectedVideoOption?.audio_references_disabled ??
    selectedVideoMaxReferenceAudios === 0
  const selectedVideoReferenceLimits = {
    image: selectedVideoMaxReferenceImages,
    video: selectedVideoReferencesDisabled
      ? 0
      : selectedVideoMaxReferenceVideos,
    audio: selectedVideoAudioReferencesDisabled
      ? 0
      : selectedVideoMaxReferenceAudios,
  } satisfies Record<VideoReferenceKind, number>
  const selectedVideoReferenceTotalLimit = Math.min(
    VIDEO_REFERENCE_LIMITS.total,
    selectedVideoReferenceLimits.image +
      selectedVideoReferenceLimits.video +
      selectedVideoReferenceLimits.audio
  )
  const selectedVideoMaxReferenceVideoDurationSeconds =
    normalizeVideoReferenceLimit(
      selectedVideoOption?.max_reference_video_duration_seconds,
      VIDEO_REFERENCE_DEFAULT_LIMITS.videoMaxDurationSeconds,
      VIDEO_REFERENCE_LIMITS.videoMaxDurationSeconds
    )
  const selectedVideoMaxReferenceVideoDurationMs =
    selectedVideoMaxReferenceVideoDurationSeconds * 1000
  const selectedVideoResolution = selectedVideoOption?.resolution
  const videoResolution = selectedVideoResolution || '720p'
  const videoSize = videoAspectRatio === '16:9' ? '1280x720' : '720x1280'

  useEffect(() => {
    if (selectedVideoFixedDuration) {
      return
    }
    setVideoSeconds((current) => {
      if (selectedVideoMaxDuration) {
        return Math.min(
          selectedVideoMaxDuration,
          Math.max(
            selectedVideoDurationControlled ? 1 : VIDEO_SECONDS_MIN,
            current
          )
        )
      }
      return Math.min(
        VIDEO_SECONDS_DEFAULT_MAX,
        Math.max(VIDEO_SECONDS_MIN, current)
      )
    })
  }, [
    selectedVideoDurationControlled,
    selectedVideoFixedDuration,
    selectedVideoMaxDuration,
  ])

  useEffect(() => {
    setVideoReferenceImages((current) =>
      current.slice(0, selectedVideoReferenceLimits.image)
    )
    setVideoReferenceVideos((current) =>
      current.slice(0, selectedVideoReferenceLimits.video)
    )
    setVideoReferenceAudios((current) =>
      current.slice(0, selectedVideoReferenceLimits.audio)
    )
  }, [
    selectedVideoReferenceLimits.audio,
    selectedVideoReferenceLimits.image,
    selectedVideoReferenceLimits.video,
  ])

  const selectedRatio =
    IMAGE_ASPECT_RATIOS.find((ratio) => ratio.value === imageRatio) ??
    IMAGE_ASPECT_RATIOS[1]
  const selectedResolution =
    IMAGE_RESOLUTION_LEVELS.find((level) => level.value === imageResolution) ??
    IMAGE_RESOLUTION_LEVELS[0]
  let computedImageSize: string =
    selectedRatio.sizeByResolution[imageResolution]
  if (imageRatio === 'auto') {
    computedImageSize = 'auto'
  } else if (imageRatio === 'custom') {
    computedImageSize = `${customImageWidth}x${customImageHeight}`
  }
  const imageSizeMeta =
    imageRatio === 'auto'
      ? t('Auto')
      : `${t(selectedResolution.labelKey)} · ${computedImageSize}`
  const imageMeta = `${t(selectedRatio.labelKey)} · ${imageSizeMeta} · ${imageQuality} · ${imageOutputFormat}`
  const videoReferenceTotal =
    videoReferenceImages.length +
    videoReferenceVideos.length +
    videoReferenceAudios.length
  const estimateRequest = useMemo(() => {
    if (!debouncedPrompt) {
      return null
    }
    if (activeModule === 'image') {
      if (!selectedImageModel) {
        return null
      }
      return {
        module: 'image' as const,
        model: selectedImageModel,
        group: selectedImageOption?.group,
        prompt: debouncedPrompt,
        n: 1,
        count: 1,
        size: computedImageSize,
        quality: imageQuality,
      }
    }
    if (activeModule === 'video') {
      if (
        !selectedVideoModel ||
        videoReferenceImages.length < selectedVideoRequiredImages
      ) {
        return null
      }
      return {
        module: 'video' as const,
        model: selectedVideoModel,
        group: selectedVideoOption?.group,
        prompt: debouncedPrompt,
        count: videoCount,
        size: videoSize,
        aspect_ratio: videoAspectRatio,
        resolution: videoResolution,
        seconds: selectedVideoRequestSeconds,
        mySeconds: selectedVideoMySeconds,
        input_reference:
          videoReferenceImages.length > 0 ? 'reference-image-1' : undefined,
        reference_image_urls:
          videoReferenceImages.length > 0
            ? Array.from(
                { length: videoReferenceImages.length },
                (_, index) => `reference-image-${index + 1}`
              )
            : undefined,
        reference_videos:
          !selectedVideoReferencesDisabled && videoReferenceVideos.length > 0
            ? Array.from(
                { length: videoReferenceVideos.length },
                (_, index) => `reference-video-${index + 1}`
              )
            : undefined,
        reference_audios:
          !selectedVideoAudioReferencesDisabled &&
          videoReferenceAudios.length > 0
            ? Array.from(
                { length: videoReferenceAudios.length },
                (_, index) => `reference-audio-${index + 1}`
              )
            : undefined,
      }
    }
    return null
  }, [
    activeModule,
    computedImageSize,
    debouncedPrompt,
    imageQuality,
    selectedImageModel,
    selectedImageOption?.group,
    selectedVideoMySeconds,
    selectedVideoAudioReferencesDisabled,
    selectedVideoReferencesDisabled,
    selectedVideoRequestSeconds,
    selectedVideoRequiredImages,
    selectedVideoModel,
    selectedVideoOption?.group,
    videoCount,
    videoAspectRatio,
    videoResolution,
    videoSize,
    videoReferenceAudios.length,
    videoReferenceImages.length,
    videoReferenceVideos.length,
  ])
  const estimateQuery = useQuery({
    queryKey: [
      'aigc-workshop-estimate',
      estimateRequest?.module ?? '',
      estimateRequest?.model ?? '',
      estimateRequest?.group ?? '',
      estimateRequest?.prompt ?? '',
      estimateRequest?.n ?? 0,
      estimateRequest?.count ?? 0,
      estimateRequest?.size ?? '',
      estimateRequest?.aspect_ratio ?? '',
      estimateRequest?.resolution ?? '',
      estimateRequest?.quality ?? '',
      estimateRequest?.seconds ?? '',
      estimateRequest?.mySeconds ?? '',
      estimateRequest?.input_reference ?? '',
      estimateRequest?.reference_image_urls?.length ?? 0,
      estimateRequest?.reference_videos?.length ?? 0,
      estimateRequest?.reference_audios?.length ?? 0,
    ],
    queryFn: async () => {
      if (!estimateRequest) {
        throw new Error(t('请先填写生成内容'))
      }
      return await fetchAigcEstimate(estimateRequest)
    },
    enabled: estimateRequest != null,
    staleTime: 30_000,
  })
  const estimateQuota = estimateQuery.data?.data?.quota
  const estimateDisplay =
    estimateQuota == null ? '' : formatQuota(estimateQuota)
  const libraryResults = useMemo(() => {
    const items = assetsResponse?.data?.items ?? []
    return items.map(assetToResult)
  }, [assetsResponse?.data?.items])
  const visibleResults = assetView === 'session' ? results : libraryResults
  const visibleCount =
    assetView === 'session'
      ? results.length
      : (assetsResponse?.data?.total ?? 0)

  const commercePlanMutation = useMutation({
    mutationFn: generateCommercePlan,
    onSuccess: (plan) => {
      setCommercePlan(plan)
      setCommerceChatInput('')
      setCommerceMessages((current) => [
        ...current,
        { role: 'assistant', content: plan },
      ])
      toast.success(t('套图方案已生成'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('方案生成失败'))
    },
  })

  const imageMutation = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      if (activeModule === 'commerce') {
        return await executeCommerceSet()
      }
      return await generateSingleImage()
    },
    onSuccess: (newResults) => {
      if (newResults.length === 0) {
        return
      }
      setResults((current) => boundWorkshopResults([...newResults, ...current]))
      addMaterialsFromResults(newResults)
      setAssetView('session')
      void queryClient.invalidateQueries({
        queryKey: ['aigc-workshop-assets'],
        refetchType: 'none',
      })
      toast.success(t('生成请求已提交'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('生成失败'))
    },
  })

  const videoMutation = useMutation({
    gcTime: 0,
    mutationFn: generateVideoBatch,
    onSuccess: (newResults) => {
      if (newResults.length === 0) {
        return
      }
      setResults((current) => boundWorkshopResults([...newResults, ...current]))
      addMaterialsFromResults(newResults)
      setAssetView('session')
      void queryClient.invalidateQueries({
        queryKey: ['aigc-workshop-assets'],
        refetchType: 'none',
      })
      toast.success(t('视频任务已提交'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('生成失败'))
    },
  })

  const {
    isError: imageMutationError,
    isSuccess: imageMutationSuccess,
    reset: resetImageMutation,
  } = imageMutation
  const {
    isError: videoMutationError,
    isSuccess: videoMutationSuccess,
    reset: resetVideoMutation,
  } = videoMutation

  useEffect(() => {
    if (imageMutationSuccess || imageMutationError) {
      resetImageMutation()
    }
  }, [imageMutationError, imageMutationSuccess, resetImageMutation])

  useEffect(() => {
    if (videoMutationSuccess || videoMutationError) {
      resetVideoMutation()
    }
  }, [resetVideoMutation, videoMutationError, videoMutationSuccess])

  const refreshVideoMutation = useMutation({
    mutationFn: async (result: WorkshopResult) => {
      if (!result.taskId) {
        return result
      }
      const response = await fetchVideoTask(result.taskId)
      const status = normalizeVideoStatus(response.status)
      const directUrl = getVideoUrl(response)
      return {
        ...result,
        status,
        url:
          directUrl ??
          (status === 'succeeded'
            ? `/api/aigc/videos/${result.taskId}/content`
            : result.url),
        meta: response.status ?? result.meta,
      } satisfies WorkshopResult
    },
    onSuccess: (updated) => {
      setResults((current) =>
        boundWorkshopResults(
          current.map((item) => (item.id === updated.id ? updated : item))
        )
      )
      void refetchAssets()
      toast.success(t('任务状态已刷新'))
    },
  })

  const deleteAssetMutation = useMutation({
    mutationFn: deleteAigcAsset,
    onSuccess: () => {
      setSelectedAssetIds([])
      void refetchAssets()
      toast.success(t('素材已移除'))
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteAigcAssets,
    onSuccess: () => {
      setSelectedAssetIds([])
      void refetchAssets()
      toast.success(t('所选素材已移除'))
    },
  })

  function addMaterialsFromResults(newResults: WorkshopResult[]): void {
    const nextMaterials = resultToMaterials(newResults)
    if (nextMaterials.length === 0) {
      return
    }
    setMaterials((current) => [...nextMaterials, ...current].slice(0, 36))
  }

  function handleImageReferenceUpload(
    event: ChangeEvent<HTMLInputElement>
  ): void {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) {
      return
    }

    void addUploadedImageReferences(files).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('参考图上传失败'))
    })
  }

  async function addUploadedImageReferences(files: File[]): Promise<void> {
    const capacity = IMAGE_REFERENCE_LIMIT - imageReferences.length
    if (capacity <= 0) {
      toast.error(t('参考图已达 9 张上限'))
      return
    }

    const references: ImageReferenceAsset[] = []
    const uploadedMaterials: LocalMaterial[] = []
    for (const file of files.slice(0, capacity)) {
      const uploaded = await prepareUploadedImage(file, 'image-reference')
      if (!uploaded) {
        continue
      }
      references.push(uploaded.reference)
      uploadedMaterials.push(uploaded.material)
    }
    if (references.length === 0) {
      return
    }

    setImageReferences((current) =>
      [...current, ...references].slice(0, IMAGE_REFERENCE_LIMIT)
    )
    setMaterials((current) => [...uploadedMaterials, ...current].slice(0, 36))
    toast.success(t('已添加 {{count}} 张参考图', { count: references.length }))
    if (files.length > capacity) {
      toast.info(
        t('仅添加前 {{count}} 张，参考图最多 9 张', { count: capacity })
      )
    }
  }

  function handleImageMaskUpload(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    if (imageReferences.length === 0) {
      toast.error(t('请先添加至少一张参考图'))
      return
    }
    void prepareUploadedImage(file, 'image-mask', false)
      .then((uploaded) => {
        if (!uploaded) {
          return
        }
        setImageMask(uploaded.reference)
        toast.success(t('蒙版已添加'))
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t('蒙版上传失败'))
      })
  }

  async function prepareUploadedImage(
    file: File,
    prefix: string,
    compressLarge = true
  ): Promise<{
    reference: ImageReferenceAsset
    material: LocalMaterial
  } | null> {
    if (!file.type.startsWith('image/')) {
      toast.error(t('文件 {{name}} 不是图片', { name: file.name }))
      return null
    }

    let sourceBlob: Blob = file
    if (compressLarge && file.size > MATERIAL_COMPRESSION_THRESHOLD_BYTES) {
      sourceBlob = await compressImageFile(file)
      if (sourceBlob.size < file.size) {
        toast.success(
          t('已压缩参考图 {{from}} → {{to}}', {
            from: formatFileSize(file.size),
            to: formatFileSize(sourceBlob.size),
          })
        )
      }
    }

    const url = objectUrlOwner.track(URL.createObjectURL(sourceBlob))
    const id = buildResultId(prefix)
    return {
      reference: { id, name: file.name, url, size: sourceBlob.size },
      material: {
        id,
        name: file.name,
        type: 'image',
        url,
        source: 'upload',
        createdAt: Date.now(),
      },
    }
  }

  function handleVideoReferenceUpload(
    kind: VideoReferenceKind,
    event: ChangeEvent<HTMLInputElement>
  ): void {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) {
      return
    }
    void addUploadedVideoReferences(kind, files).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : t('参考素材上传失败')
      )
    })
  }

  async function addUploadedVideoReferences(
    kind: VideoReferenceKind,
    files: File[]
  ): Promise<void> {
    if (kind === 'video' && selectedVideoReferencesDisabled) {
      toast.error(t('当前模型不支持参考视频'))
      return
    }
    if (kind === 'audio' && selectedVideoAudioReferencesDisabled) {
      toast.error(t('This model does not support reference audio'))
      return
    }
    let currentReferences = videoReferenceImages
    if (kind === 'video') {
      currentReferences = videoReferenceVideos
    } else if (kind === 'audio') {
      currentReferences = videoReferenceAudios
    }

    const categoryCapacity =
      selectedVideoReferenceLimits[kind] - currentReferences.length
    const totalCapacity = selectedVideoReferenceTotalLimit - videoReferenceTotal
    const capacity = Math.min(categoryCapacity, totalCapacity)
    if (capacity <= 0) {
      toast.error(t('参考素材已达数量上限'))
      return
    }

    const expectedType = `${kind}/`
    const newReferences: VideoReferenceAsset[] = []
    let limitReached = false
    let videoDurationMs = videoReferenceVideos.reduce(
      (total, reference) => total + (reference.durationMs ?? 0),
      0
    )

    for (const file of files) {
      if (newReferences.length >= capacity) {
        limitReached = true
        continue
      }
      if (!file.type.startsWith(expectedType)) {
        toast.error(
          t('文件 {{name}} 与当前参考素材类型不匹配', { name: file.name })
        )
        continue
      }

      let maxBytes = VIDEO_REFERENCE_LIMITS.imageMaxBytes
      if (kind === 'video') {
        maxBytes = VIDEO_REFERENCE_LIMITS.videoMaxBytes
      } else if (kind === 'audio') {
        maxBytes = VIDEO_REFERENCE_LIMITS.audioMaxBytes
      }
      if (file.size > maxBytes) {
        toast.error(
          t('文件 {{name}} 超过 {{size}} 上限', {
            name: file.name,
            size: formatFileSize(maxBytes),
          })
        )
        continue
      }

      let sourceBlob: Blob = file
      if (
        kind === 'image' &&
        file.size > MATERIAL_COMPRESSION_THRESHOLD_BYTES
      ) {
        sourceBlob = await compressImageFile(file)
        if (sourceBlob.size < file.size) {
          toast.success(
            t('已压缩参考图 {{from}} → {{to}}', {
              from: formatFileSize(file.size),
              to: formatFileSize(sourceBlob.size),
            })
          )
        }
      }

      let durationMs: number | undefined
      if (kind === 'video') {
        durationMs = await readVideoDurationMs(file)
        if (durationMs == null) {
          toast.error(
            t('Could not read the duration of reference video {{name}}', {
              name: file.name,
            })
          )
          continue
        }
        if (
          videoDurationMs + durationMs >
          selectedVideoMaxReferenceVideoDurationMs
        ) {
          toast.error(
            t('Reference videos cannot exceed {{seconds}} seconds total', {
              seconds: selectedVideoMaxReferenceVideoDurationSeconds,
            })
          )
          continue
        }
        videoDurationMs += durationMs ?? 0
      }

      newReferences.push({
        id: buildResultId(`video-reference-${kind}`),
        name: file.name,
        kind,
        url: objectUrlOwner.track(URL.createObjectURL(sourceBlob)),
        size: sourceBlob.size,
        durationMs,
      })
    }

    if (newReferences.length > 0) {
      appendVideoReferences(kind, newReferences)
      toast.success(
        t('已添加 {{count}} 个参考素材', {
          count: newReferences.length,
        })
      )
    }
    if (limitReached) {
      toast.error(t('部分文件未添加，参考素材已达数量上限'))
    }
  }

  function appendVideoReferences(
    kind: VideoReferenceKind,
    references: VideoReferenceAsset[]
  ): void {
    if (kind === 'image') {
      setVideoReferenceImages((current) =>
        [...current, ...references].slice(0, selectedVideoReferenceLimits.image)
      )
      return
    }
    if (kind === 'video') {
      setVideoReferenceVideos((current) =>
        [...current, ...references].slice(0, selectedVideoReferenceLimits.video)
      )
      return
    }
    setVideoReferenceAudios((current) =>
      [...current, ...references].slice(0, selectedVideoReferenceLimits.audio)
    )
  }

  function removeVideoReference(kind: VideoReferenceKind, id: string): void {
    if (kind === 'image') {
      setVideoReferenceImages((current) =>
        current.filter((reference) => reference.id !== id)
      )
      return
    }
    if (kind === 'video') {
      setVideoReferenceVideos((current) =>
        current.filter((reference) => reference.id !== id)
      )
      return
    }
    setVideoReferenceAudios((current) =>
      current.filter((reference) => reference.id !== id)
    )
  }

  function selectVideoReferenceMaterial(material: LocalMaterial): void {
    void addVideoReferenceMaterial(material)
  }

  async function addVideoReferenceMaterial(
    material: LocalMaterial
  ): Promise<void> {
    const kind = material.type
    if (kind === 'video' && selectedVideoReferencesDisabled) {
      toast.error(t('当前模型不支持参考视频'))
      return
    }
    let currentReferences = videoReferenceImages
    if (kind === 'video') {
      currentReferences = videoReferenceVideos
    }
    if (currentReferences.some((reference) => reference.url === material.url)) {
      toast.info(t('该素材已在参考列表中'))
      return
    }
    if (
      currentReferences.length >= selectedVideoReferenceLimits[kind] ||
      videoReferenceTotal >= selectedVideoReferenceTotalLimit
    ) {
      toast.error(t('参考素材已达数量上限'))
      return
    }
    let durationMs: number | undefined
    if (kind === 'video') {
      durationMs = await readVideoSourceDurationMs(material.url)
      if (durationMs == null) {
        toast.error(
          t('Could not read the duration of reference video {{name}}', {
            name: material.name,
          })
        )
        return
      }
      const currentDurationMs = videoReferenceVideos.reduce(
        (total, reference) => total + (reference.durationMs ?? 0),
        0
      )
      if (
        currentDurationMs + durationMs >
        selectedVideoMaxReferenceVideoDurationMs
      ) {
        toast.error(
          t('Reference videos cannot exceed {{seconds}} seconds total', {
            seconds: selectedVideoMaxReferenceVideoDurationSeconds,
          })
        )
        return
      }
    }
    appendVideoReferences(kind, [
      {
        id: buildResultId(`video-reference-${kind}`),
        name: material.name,
        kind,
        url: material.url,
        durationMs,
      },
    ])
    toast.success(t('已添加参考素材'))
  }

  function selectImageReferenceMaterial(material: LocalMaterial): void {
    if (material.type !== 'image') {
      toast.error(t('生图参考仅支持图片素材'))
      return
    }
    if (imageReferences.some((reference) => reference.url === material.url)) {
      toast.info(t('该图片已在参考列表中'))
      return
    }
    if (imageReferences.length >= IMAGE_REFERENCE_LIMIT) {
      toast.error(t('参考图已达 9 张上限'))
      return
    }
    setImageReferences((current) => [
      ...current,
      {
        id: buildResultId('image-reference-material'),
        name: material.name,
        url: material.url,
      },
    ])
    toast.success(t('已添加参考图'))
  }

  function removeImageReference(id: string): void {
    setImageReferences((current) => {
      const next = current.filter((reference) => reference.id !== id)
      if (next.length === 0) {
        setImageMask(null)
      }
      return next
    })
  }

  function handleTextMaterialDrop(
    event: DragEvent<HTMLElement>,
    onChange: (value: string) => void,
    current: string
  ): void {
    event.preventDefault()
    const material = readDraggedMaterial(event)
    if (!material) {
      return
    }
    onChange(appendTextBlock(current, materialReference(material)))
  }

  function handleReferenceMaterialDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault()
    if (activeModule === 'image' && event.dataTransfer.files.length > 0) {
      void addUploadedImageReferences([...event.dataTransfer.files]).catch(
        (error: unknown) => {
          toast.error(
            error instanceof Error ? error.message : t('参考图上传失败')
          )
        }
      )
      return
    }
    const material = readDraggedMaterial(event)
    if (!material) {
      return
    }
    if (activeModule === 'video') {
      selectVideoReferenceMaterial({
        id: buildResultId('dragged-material'),
        name: material.name,
        type: material.type,
        url: material.url,
        source: 'generated',
        createdAt: Date.now(),
      })
      return
    }
    selectImageReferenceMaterial({
      id: buildResultId('dragged-material'),
      name: material.name,
      type: material.type,
      url: material.url,
      source: 'generated',
      createdAt: Date.now(),
    })
  }

  function validateBaseInput(model: string): boolean {
    if (!model) {
      toast.error(t('请先选择模型'))
      return false
    }
    return true
  }

  async function buildImagePayload(
    sourcePrompt: string
  ): Promise<ImageGenerationPayload> {
    const payload: ImageGenerationPayload = {
      model: selectedImageModel,
      prompt: sourcePrompt,
      n: 1,
      size: computedImageSize,
      quality: imageQuality,
      background: imageBackground,
      moderation: imageModeration,
      output_format: imageOutputFormat,
    }
    if (imageOutputFormat === 'jpeg' || imageOutputFormat === 'webp') {
      payload.output_compression = imageOutputCompression
    }
    if (imageReferences.length === 1) {
      payload.image = await resolveReferenceMediaUrl(imageReferences[0].url)
    } else if (imageReferences.length > 1) {
      payload.images = await Promise.all(
        imageReferences.map((reference) =>
          resolveReferenceMediaUrl(reference.url)
        )
      )
    }
    if (imageReferences.length > 0) {
      if (imageMask) {
        payload.mask = await resolveReferenceMediaUrl(imageMask.url)
      }
    }
    return payload
  }

  async function submitImageInBackground(
    sourcePrompt: string,
    count: number,
    title: string
  ): Promise<WorkshopResult[]> {
    const payload = await buildImagePayload(sourcePrompt)
    const responseOutputFormat = payload.output_format ?? 'png'
    const responses = await submitImageGenerationBatch(
      { ...payload, n: count },
      selectedImageOption?.group
    )

    const immediateResults: WorkshopResult[] = []
    const pendingResults: WorkshopResult[] = []
    const failedResults: WorkshopResult[] = []

    responses.forEach((response, index) => {
      const requestMeta = `${imageMeta} · 请求 #${index + 1}`
      if (response.error?.message) {
        failedResults.push({
          id: buildResultId('image'),
          type: 'image',
          status: 'failed',
          title,
          prompt: sourcePrompt,
          createdAt: Date.now(),
          meta: response.error.message,
        })
        return
      }

      const taskId = response.task_id ?? response.id
      if (!taskId || response.data) {
        const generatedResults = imageResponseToResults(
          response,
          title,
          sourcePrompt,
          responseOutputFormat
        )
        if (generatedResults.length > 0) {
          immediateResults.push(...generatedResults)
        } else {
          failedResults.push({
            id: buildResultId('image'),
            type: 'image',
            status: 'failed',
            title,
            prompt: sourcePrompt,
            createdAt: Date.now(),
            meta: '接口没有返回图片',
          })
        }
        return
      }

      const pendingId = `${taskId}-1`
      pendingResults.push({
        id: pendingId,
        type: 'image',
        status: 'processing',
        title,
        prompt: sourcePrompt,
        createdAt: Date.now(),
        taskId,
        meta: `${requestMeta} · 后台任务`,
      })

      void waitForImageGeneration(taskId)
        .then((completedResponse) => {
          if (completedResponse.error?.message) {
            throw new Error(completedResponse.error.message)
          }
          const completedResults = imageResponseToResults(
            completedResponse,
            title,
            sourcePrompt,
            responseOutputFormat
          )
          if (completedResults.length === 0) {
            throw new Error('接口没有返回图片')
          }
          setResults((current) =>
            boundWorkshopResults([
              ...completedResults,
              ...current.filter((item) => item.id !== pendingId),
            ])
          )
          addMaterialsFromResults(completedResults)
          void queryClient.invalidateQueries({
            queryKey: ['aigc-workshop-assets'],
            refetchType: 'none',
          })
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : t('生成失败')
          setResults((current) =>
            boundWorkshopResults(
              current.map((item) =>
                item.id === pendingId
                  ? { ...item, status: 'failed', meta: message }
                  : item
              )
            )
          )
          toast.error(message)
        })
    })

    if (
      failedResults.length > 0 &&
      pendingResults.length === 0 &&
      immediateResults.length === 0
    ) {
      throw new Error(failedResults[0].meta || t('生成失败'))
    }
    if (failedResults.length > 0) {
      toast.error(`${failedResults.length} 个图片请求失败`)
    }

    return [...immediateResults, ...failedResults, ...pendingResults]
  }

  async function generateSingleImage(): Promise<WorkshopResult[]> {
    if (!validateBaseInput(selectedImageModel)) {
      return []
    }
    if (!prompt.trim()) {
      toast.error(t('请填写提示词'))
      return []
    }

    return submitImageInBackground(prompt.trim(), imageCount, t('图片生成'))
  }

  async function generateCommercePlan(nextInput?: string): Promise<string> {
    if (!validateBaseInput(selectedTextModel)) {
      return ''
    }
    const commerceSubject = productName.trim() || commerceBrief.trim()
    if (!commerceSubject) {
      throw new Error(t('请先描述商品和场景需求'))
    }

    const selectedSceneLabels = COMMERCE_SCENES.filter((scene) =>
      selectedScenes.includes(scene.id)
    ).map((scene) => t(scene.titleKey))
    const selectedMaterialNames = materials
      .slice(0, 6)
      .map((material) => material.name)
      .join('、')
    const initialBrief = [
      `商品：${commerceSubject}`,
      `品牌调性：${brandTone.trim() || '未填写'}`,
      `套图场景：${selectedSceneLabels.join('、')}`,
      `可复用素材：${selectedMaterialNames || '暂无'}`,
      `补充要求：${commerceBrief.trim() || prompt.trim() || '未填写'}`,
    ].join('\n')
    const userBrief = nextInput?.trim() || initialBrief
    const nextMessages: ChatMessage[] = [
      ...commerceMessages,
      { role: 'user', content: userBrief },
    ]
    setCommerceMessages(nextMessages)

    const response = await generateChatCompletion(
      {
        model: selectedTextModel,
        stream: false,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              '你是电商视觉策划。先和用户沟通商品定位、卖点、场景、风格，再输出可直接交给生图模型执行的中文套图方案。输出包括：整体视觉方向、每个场景的画面目标、构图、光线、背景、道具、禁止事项。',
          },
          ...nextMessages,
        ],
      },
      selectedTextOption?.group
    )
    const content = getChatContent(response)
    if (!content) {
      throw new Error(t('文字模型没有返回方案'))
    }
    return content
  }

  async function executeCommerceSet(): Promise<WorkshopResult[]> {
    if (!validateBaseInput(selectedImageModel)) {
      return []
    }
    if (!productName.trim() && !commerceBrief.trim()) {
      toast.error(t('请先描述商品和场景需求'))
      return []
    }
    if (!commercePlan.trim()) {
      toast.error(t('请先生成或填写套图方案'))
      return []
    }

    const scenes = COMMERCE_SCENES.filter((scene) =>
      selectedScenes.includes(scene.id)
    )
    if (scenes.length === 0) {
      toast.error(t('请至少选择一个场景'))
      return []
    }

    const queueItems = scenes.map((scene) => ({
      id: buildResultId('queue'),
      sceneId: scene.id,
      title: t(scene.titleKey),
      prompt: buildCommercePrompt(scene),
      status: 'pending' as CommerceQueueStatus,
    }))
    setCommerceQueue(queueItems)
    setCommerceQueue((current) =>
      current.map((item) => ({ ...item, status: 'running' }))
    )

    const tasks = queueItems.map(async (item) => {
      const sceneResults = await submitImageInBackground(
        item.prompt,
        1,
        item.title
      )
      setCommerceQueue((current) =>
        current.map((queueItem) =>
          queueItem.id === item.id
            ? {
                ...queueItem,
                status: 'succeeded',
                resultCount: sceneResults.length,
              }
            : queueItem
        )
      )
      return sceneResults
    })
    const settled = await Promise.allSettled(tasks)
    const newResults: WorkshopResult[] = []
    settled.forEach((item, index) => {
      if (item.status === 'fulfilled') {
        newResults.push(...item.value)
        return
      }
      const failedItem = queueItems[index]
      const message =
        item.reason instanceof Error ? item.reason.message : t('执行失败')
      setCommerceQueue((current) =>
        current.map((queueItem) =>
          queueItem.id === failedItem.id
            ? { ...queueItem, status: 'failed', error: message }
            : queueItem
        )
      )
    })
    if (newResults.length === 0) {
      throw new Error(t('套图执行失败，请查看队列状态'))
    }
    return newResults
  }

  async function generateVideoBatch(): Promise<WorkshopResult[]> {
    if (!validateBaseInput(selectedVideoModel)) {
      throw new Error(t('请先选择模型'))
    }
    if (!prompt.trim()) {
      throw new Error(t('请填写提示词'))
    }
    if (videoReferenceImages.length < selectedVideoRequiredImages) {
      throw new Error(
        t('当前模型至少需要 {{count}} 张参考图', {
          count: selectedVideoRequiredImages,
        })
      )
    }
    if (
      videoReferenceImages.length > selectedVideoReferenceLimits.image ||
      videoReferenceVideos.length > selectedVideoReferenceLimits.video ||
      videoReferenceAudios.length > selectedVideoReferenceLimits.audio ||
      videoReferenceTotal > selectedVideoReferenceTotalLimit
    ) {
      throw new Error(t('参考素材数量超出上限'))
    }
    if (
      videoReferenceVideos.some((reference) => reference.durationMs == null)
    ) {
      throw new Error(
        t('Reference video duration could not be read. Select the video again.')
      )
    }
    const referenceVideoDurationMs = videoReferenceVideos.reduce(
      (total, reference) => total + (reference.durationMs ?? 0),
      0
    )
    if (referenceVideoDurationMs > selectedVideoMaxReferenceVideoDurationMs) {
      throw new Error(
        t('Reference videos cannot exceed {{seconds}} seconds total', {
          seconds: selectedVideoMaxReferenceVideoDurationSeconds,
        })
      )
    }
    const requestSeconds = selectedVideoRequestSeconds
    const displaySeconds = selectedVideoEffectiveSeconds
    const resolutionMeta = `${videoResolution} · `
    const submittedVideoReferences = selectedVideoReferencesDisabled
      ? []
      : videoReferenceVideos
    const submittedAudioReferences = selectedVideoAudioReferencesDisabled
      ? []
      : videoReferenceAudios
    const publicReferenceUrls = await ensurePublicAigcReferenceUrls([
      ...videoReferenceImages.map((reference) => ({
        kind: reference.kind,
        name: reference.name,
        url: reference.url,
      })),
      ...submittedVideoReferences.map((reference) => ({
        kind: reference.kind,
        name: reference.name,
        url: reference.url,
      })),
      ...submittedAudioReferences.map((reference) => ({
        kind: reference.kind,
        name: reference.name,
        url: reference.url,
      })),
    ])
    const imageEnd = videoReferenceImages.length
    const videoEnd = imageEnd + submittedVideoReferences.length
    const resolvedImageUrls = publicReferenceUrls.slice(0, imageEnd)
    const resolvedVideoUrls = publicReferenceUrls.slice(imageEnd, videoEnd)
    const resolvedAudioUrls = publicReferenceUrls.slice(videoEnd)
    const buildPayload = (): VideoGenerationPayload => {
      const payload: VideoGenerationPayload = {
        model: selectedVideoModel,
        prompt: prompt.trim(),
        seconds: requestSeconds,
        aspect_ratio: videoAspectRatio,
        resolution: videoResolution,
        size: videoSize,
      }
      if (selectedVideoMySeconds) {
        payload.mySeconds = selectedVideoMySeconds
      }
      if (resolvedImageUrls.length > 0) {
        payload.input_reference = resolvedImageUrls[0]
        payload.reference_image_urls = resolvedImageUrls
      }
      if (!selectedVideoReferencesDisabled && resolvedVideoUrls.length > 0) {
        payload.reference_videos = resolvedVideoUrls
      }
      if (
        !selectedVideoAudioReferencesDisabled &&
        resolvedAudioUrls.length > 0
      ) {
        payload.reference_audios = resolvedAudioUrls
      }
      if (videoBypassFaceCheck) {
        payload.bypass_face_check = true
      }
      if (videoGridStrengthEnabled) {
        payload.grid_strength = videoGridStrength
      }
      return payload
    }

    const tasks = Array.from({ length: videoCount }, (_, index) =>
      generateVideo(buildPayload(), selectedVideoOption?.group).then(
        (response) => {
          const taskId = getVideoTaskId(response)
          const status = normalizeVideoStatus(response.status)
          return {
            id: buildResultId('video'),
            type: 'video',
            status,
            title:
              videoCount > 1 ? `${t('视频生成')} ${index + 1}` : t('视频生成'),
            prompt,
            createdAt: Date.now(),
            taskId,
            url:
              getVideoUrl(response) ??
              (status === 'succeeded' && taskId
                ? `/api/aigc/videos/${taskId}/content`
                : undefined),
            meta: selectedVideoOption?.fixed_seconds
              ? `${videoAspectRatio} · ${resolutionMeta}${displaySeconds}秒/条 · 固定时长`
              : `${videoAspectRatio} · ${resolutionMeta}${displaySeconds}秒/条`,
          } satisfies WorkshopResult
        }
      )
    )
    const settled = await Promise.allSettled(tasks)
    const newResults = settled.flatMap((item) =>
      item.status === 'fulfilled' ? [item.value] : []
    )
    if (newResults.length === 0) {
      const firstRejected = settled.find((item) => item.status === 'rejected')
      throw firstRejected?.status === 'rejected' &&
        firstRejected.reason instanceof Error
        ? firstRejected.reason
        : new Error(t('视频任务提交失败'))
    }
    return newResults
  }

  function imageResponseToResults(
    response: ImageGenerationResponse,
    title: string,
    sourcePrompt: string,
    outputFormat: ImageOutputFormat
  ): WorkshopResult[] {
    if (response.error?.message) {
      throw new Error(response.error.message)
    }
    return (response.data ?? []).map((item, index) => {
      const url =
        item.url ??
        (item.b64_json
          ? objectUrlOwner.track(
              createImageObjectUrl(
                item.b64_json,
                imageOutputMimeType(outputFormat)
              )
            )
          : undefined)
      return {
        id: buildResultId('image'),
        type: 'image',
        status: url ? 'succeeded' : 'processing',
        title,
        prompt: item.revised_prompt || sourcePrompt,
        createdAt: response.created ? response.created * 1000 : Date.now(),
        url,
        meta: `${imageMeta} #${index + 1}`,
      }
    })
  }

  function buildCommercePrompt(scene: CommerceScene): string {
    const commerceSubject = productName.trim() || commerceBrief.trim()
    const materialNames = materials
      .slice(0, 6)
      .map((material) => material.name)
      .join('、')
    const parts = [
      `商品：${commerceSubject}`,
      brandTone.trim() ? `品牌调性：${brandTone.trim()}` : '',
      `套图方案：${commercePlan.trim()}`,
      `当前场景：${t(scene.titleKey)}`,
      `场景要求：${t(scene.promptKey)}`,
      materialNames ? `参考素材名称：${materialNames}` : '',
      prompt.trim() ? `额外要求：${prompt.trim()}` : '',
    ].filter(Boolean)
    return parts.join('\n')
  }

  function handleSceneToggle(sceneId: string, checked: boolean): void {
    setSelectedScenes((current) => {
      if (checked) {
        return [...new Set([...current, sceneId])]
      }
      return current.filter((item) => item !== sceneId)
    })
  }

  function handleCustomImageWidthChange(value: number): void {
    const width = normalizeCustomImageDimension(String(value))
    setCustomImageWidth(width)
    setCustomImageHeight((height) =>
      constrainImageDimensionToRatio(height, width)
    )
  }

  function handleCustomImageHeightChange(value: number): void {
    const height = normalizeCustomImageDimension(String(value))
    setCustomImageHeight(height)
    setCustomImageWidth((width) =>
      constrainImageDimensionToRatio(width, height)
    )
  }

  function handleImageOutputFormatChange(value: ImageOutputFormat): void {
    setImageOutputFormat(value)
    if (value === 'jpeg' && imageBackground === 'transparent') {
      setImageBackground('auto')
    }
  }

  function handleImageBackgroundChange(value: ImageBackground): void {
    setImageBackground(value)
    if (value === 'transparent' && imageOutputFormat === 'jpeg') {
      setImageOutputFormat('png')
    }
  }

  function handleSubmit(): void {
    if (activeModule === 'video') {
      videoMutation.mutate()
      return
    }
    if (activeModule === 'commerce') {
      if (commercePlan.trim()) {
        imageMutation.mutate()
        return
      }
      commercePlanMutation.mutate(commerceChatInput.trim() || undefined)
      return
    }
    imageMutation.mutate()
  }

  function openWorkspace(workspace: AigcWorkspace): void {
    setActiveWorkspace(workspace)
    if (workspace === 'assets') {
      setAssetView('library')
    }
  }

  function handleAssetSelection(assetId: string, selected: boolean): void {
    setSelectedAssetIds((current) => {
      if (selected) {
        return [...new Set([...current, assetId])]
      }
      return current.filter((id) => id !== assetId)
    })
  }

  async function handleBatchDownload(): Promise<void> {
    const selectedResults = libraryResults.filter((result) =>
      selectedAssetIds.includes(result.id)
    )
    const downloadableCount = selectedResults.filter(
      (result) => result.status === 'succeeded' && result.url
    ).length
    if (downloadableCount === 0) {
      toast.error(t('No selected assets are ready to download'))
      return
    }

    setBatchDownloadProgress({ completed: 0, total: downloadableCount })
    try {
      const summary = await downloadWorkshopResultsAsZip(
        selectedResults,
        setBatchDownloadProgress
      )
      const skipped =
        summary.skipped + selectedAssetIds.length - selectedResults.length
      if (skipped > 0) {
        toast.success(
          t(
            'Downloaded {{count}} selected assets; skipped {{skipped}} unavailable assets',
            { count: summary.downloaded, skipped }
          )
        )
      } else {
        toast.success(
          t('Downloaded {{count}} selected assets as ZIP', {
            count: summary.downloaded,
          })
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Asset archive download failed')
      )
    } finally {
      setBatchDownloadProgress(null)
    }
  }

  function handleWorkspaceDockSelect(workspace: AigcWorkspaceDockValue): void {
    if (workspace === 'music') {
      toast.info(t('音乐创作内测中'))
      return
    }
    openWorkspace(workspace)
  }

  function handleSelectVisibleAssets(): void {
    const visibleIds = visibleResults.map((result) => result.id)
    const allVisibleSelected = visibleIds.every((id) =>
      selectedAssetIds.includes(id)
    )
    setSelectedAssetIds(allVisibleSelected ? [] : visibleIds)
  }

  const isGenerating =
    imageMutation.isPending ||
    videoMutation.isPending ||
    commercePlanMutation.isPending

  let workspaceContent = <WorkspacePlaceholder workspace={activeWorkspace} />

  if (activeWorkspace === 'studio') {
    workspaceContent = (
      <OriginImageStudio
        activeModule={activeModule}
        prompt={prompt}
        imageReferences={imageReferences}
        imageMask={imageMask}
        videoReferenceImages={videoReferenceImages}
        videoReferenceVideos={videoReferenceVideos}
        videoReferenceAudios={videoReferenceAudios}
        videoReferenceTotal={videoReferenceTotal}
        materials={materials}
        imageModels={imageModelOptions}
        videoModels={videoModelOptions}
        textModels={textModelOptions}
        selectedImageModel={
          selectedImageOption ? modelOptionValue(selectedImageOption) : ''
        }
        selectedVideoModel={
          selectedVideoOption ? modelOptionValue(selectedVideoOption) : ''
        }
        selectedTextModel={
          selectedTextOption ? modelOptionValue(selectedTextOption) : ''
        }
        selectedImageModelName={selectedImageModel}
        selectedVideoDurationControlled={selectedVideoDurationControlled}
        selectedVideoFixedDuration={selectedVideoFixedDuration}
        selectedVideoMaxDuration={selectedVideoMaxDuration}
        selectedVideoRequiredImages={selectedVideoRequiredImages}
        selectedVideoMaxReferenceImages={selectedVideoReferenceLimits.image}
        selectedVideoMaxReferenceVideos={selectedVideoReferenceLimits.video}
        selectedVideoMaxReferenceAudios={selectedVideoReferenceLimits.audio}
        selectedVideoMaxReferenceVideoDurationSeconds={
          selectedVideoMaxReferenceVideoDurationSeconds
        }
        selectedVideoReferenceTotalLimit={selectedVideoReferenceTotalLimit}
        selectedVideoReferencesDisabled={selectedVideoReferencesDisabled}
        selectedVideoAudioReferencesDisabled={
          selectedVideoAudioReferencesDisabled
        }
        selectedVideoResolution={videoResolution}
        estimateDisplay={estimateDisplay}
        isLoadingModels={isLoadingModels}
        imageRatio={imageRatio}
        imageResolution={imageResolution}
        customImageWidth={customImageWidth}
        customImageHeight={customImageHeight}
        imageCount={imageCount}
        imageQuality={imageQuality}
        imageBackground={imageBackground}
        imageModeration={imageModeration}
        imageOutputFormat={imageOutputFormat}
        imageOutputCompression={imageOutputCompression}
        computedImageSize={computedImageSize}
        videoSeconds={selectedVideoEffectiveSeconds}
        videoCount={videoCount}
        videoAspectRatio={videoAspectRatio}
        videoBypassFaceCheck={videoBypassFaceCheck}
        videoGridStrengthEnabled={videoGridStrengthEnabled}
        videoGridStrength={videoGridStrength}
        commerceBrief={commerceBrief}
        commerceChatInput={commerceChatInput}
        commercePlan={commercePlan}
        commerceMessages={commerceMessages}
        commerceQueue={commerceQueue}
        selectedScenes={selectedScenes}
        commerceEditorOpen={commerceEditorOpen}
        resultTab={resultTab}
        results={results}
        isGenerating={isGenerating}
        isPlanning={commercePlanMutation.isPending}
        showAdvancedSettings={showAdvancedSettings}
        refreshVideoPending={refreshVideoMutation.isPending}
        onModuleChange={setActiveModule}
        onPromptChange={setPrompt}
        onCommerceBriefChange={setCommerceBrief}
        onImageReferenceUploadClick={() =>
          imageReferenceInputRef.current?.click()
        }
        onImageReferenceMaterialSelect={selectImageReferenceMaterial}
        onRemoveImageReference={removeImageReference}
        onImageMaskUploadClick={() => imageMaskInputRef.current?.click()}
        onImageMaskRemove={() => setImageMask(null)}
        onVideoReferenceUploadClick={(kind) => {
          if (kind === 'image') {
            videoReferenceImageInputRef.current?.click()
            return
          }
          if (kind === 'video') {
            videoReferenceVideoInputRef.current?.click()
            return
          }
          videoReferenceAudioInputRef.current?.click()
        }}
        onVideoReferenceMaterialSelect={selectVideoReferenceMaterial}
        onRemoveVideoReference={removeVideoReference}
        onImageModelChange={setImageModel}
        onVideoModelChange={setVideoModel}
        onTextModelChange={setTextModel}
        onImageRatioChange={setImageRatio}
        onImageResolutionChange={setImageResolution}
        onCustomImageWidthChange={handleCustomImageWidthChange}
        onCustomImageHeightChange={handleCustomImageHeightChange}
        onImageCountChange={setImageCount}
        onImageQualityChange={setImageQuality}
        onImageBackgroundChange={handleImageBackgroundChange}
        onImageModerationChange={setImageModeration}
        onImageOutputFormatChange={handleImageOutputFormatChange}
        onImageOutputCompressionChange={setImageOutputCompression}
        onVideoSecondsChange={setVideoSeconds}
        onVideoCountChange={setVideoCount}
        onVideoAspectRatioChange={setVideoAspectRatio}
        onVideoBypassFaceCheckChange={setVideoBypassFaceCheck}
        onVideoGridStrengthEnabledChange={setVideoGridStrengthEnabled}
        onVideoGridStrengthChange={setVideoGridStrength}
        onCommerceChatInputChange={setCommerceChatInput}
        onCommercePlanChange={setCommercePlan}
        onSceneToggle={handleSceneToggle}
        onResultTabChange={setResultTab}
        onAdvancedSettingsChange={setShowAdvancedSettings}
        onPromptMaterialDrop={(event) =>
          handleTextMaterialDrop(event, setPrompt, prompt)
        }
        onCommerceBriefMaterialDrop={(event) =>
          handleTextMaterialDrop(event, setCommerceBrief, commerceBrief)
        }
        onReferenceMaterialDrop={handleReferenceMaterialDrop}
        onCommercePlanMaterialDrop={(event) =>
          handleTextMaterialDrop(event, setCommercePlan, commercePlan)
        }
        onSendCommerceMessage={() =>
          commercePlanMutation.mutate(commerceChatInput.trim() || undefined)
        }
        onPrimaryAction={() => {
          if (activeModule === 'commerce' && !commerceEditorOpen) {
            setCommerceEditorOpen(true)
            return
          }
          handleSubmit()
        }}
        onOpenAssets={() => openWorkspace('assets')}
        onRefreshVideo={(result) => refreshVideoMutation.mutate(result)}
        onRemoveResult={(result) =>
          setResults((current) =>
            current.filter((item) => item.id !== result.id)
          )
        }
      />
    )
  } else if (activeWorkspace === 'assets') {
    workspaceContent = (
      <AssetsWorkspace
        assetType={assetType}
        visibleCount={visibleCount}
        visibleResults={visibleResults}
        isFetchingAssets={isFetchingAssets}
        selectedAssetIds={selectedAssetIds}
        refreshVideoPending={refreshVideoMutation.isPending}
        batchDeletePending={batchDeleteMutation.isPending}
        batchDownloadProgress={batchDownloadProgress}
        onAssetTypeChange={(type) => {
          setAssetType(type)
          setSelectedAssetIds([])
        }}
        onRefreshAssets={() => void refetchAssets()}
        onSelectVisibleAssets={handleSelectVisibleAssets}
        onBatchDownload={() => void handleBatchDownload()}
        onBatchDelete={() => batchDeleteMutation.mutate(selectedAssetIds)}
        onRefreshVideo={(result) => refreshVideoMutation.mutate(result)}
        onRemoveAsset={(result) => deleteAssetMutation.mutate(result.id)}
        onAssetSelection={handleAssetSelection}
        onBackToStudio={() => openWorkspace('studio')}
      />
    )
  }

  return (
    <div className='relative flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_18%_18%,rgba(129,140,248,0.22),transparent_34%),radial-gradient(circle_at_84%_20%,rgba(244,114,182,0.20),transparent_32%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(253,242,248,0.78))] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(99,102,241,0.18),transparent_34%),radial-gradient(circle_at_84%_20%,rgba(190,24,93,0.16),transparent_32%),linear-gradient(135deg,rgba(9,9,11,0.98),rgba(24,24,27,0.96))]'>
      <input
        ref={imageReferenceInputRef}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        onChange={handleImageReferenceUpload}
      />
      <input
        ref={imageMaskInputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={handleImageMaskUpload}
      />
      <input
        ref={videoReferenceImageInputRef}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        onChange={(event) => handleVideoReferenceUpload('image', event)}
      />
      <input
        ref={videoReferenceVideoInputRef}
        type='file'
        accept='video/*'
        multiple
        className='hidden'
        onChange={(event) => handleVideoReferenceUpload('video', event)}
      />
      <input
        ref={videoReferenceAudioInputRef}
        type='file'
        accept='audio/*'
        multiple
        className='hidden'
        onChange={(event) => handleVideoReferenceUpload('audio', event)}
      />
      <AigcWorkspaceDock
        active={activeWorkspace}
        onSelect={handleWorkspaceDockSelect}
        onLocked={() => toast.info(t('音乐创作内测中'))}
      />

      <main
        className={cn(
          'h-full min-h-0 min-w-0 w-full flex-1 scroll-pb-[45dvh] overflow-y-auto overscroll-contain sm:scroll-pb-0',
          activeWorkspace === 'studio'
            ? 'p-0 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] lg:pb-0'
            : 'p-3 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:p-4 lg:pb-4 xl:p-5'
        )}
      >
        {workspaceContent}
      </main>
    </div>
  )
}

type OriginImageStudioProps = {
  activeModule: WorkshopModule
  prompt: string
  imageReferences: ImageReferenceAsset[]
  imageMask: ImageReferenceAsset | null
  videoReferenceImages: VideoReferenceAsset[]
  videoReferenceVideos: VideoReferenceAsset[]
  videoReferenceAudios: VideoReferenceAsset[]
  videoReferenceTotal: number
  materials: LocalMaterial[]
  imageModels: ChipSelectOption[]
  videoModels: ChipSelectOption[]
  textModels: ChipSelectOption[]
  selectedImageModel: string
  selectedVideoModel: string
  selectedTextModel: string
  selectedImageModelName: string
  selectedVideoDurationControlled: boolean
  selectedVideoFixedDuration?: number
  selectedVideoMaxDuration?: number
  selectedVideoRequiredImages: number
  selectedVideoMaxReferenceImages: number
  selectedVideoMaxReferenceVideos: number
  selectedVideoMaxReferenceAudios: number
  selectedVideoMaxReferenceVideoDurationSeconds: number
  selectedVideoReferenceTotalLimit: number
  selectedVideoReferencesDisabled: boolean
  selectedVideoAudioReferencesDisabled: boolean
  selectedVideoResolution?: string
  estimateDisplay: string
  isLoadingModels: boolean
  imageRatio: ImageAspectRatioValue
  imageResolution: ImageResolutionValue
  customImageWidth: number
  customImageHeight: number
  imageCount: number
  imageQuality: ImageQuality
  imageBackground: ImageBackground
  imageModeration: ImageModeration
  imageOutputFormat: ImageOutputFormat
  imageOutputCompression: number
  computedImageSize: string
  videoSeconds: number
  videoCount: number
  videoAspectRatio: VideoAspectRatio
  videoBypassFaceCheck: boolean
  videoGridStrengthEnabled: boolean
  videoGridStrength: number
  commerceBrief: string
  commerceChatInput: string
  commercePlan: string
  commerceMessages: ChatMessage[]
  commerceQueue: CommerceQueueItem[]
  selectedScenes: string[]
  commerceEditorOpen: boolean
  resultTab: 'mine' | 'template'
  results: WorkshopResult[]
  isGenerating: boolean
  isPlanning: boolean
  showAdvancedSettings: boolean
  refreshVideoPending: boolean
  onModuleChange: (value: WorkshopModule) => void
  onPromptChange: (value: string) => void
  onCommerceBriefChange: (value: string) => void
  onImageReferenceUploadClick: () => void
  onImageReferenceMaterialSelect: (material: LocalMaterial) => void
  onRemoveImageReference: (id: string) => void
  onImageMaskUploadClick: () => void
  onImageMaskRemove: () => void
  onVideoReferenceUploadClick: (kind: VideoReferenceKind) => void
  onVideoReferenceMaterialSelect: (material: LocalMaterial) => void
  onRemoveVideoReference: (kind: VideoReferenceKind, id: string) => void
  onImageModelChange: (value: string) => void
  onVideoModelChange: (value: string) => void
  onTextModelChange: (value: string) => void
  onImageRatioChange: (value: ImageAspectRatioValue) => void
  onImageResolutionChange: (value: ImageResolutionValue) => void
  onCustomImageWidthChange: (value: number) => void
  onCustomImageHeightChange: (value: number) => void
  onImageCountChange: (value: number) => void
  onImageQualityChange: (value: ImageQuality) => void
  onImageBackgroundChange: (value: ImageBackground) => void
  onImageModerationChange: (value: ImageModeration) => void
  onImageOutputFormatChange: (value: ImageOutputFormat) => void
  onImageOutputCompressionChange: (value: number) => void
  onVideoSecondsChange: (value: number) => void
  onVideoCountChange: (value: number) => void
  onVideoAspectRatioChange: (value: VideoAspectRatio) => void
  onVideoBypassFaceCheckChange: (value: boolean) => void
  onVideoGridStrengthEnabledChange: (value: boolean) => void
  onVideoGridStrengthChange: (value: number) => void
  onCommerceChatInputChange: (value: string) => void
  onCommercePlanChange: (value: string) => void
  onSceneToggle: (sceneId: string, checked: boolean) => void
  onResultTabChange: (value: 'mine' | 'template') => void
  onAdvancedSettingsChange: (open: boolean) => void
  onPromptMaterialDrop: (event: DragEvent<HTMLElement>) => void
  onCommerceBriefMaterialDrop: (event: DragEvent<HTMLElement>) => void
  onReferenceMaterialDrop: (event: DragEvent<HTMLElement>) => void
  onCommercePlanMaterialDrop: (event: DragEvent<HTMLElement>) => void
  onSendCommerceMessage: () => void
  onPrimaryAction: () => void
  onOpenAssets: () => void
  onRefreshVideo: (result: WorkshopResult) => void
  onRemoveResult: (result: WorkshopResult) => void
}

type VideoReferencePickerProps = {
  images: VideoReferenceAsset[]
  videos: VideoReferenceAsset[]
  audios: VideoReferenceAsset[]
  total: number
  materials: LocalMaterial[]
  requiredImageCount: number
  maxImages: number
  maxVideos: number
  maxAudios: number
  maxVideoDurationSeconds: number
  totalLimit: number
  videoReferencesDisabled: boolean
  audioReferencesDisabled: boolean
  onUploadClick: (kind: VideoReferenceKind) => void
  onMaterialSelect: (material: LocalMaterial) => void
  onRemove: (kind: VideoReferenceKind, id: string) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

type ImageReferencePickerProps = {
  references: ImageReferenceAsset[]
  materials: LocalMaterial[]
  onUploadClick: () => void
  onMaterialSelect: (material: LocalMaterial) => void
  onRemove: (id: string) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

function ImageReferencePicker(props: ImageReferencePickerProps) {
  const { t } = useTranslation()
  const imageMaterials = props.materials
    .filter((material) => material.type === 'image')
    .slice(0, 4)
  return (
    <div
      className='border-border/70 mt-3 w-full max-w-full min-w-0 border-t pt-3'
      onDragOver={(event) => event.preventDefault()}
      onDrop={props.onDrop}
    >
      <div className='flex w-full max-w-full min-w-0 flex-wrap items-center gap-2'>
        <button
          type='button'
          disabled={props.references.length >= IMAGE_REFERENCE_LIMIT}
          onClick={props.onUploadClick}
          className='border-border bg-background/75 text-foreground flex h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors hover:border-violet-400 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-45 sm:h-9'
          title={t('上传参考图')}
        >
          <Images className='size-4' />
          <span>{t('参考图')}</span>
          <span className='text-muted-foreground tabular-nums'>
            {props.references.length}/{IMAGE_REFERENCE_LIMIT}
          </span>
        </button>
        <span className='text-muted-foreground text-xs'>
          {t('支持选择或拖入图片')}
        </span>
      </div>

      {props.references.length > 0 ? (
        <div className='-mx-1 mt-3 flex w-full max-w-full min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:p-0'>
          {props.references.map((reference, index) => (
            <div
              key={reference.id}
              className='border-border bg-background/80 flex h-16 w-[min(78vw,260px)] shrink-0 snap-start items-center gap-2 rounded-lg border p-2 sm:w-[190px]'
              title={reference.name}
            >
              <AuthenticatedAssetImage
                src={reference.url}
                alt={reference.name}
                className='bg-muted h-12 w-14 shrink-0 rounded-md object-cover'
              />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-xs font-medium'>{reference.name}</p>
                <p className='text-muted-foreground mt-1 text-[11px]'>
                  {t('参考图 {{index}}', { index: index + 1 })}
                </p>
              </div>
              <button
                type='button'
                onClick={() => props.onRemove(reference.id)}
                className='text-muted-foreground hover:text-destructive flex size-9 shrink-0 items-center justify-center rounded-md transition-colors sm:size-7'
                title={t('移除参考图')}
                aria-label={t('移除参考图')}
              >
                <Trash2 className='size-3.5' />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {imageMaterials.length > 0 ? (
        <div className='-mx-1 mt-3 flex w-full max-w-full min-w-0 snap-x items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:p-0'>
          <span className='text-muted-foreground shrink-0 text-xs'>
            {t('最近图片')}
          </span>
          {imageMaterials.map((material) => (
            <button
              key={material.id}
              type='button'
              draggable
              disabled={props.references.length >= IMAGE_REFERENCE_LIMIT}
              onDragStart={(event) => setDraggedMaterial(event, material)}
              onClick={() => props.onMaterialSelect(material)}
              className='border-border bg-background/80 h-12 w-16 overflow-hidden rounded-lg border transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-45'
              title={t('添加 {{name}} 为参考图', { name: material.name })}
            >
              <AuthenticatedAssetImage
                src={material.url}
                alt={material.name}
                loading='lazy'
                decoding='async'
                className='h-full w-full object-cover'
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function VideoReferencePicker(props: VideoReferencePickerProps) {
  const { t } = useTranslation()
  const references = [...props.images, ...props.videos, ...props.audios]
  const uploadOptions = [
    {
      kind: 'image' as const,
      label: t('参考图片'),
      count: props.images.length,
      limit: props.maxImages,
      icon: Images,
    },
    {
      kind: 'video' as const,
      label: t('参考视频'),
      count: props.videos.length,
      limit: props.maxVideos,
      icon: Film,
    },
    {
      kind: 'audio' as const,
      label: t('参考音频'),
      count: props.audios.length,
      limit: props.maxAudios,
      icon: FileAudio,
    },
  ]

  return (
    <div
      className='border-border/70 mt-3 w-full max-w-full min-w-0 border-t pt-3'
      onDragOver={(event) => event.preventDefault()}
      onDrop={props.onDrop}
    >
      <div className='-mx-1 flex w-full max-w-full min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:p-0'>
        {uploadOptions.map((option) => {
          const Icon = option.icon
          const unavailable =
            (option.kind === 'video' && props.videoReferencesDisabled) ||
            (option.kind === 'audio' && props.audioReferencesDisabled)
          const disabled =
            unavailable ||
            option.count >= option.limit ||
            props.total >= props.totalLimit
          let uploadTitle = t('上传{{type}}', { type: option.label })
          if (unavailable) {
            uploadTitle =
              option.kind === 'audio'
                ? t('This model does not support reference audio')
                : t('当前模型不支持参考视频')
          }
          return (
            <button
              key={option.kind}
              type='button'
              disabled={disabled}
              onClick={() => props.onUploadClick(option.kind)}
              className='border-border bg-background/75 text-foreground flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors hover:border-violet-400 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-45 sm:h-9'
              title={uploadTitle}
            >
              <Icon className='size-4' />
              <span>{option.label}</span>
              <span className='text-muted-foreground tabular-nums'>
                {option.count}/{option.limit}
              </span>
            </button>
          )
        })}
        <span className='text-muted-foreground ml-auto shrink-0 text-xs tabular-nums'>
          {t('Total {{count}} / {{limit}}', {
            count: props.total,
            limit: props.totalLimit,
          })}
        </span>
      </div>

      {references.length > 0 ? (
        <div className='-mx-1 mt-3 flex w-full max-w-full min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:p-0'>
          {references.map((reference) => {
            let referenceLabel = t('音频')
            if (reference.kind === 'image') {
              referenceLabel = t('图片')
            } else if (reference.kind === 'video') {
              referenceLabel = t('视频')
            }
            let preview = (
              <div className='bg-muted flex h-12 w-14 shrink-0 items-center justify-center rounded-md'>
                <FileAudio className='size-5 text-emerald-600' />
              </div>
            )
            if (reference.kind === 'image') {
              preview = (
                <AuthenticatedAssetImage
                  src={reference.url}
                  alt={reference.name}
                  className='bg-muted h-12 w-14 shrink-0 rounded-md object-cover'
                />
              )
            } else if (reference.kind === 'video') {
              preview = (
                <video
                  src={reference.url}
                  className='bg-muted h-12 w-14 shrink-0 rounded-md object-cover'
                  muted
                  preload='metadata'
                />
              )
            }
            return (
              <div
                key={reference.id}
                className='border-border bg-background/80 flex h-16 w-[min(78vw,260px)] shrink-0 snap-start items-center gap-2 rounded-lg border p-2 sm:w-[190px]'
                title={reference.name}
              >
                {preview}
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-xs font-medium'>
                    {reference.name}
                  </p>
                  <p className='text-muted-foreground mt-1 text-[11px]'>
                    {reference.kind === 'video' && props.videoReferencesDisabled
                      ? t('视频 · 当前模型不使用')
                      : referenceLabel}
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => props.onRemove(reference.kind, reference.id)}
                  className='text-muted-foreground hover:text-destructive flex size-9 shrink-0 items-center justify-center rounded-md transition-colors sm:size-7'
                  title={t('移除参考素材')}
                  aria-label={t('移除参考素材')}
                >
                  <Trash2 className='size-3.5' />
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      {props.materials.length > 0 ? (
        <div className='-mx-1 mt-3 flex w-full max-w-full min-w-0 snap-x items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:p-0'>
          <span className='text-muted-foreground shrink-0 text-xs'>
            {t('最近素材')}
          </span>
          {props.materials.slice(0, 4).map((material) => (
            <button
              key={material.id}
              type='button'
              disabled={
                material.type === 'video' && props.videoReferencesDisabled
              }
              draggable
              onDragStart={(event) => setDraggedMaterial(event, material)}
              onClick={() => props.onMaterialSelect(material)}
              className='border-border bg-background/80 h-12 w-16 overflow-hidden rounded-lg border transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-45'
              title={
                material.type === 'video' && props.videoReferencesDisabled
                  ? t('当前模型不支持参考视频')
                  : t('添加 {{name}} 为参考素材', { name: material.name })
              }
            >
              {material.type === 'video' ? (
                <video
                  src={material.url}
                  className='h-full w-full object-cover'
                  muted
                  preload='metadata'
                />
              ) : (
                <AuthenticatedAssetImage
                  src={material.url}
                  alt={material.name}
                  loading='lazy'
                  decoding='async'
                  className='h-full w-full object-cover'
                />
              )}
            </button>
          ))}
        </div>
      ) : null}

      <div className='text-muted-foreground mt-2 space-y-1 text-xs'>
        <p>
          {t(
            '{{images}} images / {{videos}} videos / {{audios}} audios / reference videos up to {{seconds}} seconds total',
            {
              images: props.maxImages,
              videos: props.maxVideos,
              audios: props.maxAudios,
              seconds: props.maxVideoDurationSeconds,
            }
          )}
        </p>
        {props.requiredImageCount > 0 ? (
          <p
            className={cn(
              props.images.length < props.requiredImageCount &&
                'font-medium text-amber-600 dark:text-amber-400'
            )}
          >
            {t('当前模型至少需要 {{count}} 张参考图，已选择 {{selected}} 张', {
              count: props.requiredImageCount,
              selected: props.images.length,
            })}
          </p>
        ) : null}
        {props.videoReferencesDisabled ? (
          <p>{t('This model does not accept reference videos')}</p>
        ) : null}
        {props.audioReferencesDisabled ? (
          <p>{t('This model does not accept reference audio')}</p>
        ) : null}
      </div>
    </div>
  )
}

function OriginImageStudio(props: OriginImageStudioProps) {
  const { t } = useTranslation()
  let moduleTitle = '电商套图工坊'
  if (props.activeModule === 'image') {
    moduleTitle = 'AI 图片工坊'
  } else if (props.activeModule === 'video') {
    moduleTitle = 'AI 视频工坊'
  }

  let moduleSubtitle = '一句话规划整套商品视觉'
  if (props.activeModule === 'image') {
    moduleSubtitle = '用文字创造你的画面'
  } else if (props.activeModule === 'video') {
    moduleSubtitle = '用文字生成你的电影镜头'
  }

  const composerValue =
    props.activeModule === 'commerce' ? props.commerceBrief : props.prompt
  let composerPlaceholder = '生成电商套图，我要卖的'
  if (props.activeModule === 'image') {
    composerPlaceholder = '镜头'
  } else if (props.activeModule === 'video') {
    composerPlaceholder = '一'
  }

  const selectedRatio =
    IMAGE_ASPECT_RATIOS.find((ratio) => ratio.value === props.imageRatio) ??
    IMAGE_ASPECT_RATIOS[0]
  const selectedResolution =
    IMAGE_RESOLUTION_LEVELS.find(
      (level) => level.value === props.imageResolution
    ) ?? IMAGE_RESOLUTION_LEVELS[0]
  const videoResolutionLabel = props.selectedVideoResolution ?? '模型内置'
  const estimate = props.estimateDisplay

  let primaryLabel = buttonLabel(props.activeModule, props.commercePlan)
  if (props.activeModule === 'commerce' && !props.commerceEditorOpen) {
    primaryLabel = '开始编辑'
  } else if (props.activeModule === 'image') {
    primaryLabel = '开始生成'
  }

  let primaryIcon = <Send data-icon='inline-start' />
  if (props.isGenerating) {
    primaryIcon = <Loader2 className='animate-spin' />
  } else if (
    props.activeModule === 'commerce' &&
    props.commerceEditorOpen &&
    props.commercePlan.trim()
  ) {
    primaryIcon = <Play data-icon='inline-start' />
  }

  let emptyStateIcon = '🖼️'
  let emptyStateTitle = t('准备开始你的创作')
  let emptyStateDescription = t('输入提示词，让 AI 为你生成画面')
  if (props.activeModule === 'video') {
    emptyStateIcon = '🎬'
    emptyStateTitle = t('暂无视频作品')
    emptyStateDescription = t('输入描述并上传参考图，开始创作视频')
  } else if (props.activeModule === 'commerce') {
    emptyStateIcon = '🧩'
    emptyStateTitle = t('准备规划你的套图')
    emptyStateDescription = t('输入商品和场景需求，直接生成一套不同用途的图片')
  }

  return (
    <div className='relative min-h-full w-full max-w-full min-w-0 overflow-visible px-3 pt-5 pb-6 sm:px-4 sm:pt-10 sm:pb-12 lg:pl-28'>
      <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.42),rgba(255,255,255,0.08))]' />
      <section className='relative mx-auto flex w-full max-w-6xl min-w-0 flex-col items-center'>
        <div className='text-center'>
          <h1 className='text-2xl leading-tight font-light tracking-normal text-violet-700 sm:text-4xl md:text-5xl dark:text-violet-200'>
            <span className='text-violet-400'>✦</span> {t(moduleTitle)}{' '}
            <span className='text-violet-400'>✦</span>
          </h1>
          <p className='text-muted-foreground mt-2 text-xs tracking-normal sm:mt-4 sm:text-sm'>
            <span className='text-amber-500'>•</span> {t(moduleSubtitle)}{' '}
            <span className='text-amber-500'>•</span>
          </p>
        </div>

        <div className='bg-background/78 border-border/70 mt-5 grid w-full grid-cols-2 rounded-xl border p-1 shadow-xl shadow-violet-950/10 backdrop-blur-xl sm:mt-8 sm:inline-flex sm:w-auto sm:rounded-full'>
          {WORKSHOP_MODULES.map((module) => {
            const Icon = MODULE_ICON[module.value]
            const active = props.activeModule === module.value
            return (
              <button
                key={module.value}
                type='button'
                onClick={() => props.onModuleChange(module.value)}
                className={cn(
                  'text-muted-foreground hover:text-foreground flex h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium transition-all sm:h-10 sm:min-w-[132px] sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm',
                  active &&
                    'bg-violet-950 text-white shadow-lg shadow-violet-950/30 hover:text-white'
                )}
              >
                <Icon className='size-4' />
                {module.value === 'video' ? (
                  <span className='hidden sm:inline'>🎬</span>
                ) : null}
                {t(module.titleKey)}
              </button>
            )
          })}
          <button
            type='button'
            onClick={() => toast.info(t('音乐创作内测中'))}
            className='text-muted-foreground hover:text-foreground flex h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium opacity-60 transition-all sm:h-10 sm:min-w-[132px] sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm'
            title={t('音乐创作内测中')}
          >
            <Film className='size-4' />
            {t('音乐创作')}
            <span className='hidden text-xs sm:inline'>🔒</span>
          </button>
        </div>

        <div className='bg-background/86 border-border/70 mt-4 w-full max-w-[880px] min-w-0 rounded-xl border p-3 shadow-2xl shadow-violet-950/12 backdrop-blur-2xl sm:mt-7 sm:rounded-[28px] sm:p-6'>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={
              props.activeModule === 'commerce'
                ? props.onCommerceBriefMaterialDrop
                : props.onPromptMaterialDrop
            }
          >
            <Textarea
              value={composerValue}
              onChange={(event) => {
                if (props.activeModule === 'commerce') {
                  props.onCommerceBriefChange(event.target.value)
                  return
                }
                props.onPromptChange(event.target.value)
              }}
              className='border-border/80 bg-background/80 min-h-24 resize-none rounded-xl text-base leading-7 shadow-inner sm:min-h-[72px]'
              placeholder={t(composerPlaceholder)}
            />
          </div>

          {props.activeModule === 'video' ? (
            <VideoReferencePicker
              images={props.videoReferenceImages}
              videos={props.videoReferenceVideos}
              audios={props.videoReferenceAudios}
              total={props.videoReferenceTotal}
              materials={props.materials}
              requiredImageCount={props.selectedVideoRequiredImages}
              maxImages={props.selectedVideoMaxReferenceImages}
              maxVideos={props.selectedVideoMaxReferenceVideos}
              maxAudios={props.selectedVideoMaxReferenceAudios}
              maxVideoDurationSeconds={
                props.selectedVideoMaxReferenceVideoDurationSeconds
              }
              totalLimit={props.selectedVideoReferenceTotalLimit}
              videoReferencesDisabled={props.selectedVideoReferencesDisabled}
              audioReferencesDisabled={
                props.selectedVideoAudioReferencesDisabled
              }
              onUploadClick={props.onVideoReferenceUploadClick}
              onMaterialSelect={props.onVideoReferenceMaterialSelect}
              onRemove={props.onRemoveVideoReference}
              onDrop={props.onReferenceMaterialDrop}
            />
          ) : null}

          {props.activeModule === 'image' ? (
            <ImageReferencePicker
              references={props.imageReferences}
              materials={props.materials}
              onUploadClick={props.onImageReferenceUploadClick}
              onMaterialSelect={props.onImageReferenceMaterialSelect}
              onRemove={props.onRemoveImageReference}
              onDrop={props.onReferenceMaterialDrop}
            />
          ) : null}

          <div className='border-border/70 mt-4 grid grid-cols-1 items-stretch gap-2 border-t pt-4 sm:flex sm:flex-wrap sm:items-center'>
            {props.activeModule === 'video' ? (
              <>
                <div
                  className='border-border bg-background/75 flex w-full rounded-lg border p-1 sm:w-auto sm:rounded-full'
                  role='group'
                  aria-label={t('视频比例')}
                >
                  {(['16:9', '9:16'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type='button'
                      onClick={() => props.onVideoAspectRatioChange(ratio)}
                      aria-pressed={props.videoAspectRatio === ratio}
                      className={cn(
                        'h-9 min-w-14 flex-1 rounded-md px-3 text-xs font-medium transition-colors sm:h-7 sm:flex-none sm:rounded-full',
                        props.videoAspectRatio === ratio
                          ? 'bg-violet-950 text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <ChipSelect
                  label={t('视频模型')}
                  value={props.selectedVideoModel}
                  disabled={props.isLoadingModels}
                  options={props.videoModels}
                  onChange={props.onVideoModelChange}
                />
                <span className='border-border bg-background/75 rounded-lg border px-3 py-2 text-sm sm:rounded-full'>
                  {props.videoAspectRatio} · {videoResolutionLabel} ·{' '}
                  {props.selectedVideoFixedDuration
                    ? `${props.selectedVideoFixedDuration}${t('秒/条')} · ${t('固定时长')}`
                    : `${props.videoSeconds}${t('秒/条')}`}{' '}
                  · {props.videoCount}
                  {t('条')}
                </span>
                {props.selectedVideoFixedDuration ? (
                  <span className='border-border bg-background/75 text-muted-foreground rounded-lg border px-3 py-2 text-xs sm:rounded-full'>
                    {t('模型固定 {{seconds}} 秒，按条生成', {
                      seconds: props.selectedVideoFixedDuration,
                    })}
                  </span>
                ) : null}
                {!props.selectedVideoFixedDuration &&
                props.selectedVideoDurationControlled &&
                props.selectedVideoMaxDuration ? (
                  <label className='border-border bg-background/75 flex h-11 items-center gap-2 rounded-lg border px-3 text-xs sm:h-9 sm:rounded-full'>
                    <span className='text-muted-foreground'>{t('时长')}</span>
                    <Input
                      type='number'
                      min={1}
                      max={props.selectedVideoMaxDuration}
                      value={props.videoSeconds}
                      onChange={(event) =>
                        props.onVideoSecondsChange(
                          clampInteger(
                            event.target.value,
                            1,
                            props.selectedVideoMaxDuration ?? 1
                          )
                        )
                      }
                      className='h-7 w-14 rounded-md border-0 bg-transparent px-1 text-center shadow-none focus-visible:ring-0'
                      aria-label={t('视频时长')}
                    />
                    <span className='text-muted-foreground'>
                      {t('秒，最长 {{seconds}} 秒', {
                        seconds: props.selectedVideoMaxDuration,
                      })}
                    </span>
                  </label>
                ) : null}
                {!props.selectedVideoFixedDuration &&
                !(
                  props.selectedVideoDurationControlled &&
                  props.selectedVideoMaxDuration
                ) ? (
                  <label className='border-border bg-background/75 flex h-11 items-center gap-2 rounded-lg border px-3 text-xs sm:h-9 sm:rounded-full'>
                    <span className='text-muted-foreground'>{t('时长')}</span>
                    <Input
                      type='number'
                      min={VIDEO_SECONDS_MIN}
                      max={props.selectedVideoMaxDuration ?? VIDEO_SECONDS_MAX}
                      value={props.videoSeconds}
                      onChange={(event) =>
                        props.onVideoSecondsChange(
                          clampInteger(
                            event.target.value,
                            VIDEO_SECONDS_MIN,
                            props.selectedVideoMaxDuration ?? VIDEO_SECONDS_MAX
                          )
                        )
                      }
                      className='h-7 w-14 rounded-md border-0 bg-transparent px-1 text-center shadow-none focus-visible:ring-0'
                      aria-label={t('视频时长')}
                    />
                    <span className='text-muted-foreground'>
                      {t('{{min}} to {{max}} seconds', {
                        min: VIDEO_SECONDS_MIN,
                        max:
                          props.selectedVideoMaxDuration ?? VIDEO_SECONDS_MAX,
                      })}
                    </span>
                  </label>
                ) : null}
                <Input
                  type='number'
                  min={1}
                  max={4}
                  value={props.videoCount}
                  onChange={(event) =>
                    props.onVideoCountChange(
                      clampInteger(event.target.value, 1, 4)
                    )
                  }
                  className='h-11 w-full rounded-lg sm:h-9 sm:w-20 sm:rounded-full'
                  aria-label={t('生成条数')}
                />
              </>
            ) : (
              <>
                <RatioPicker
                  label={t('比例')}
                  value={props.imageRatio}
                  resolution={props.imageResolution}
                  computedSize={props.computedImageSize}
                  customWidth={props.customImageWidth}
                  customHeight={props.customImageHeight}
                  onRatioChange={props.onImageRatioChange}
                  onCustomWidthChange={props.onCustomImageWidthChange}
                  onCustomHeightChange={props.onCustomImageHeightChange}
                />
                <ChipSelect
                  label={t('模型')}
                  value={props.selectedImageModel}
                  disabled={props.isLoadingModels}
                  options={props.imageModels}
                  onChange={props.onImageModelChange}
                />
                <div className='grid grid-cols-3 gap-2 sm:contents'>
                  {IMAGE_RESOLUTION_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type='button'
                      disabled={props.imageRatio === 'auto'}
                      onClick={() => props.onImageResolutionChange(level.value)}
                      className={cn(
                        'h-11 min-w-11 rounded-lg border px-3 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-45 sm:h-9 sm:rounded-full',
                        props.imageResolution === level.value
                          ? 'border-violet-950 bg-violet-950 text-white shadow-lg shadow-violet-950/30'
                          : 'border-border bg-background/75 text-muted-foreground hover:text-foreground'
                      )}
                      title={`${t(level.labelKey)} · ${props.selectedImageModelName}`}
                    >
                      {level.value.toUpperCase()}
                    </button>
                  ))}
                </div>
                {props.activeModule === 'image' ? (
                  <div className='border-border bg-background/75 flex h-11 items-center gap-3 rounded-lg border px-3 sm:h-9 sm:w-auto sm:rounded-full'>
                    <span className='text-sm'>{t('数量')}</span>
                    <input
                      type='range'
                      min={1}
                      max={IMAGE_GENERATION_MAX_COUNT}
                      value={props.imageCount}
                      onChange={(event) =>
                        props.onImageCountChange(
                          clampInteger(
                            event.target.value,
                            1,
                            IMAGE_GENERATION_MAX_COUNT
                          )
                        )
                      }
                      className='min-w-0 flex-1 accent-violet-950 sm:flex-none'
                    />
                    <span className='w-4 text-sm'>{props.imageCount}</span>
                  </div>
                ) : (
                  <ChipSelect
                    label={t('规划模型')}
                    value={props.selectedTextModel}
                    disabled={props.isLoadingModels}
                    options={props.textModels}
                    onChange={props.onTextModelChange}
                  />
                )}
              </>
            )}

            <button
              type='button'
              onClick={() =>
                props.onAdvancedSettingsChange(!props.showAdvancedSettings)
              }
              className={cn(
                'h-11 w-full rounded-lg border px-3 text-sm transition-all sm:h-9 sm:w-auto sm:rounded-full',
                props.showAdvancedSettings
                  ? 'border-violet-950 bg-violet-950 text-white shadow-lg shadow-violet-950/30'
                  : 'border-border bg-background/75 text-muted-foreground hover:text-foreground'
              )}
            >
              <Settings2 className='mr-1 inline size-4' />
              {t('更多设置')}
            </button>

            {estimate ? (
              <span className='text-muted-foreground text-center text-xs sm:ml-auto'>
                {t('预计')}
                {props.activeModule === 'image'
                  ? ` · ${t('Per request')}`
                  : ''}{' '}
                <strong className='text-amber-500'>{estimate}</strong>
              </span>
            ) : (
              <span className='hidden sm:ml-auto sm:inline' />
            )}

            <Button
              onClick={props.onPrimaryAction}
              disabled={props.isGenerating}
              className='h-11 w-full rounded-lg bg-violet-950 px-7 text-white shadow-lg shadow-violet-950/25 hover:bg-violet-900 sm:h-8 sm:w-auto sm:rounded-full'
            >
              {primaryIcon}
              {t(primaryLabel)}
            </Button>
          </div>

          {props.activeModule !== 'video' ? (
            <div className='text-muted-foreground mt-2 text-xs break-words'>
              {t(selectedRatio.descriptionKey)} ·{' '}
              {props.imageRatio === 'auto'
                ? t('Auto')
                : `${selectedResolution.value.toUpperCase()} · ${props.computedImageSize}`}
            </div>
          ) : null}

          {props.showAdvancedSettings ? (
            <div className='border-border/70 bg-background/72 mt-4 rounded-xl border p-3 sm:rounded-2xl sm:p-4'>
              {props.activeModule === 'image' ? (
                <>
                  <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                    <ChipSelect
                      label={t('质量')}
                      value={props.imageQuality}
                      options={[
                        { value: 'auto', label: t('自动') },
                        { value: 'low', label: t('低') },
                        { value: 'medium', label: t('中') },
                        { value: 'high', label: t('高') },
                      ]}
                      onChange={(value) =>
                        props.onImageQualityChange(value as ImageQuality)
                      }
                    />
                    <ChipSelect
                      label={t('背景')}
                      value={props.imageBackground}
                      options={[
                        { value: 'auto', label: t('自动') },
                        { value: 'transparent', label: t('透明') },
                        { value: 'opaque', label: t('不透明') },
                      ]}
                      onChange={(value) =>
                        props.onImageBackgroundChange(value as ImageBackground)
                      }
                    />
                    <ChipSelect
                      label={t('内容审核')}
                      value={props.imageModeration}
                      options={[
                        { value: 'auto', label: t('自动') },
                        { value: 'low', label: t('低') },
                      ]}
                      onChange={(value) =>
                        props.onImageModerationChange(value as ImageModeration)
                      }
                    />
                    <ChipSelect
                      label={t('输出格式')}
                      value={props.imageOutputFormat}
                      options={[
                        { value: 'png', label: 'PNG' },
                        { value: 'jpeg', label: 'JPEG' },
                        { value: 'webp', label: 'WebP' },
                      ]}
                      onChange={(value) =>
                        props.onImageOutputFormatChange(
                          value as ImageOutputFormat
                        )
                      }
                    />
                    {props.imageOutputFormat === 'jpeg' ||
                    props.imageOutputFormat === 'webp' ? (
                      <label className='border-border bg-background/75 flex h-9 items-center gap-3 rounded-full border px-3 text-sm'>
                        <span className='text-muted-foreground whitespace-nowrap'>
                          {t('压缩')}
                        </span>
                        <input
                          type='range'
                          min={0}
                          max={100}
                          value={props.imageOutputCompression}
                          onChange={(event) =>
                            props.onImageOutputCompressionChange(
                              clampInteger(event.target.value, 0, 100)
                            )
                          }
                          className='min-w-0 flex-1 accent-violet-950'
                        />
                        <span className='w-7 text-right text-xs tabular-nums'>
                          {props.imageOutputCompression}
                        </span>
                      </label>
                    ) : null}
                  </div>

                  <div className='border-border/70 mt-4 flex flex-wrap items-center gap-3 border-t pt-4'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      disabled={props.imageReferences.length === 0}
                      onClick={props.onImageMaskUploadClick}
                    >
                      <FileImage data-icon='inline-start' />
                      {props.imageMask ? t('替换蒙版') : t('上传蒙版')}
                    </Button>
                    {props.imageMask ? (
                      <div className='flex min-w-0 items-center gap-2'>
                        <img
                          src={props.imageMask.url}
                          alt={props.imageMask.name}
                          className='bg-muted size-10 rounded-md object-cover'
                        />
                        <span className='max-w-48 truncate text-xs'>
                          {props.imageMask.name}
                        </span>
                        <button
                          type='button'
                          onClick={props.onImageMaskRemove}
                          className='text-muted-foreground hover:text-destructive flex size-7 items-center justify-center rounded-md transition-colors'
                          title={t('移除蒙版')}
                          aria-label={t('移除蒙版')}
                        >
                          <Trash2 className='size-3.5' />
                        </button>
                      </div>
                    ) : (
                      <span className='text-muted-foreground text-xs'>
                        {t('蒙版需配合参考图使用')}
                      </span>
                    )}
                  </div>
                </>
              ) : null}
              {props.activeModule === 'video' ? (
                <>
                  <AigcSwitch
                    label={t('跳过人脸检查')}
                    description={t('启用后跳过视频生成前的人脸限制检查')}
                    checked={props.videoBypassFaceCheck}
                    onCheckedChange={props.onVideoBypassFaceCheckChange}
                  />
                  <AigcSwitch
                    label={t('人物一致性强度')}
                    description={t('可选范围 0.01 至 0.5，建议使用 0.2')}
                    checked={props.videoGridStrengthEnabled}
                    onCheckedChange={props.onVideoGridStrengthEnabledChange}
                  />
                  {props.videoGridStrengthEnabled ? (
                    <label className='border-border/70 bg-muted/30 mt-3 flex items-center gap-4 rounded-xl border p-3'>
                      <span className='text-muted-foreground shrink-0 text-xs'>
                        {t('强度')}
                      </span>
                      <input
                        type='range'
                        min={0.01}
                        max={0.5}
                        step={0.01}
                        value={props.videoGridStrength}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (Number.isFinite(value)) {
                            props.onVideoGridStrengthChange(
                              Math.min(0.5, Math.max(0.01, value))
                            )
                          }
                        }}
                        className='min-w-0 flex-1 accent-violet-950'
                      />
                      <span className='w-10 text-right text-xs font-medium tabular-nums'>
                        {props.videoGridStrength.toFixed(2)}
                      </span>
                    </label>
                  ) : null}
                </>
              ) : null}
              {props.activeModule === 'commerce' ? (
                <>
                  <AigcSwitch
                    label={t('风控保障（待接入）')}
                    description={t(
                      '当前生成仍按后台原有计费和失败处理规则执行'
                    )}
                    checked={false}
                    disabled
                  />
                  <AigcSwitch
                    label={t('公开到广场（已关闭）')}
                    description={t(
                      '当前不公开作品，资料库素材默认 30 天后自动清理'
                    )}
                    checked={false}
                    disabled
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {props.activeModule === 'commerce' && props.commerceEditorOpen ? (
          <CommerceEditBoard
            commerceChatInput={props.commerceChatInput}
            commercePlan={props.commercePlan}
            commerceMessages={props.commerceMessages}
            commerceQueue={props.commerceQueue}
            selectedScenes={props.selectedScenes}
            isPlanning={props.isPlanning}
            onCommerceChatInputChange={props.onCommerceChatInputChange}
            onCommercePlanChange={props.onCommercePlanChange}
            onSendCommerceMessage={props.onSendCommerceMessage}
            onCommercePlanMaterialDrop={props.onCommercePlanMaterialDrop}
            onSceneToggle={props.onSceneToggle}
          />
        ) : null}

        <section className='mt-8 w-full max-w-7xl min-w-0 sm:mt-12'>
          <div className='border-border/80 flex items-center gap-8 border-b'>
            <button
              type='button'
              onClick={() => props.onResultTabChange('mine')}
              className={cn(
                'h-11 border-b-2 px-1 text-sm font-medium transition-colors sm:h-auto sm:pb-3',
                props.resultTab === 'mine'
                  ? 'text-foreground border-violet-700'
                  : 'text-muted-foreground border-transparent'
              )}
            >
              {t('我的')}
            </button>
            <button
              type='button'
              onClick={() => props.onResultTabChange('template')}
              className={cn(
                'h-11 border-b-2 px-1 text-sm font-medium transition-colors sm:h-auto sm:pb-3',
                props.resultTab === 'template'
                  ? 'text-foreground border-violet-700'
                  : 'text-muted-foreground border-transparent'
              )}
            >
              {t('模板')}
            </button>
            <Button
              variant='ghost'
              size='sm'
              className='ml-auto h-11 sm:h-7'
              onClick={props.onOpenAssets}
            >
              <Library data-icon='inline-start' />
              {t('我的资产')}
            </Button>
          </div>

          {props.resultTab === 'template' ? (
            <div className='text-muted-foreground flex min-h-60 flex-col items-center justify-center gap-3 text-center'>
              <Wand2 className='size-10 text-violet-500' />
              <div className='text-foreground text-sm font-medium'>
                {t('模板稍后接入')}
              </div>
              <p className='max-w-sm text-xs'>
                {t('当前先保留原站的模板入口，后续可接入运营模板库。')}
              </p>
            </div>
          ) : null}

          {props.resultTab !== 'template' && props.results.length === 0 ? (
            <div className='text-muted-foreground flex min-h-60 flex-col items-center justify-center gap-3 text-center'>
              <div className='text-4xl'>{emptyStateIcon}</div>
              <div className='text-foreground text-sm font-medium'>
                {emptyStateTitle}
              </div>
              <p className='max-w-sm text-xs'>{emptyStateDescription}</p>
            </div>
          ) : null}

          {props.resultTab !== 'template' && props.results.length > 0 ? (
            <div className='grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {props.results.map((result) => (
                <AssetTile
                  key={result.id}
                  result={result}
                  refreshing={props.refreshVideoPending}
                  onRefresh={() => props.onRefreshVideo(result)}
                  onRemove={() => props.onRemoveResult(result)}
                />
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </div>
  )
}

function normalizeCustomImageDimension(value: string): number {
  const clamped = clampInteger(
    value,
    CUSTOM_IMAGE_SIZE_MIN,
    CUSTOM_IMAGE_SIZE_MAX
  )
  return Math.min(
    CUSTOM_IMAGE_SIZE_MAX,
    Math.max(
      CUSTOM_IMAGE_SIZE_MIN,
      Math.round(clamped / CUSTOM_IMAGE_SIZE_STEP) * CUSTOM_IMAGE_SIZE_STEP
    )
  )
}

function constrainImageDimensionToRatio(
  value: number,
  otherDimension: number
): number {
  const min = Math.max(
    CUSTOM_IMAGE_SIZE_MIN,
    Math.ceil(otherDimension / 3 / CUSTOM_IMAGE_SIZE_STEP) *
      CUSTOM_IMAGE_SIZE_STEP
  )
  const max = Math.min(
    CUSTOM_IMAGE_SIZE_MAX,
    Math.floor((otherDimension * 3) / CUSTOM_IMAGE_SIZE_STEP) *
      CUSTOM_IMAGE_SIZE_STEP
  )
  return Math.min(
    max,
    Math.max(min, normalizeCustomImageDimension(String(value)))
  )
}

function ratioPreviewAspect(
  value: ImageAspectRatioValue,
  customWidth: number,
  customHeight: number
): string {
  if (value === 'landscape') {
    return '16 / 9'
  }
  if (value === 'portrait') {
    return '9 / 16'
  }
  if (value === 'custom') {
    return `${customWidth} / ${customHeight}`
  }
  if (value.includes(':')) {
    return value.replace(':', ' / ')
  }
  return '1 / 1'
}

function RatioPicker(props: {
  label: string
  value: ImageAspectRatioValue
  resolution: ImageResolutionValue
  computedSize: string
  customWidth: number
  customHeight: number
  onRatioChange: (value: ImageAspectRatioValue) => void
  onCustomWidthChange: (value: number) => void
  onCustomHeightChange: (value: number) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selectedRatio =
    IMAGE_ASPECT_RATIOS.find((ratio) => ratio.value === props.value) ??
    IMAGE_ASPECT_RATIOS[0]

  function selectRatio(value: ImageAspectRatioValue): void {
    props.onRatioChange(value)
    if (value !== 'custom') {
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type='button'
            className='border-border bg-background/75 hover:bg-background flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-sm transition-colors sm:h-9 sm:w-auto sm:justify-start sm:rounded-full'
          />
        }
      >
        <span className='text-muted-foreground'>{props.label}</span>
        <span className='font-semibold'>{t(selectedRatio.labelKey)}</span>
        <span className='text-muted-foreground hidden text-xs sm:inline'>
          {props.computedSize}
        </span>
        <ChevronDownIcon className='size-4 opacity-60' />
      </PopoverTrigger>
      <PopoverContent
        align='start'
        collisionPadding={12}
        collisionAvoidance={{
          side: 'shift',
          align: 'shift',
          fallbackAxisSide: 'none',
        }}
        className='border-border/80 max-h-[calc(100dvh-5rem)] w-[calc(100vw-1.5rem)] max-w-[380px] overflow-y-auto overscroll-contain rounded-xl p-3 shadow-2xl shadow-violet-950/15 sm:max-h-[min(78svh,640px)] sm:w-[min(380px,calc(100vw-2rem))] sm:rounded-3xl sm:p-4'
      >
        <div className='flex items-start justify-between gap-4'>
          <div>
            <div className='text-sm font-semibold'>{t('画面比例')}</div>
            <div className='text-muted-foreground mt-1 text-xs'>
              {t('选择构图比例，或输入自定义宽高分辨率')}
            </div>
          </div>
          <Badge variant='outline'>{props.computedSize}</Badge>
        </div>

        <div className='mt-4 grid grid-cols-3 gap-2'>
          {IMAGE_ASPECT_RATIOS.filter((ratio) => ratio.value !== 'custom').map(
            (ratio) => {
              const active = props.value === ratio.value
              return (
                <button
                  key={ratio.value}
                  type='button'
                  onClick={() => selectRatio(ratio.value)}
                  className={cn(
                    'border-border bg-background/70 flex min-h-24 flex-col items-center justify-between rounded-2xl border p-3 text-center transition-all hover:border-violet-300 hover:bg-violet-50/70 dark:hover:bg-violet-950/20',
                    active &&
                      'border-violet-700 bg-violet-50 text-violet-950 shadow-lg shadow-violet-950/10 dark:bg-violet-950/30 dark:text-violet-100'
                  )}
                >
                  <span className='flex h-10 w-full items-center justify-center'>
                    <span
                      className={cn(
                        'bg-muted/70 border-border block h-8 rounded-md border',
                        active && 'border-violet-700 bg-violet-200/70'
                      )}
                      style={{
                        aspectRatio: ratioPreviewAspect(
                          ratio.value,
                          props.customWidth,
                          props.customHeight
                        ),
                      }}
                    />
                  </span>
                  <span className='mt-2 text-xs font-semibold'>
                    {t(ratio.labelKey)}
                  </span>
                  <span className='text-muted-foreground mt-1 line-clamp-1 text-[11px]'>
                    {t(ratio.descriptionKey)}
                  </span>
                </button>
              )
            }
          )}
        </div>

        <div
          className={cn(
            'border-border bg-muted/20 mt-3 rounded-2xl border p-3',
            props.value === 'custom' &&
              'border-violet-700 bg-violet-50/70 dark:bg-violet-950/20'
          )}
        >
          <button
            type='button'
            onClick={() => props.onRatioChange('custom')}
            className='flex w-full items-center justify-between gap-3 text-left'
          >
            <span>
              <span className='block text-sm font-semibold'>
                {t('自定义分辨率')}
              </span>
              <span className='text-muted-foreground mt-1 block text-xs'>
                {CUSTOM_IMAGE_SIZE_MIN} - {CUSTOM_IMAGE_SIZE_MAX}px，
                {t('生成请求将使用该宽高')}
              </span>
            </span>
            {props.value === 'custom' ? (
              <Check className='size-4 text-violet-700' />
            ) : null}
          </button>
          <div className='mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2'>
            <label className='space-y-1'>
              <span className='text-muted-foreground text-xs'>{t('宽度')}</span>
              <Input
                type='number'
                min={CUSTOM_IMAGE_SIZE_MIN}
                max={CUSTOM_IMAGE_SIZE_MAX}
                step={CUSTOM_IMAGE_SIZE_STEP}
                value={props.customWidth}
                onFocus={() => props.onRatioChange('custom')}
                onChange={(event) =>
                  props.onCustomWidthChange(
                    normalizeCustomImageDimension(event.target.value)
                  )
                }
                className='bg-background h-9 rounded-xl'
              />
            </label>
            <span className='text-muted-foreground pb-2 text-sm'>×</span>
            <label className='space-y-1'>
              <span className='text-muted-foreground text-xs'>{t('高度')}</span>
              <Input
                type='number'
                min={CUSTOM_IMAGE_SIZE_MIN}
                max={CUSTOM_IMAGE_SIZE_MAX}
                step={CUSTOM_IMAGE_SIZE_STEP}
                value={props.customHeight}
                onFocus={() => props.onRatioChange('custom')}
                onChange={(event) =>
                  props.onCustomHeightChange(
                    normalizeCustomImageDimension(event.target.value)
                  )
                }
                className='bg-background h-9 rounded-xl'
              />
            </label>
          </div>
          <div className='mt-3 flex items-center justify-between gap-3'>
            <span className='text-muted-foreground text-xs'>
              {t('当前清晰度')} {props.resolution.toUpperCase()} ·{' '}
              {props.computedSize}
            </span>
            <Button
              type='button'
              size='sm'
              variant={props.value === 'custom' ? 'default' : 'outline'}
              onClick={() => {
                props.onRatioChange('custom')
                setOpen(false)
              }}
            >
              {t('应用')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ChipSelect(props: {
  label: string
  value: string
  options: (string | { value: string; label: string })[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const selectedOption = props.options.find((option) => {
    const value = typeof option === 'string' ? option : option.value
    return value === props.value
  })
  const selectedLabel =
    typeof selectedOption === 'string'
      ? selectedOption
      : (selectedOption?.label ?? '')
  return (
    <label
      className='border-border bg-background/75 flex h-11 w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-3 text-sm sm:h-9 sm:w-auto sm:rounded-full'
      title={selectedLabel}
    >
      <span className='text-muted-foreground shrink-0'>{props.label}</span>
      <NativeSelect
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className='h-9 min-w-0 flex-1 truncate border-0 bg-transparent px-0 py-0 text-sm font-semibold shadow-none focus-visible:ring-0 sm:h-7 sm:max-w-[min(520px,65vw)] sm:min-w-24'
      >
        {props.options.map((option) => {
          const value = typeof option === 'string' ? option : option.value
          const label = typeof option === 'string' ? option : option.label
          return (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          )
        })}
      </NativeSelect>
    </label>
  )
}

function AigcSwitch(props: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange?: (value: boolean) => void
}) {
  return (
    <button
      type='button'
      disabled={props.disabled}
      aria-pressed={props.checked}
      onClick={() => props.onCheckedChange?.(!props.checked)}
      className={cn(
        'border-border/60 flex w-full items-center justify-between gap-4 border-b py-3 text-left last:border-b-0',
        props.disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <span>
        <span className='block text-sm font-medium'>{props.label}</span>
        <span className='text-muted-foreground block text-xs'>
          {props.description}
        </span>
      </span>
      <span
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          props.checked ? 'bg-emerald-500' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'bg-background absolute top-1 size-4 rounded-full shadow transition-transform',
            props.checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </span>
    </button>
  )
}

function CommerceEditBoard(props: {
  commerceChatInput: string
  commercePlan: string
  commerceMessages: ChatMessage[]
  commerceQueue: CommerceQueueItem[]
  selectedScenes: string[]
  isPlanning: boolean
  onCommerceChatInputChange: (value: string) => void
  onCommercePlanChange: (value: string) => void
  onSendCommerceMessage: () => void
  onCommercePlanMaterialDrop: (event: DragEvent<HTMLElement>) => void
  onSceneToggle: (sceneId: string, checked: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <section className='mt-5 grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
      <div className='border-border/70 bg-background/82 rounded-3xl border p-4 shadow-xl shadow-violet-950/8 backdrop-blur-xl'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-center gap-2 text-sm font-semibold'>
            <MessageSquare className='size-4 text-violet-700' />
            {t('多轮沟通')}
          </div>
          <Badge variant='outline'>
            {props.commerceMessages.length}
            {t('条消息')}
          </Badge>
        </div>
        <div className='mt-3 max-h-56 space-y-2 overflow-auto'>
          {props.commerceMessages.length === 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('先让文字模型规划套图，确认方案后再执行生图队列。')}
            </p>
          ) : (
            props.commerceMessages.map((message) => (
              <div
                key={`${message.role}-${message.content}`}
                className={cn(
                  'max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-5',
                  message.role === 'assistant'
                    ? 'bg-muted/70'
                    : 'ml-auto bg-violet-950 text-white'
                )}
              >
                <div className='mb-1 text-[11px] opacity-70'>
                  {message.role === 'assistant' ? t('文字模型') : t('你')}
                </div>
                <div className='whitespace-pre-wrap'>{message.content}</div>
              </div>
            ))
          )}
        </div>
        <Textarea
          value={props.commerceChatInput}
          onChange={(event) =>
            props.onCommerceChatInputChange(event.target.value)
          }
          className='mt-3 min-h-20 resize-none rounded-2xl'
          placeholder={t('继续补充卖点、平台限制、模特要求或文案留白')}
        />
        <div className='mt-3 flex justify-end'>
          <Button
            size='sm'
            onClick={props.onSendCommerceMessage}
            disabled={props.isPlanning}
            className='rounded-full bg-violet-950 text-white hover:bg-violet-900'
          >
            {props.isPlanning ? (
              <Loader2 className='animate-spin' />
            ) : (
              <Send data-icon='inline-start' />
            )}
            {t('生成套图方案')}
          </Button>
        </div>
      </div>

      <div className='space-y-4'>
        <div className='border-border/70 bg-background/82 rounded-3xl border p-4 shadow-xl shadow-violet-950/8 backdrop-blur-xl'>
          <div className='mb-3 flex items-center gap-2 text-sm font-semibold'>
            <ClipboardList className='size-4 text-violet-700' />
            {t('方案卡片')}
          </div>
          <Textarea
            value={props.commercePlan}
            onChange={(event) => props.onCommercePlanChange(event.target.value)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={props.onCommercePlanMaterialDrop}
            className='min-h-44 resize-none rounded-2xl text-sm leading-6'
            placeholder={t('文字模型生成的套图方案会沉淀在这里，可继续修改。')}
          />
        </div>

        <div className='border-border/70 bg-background/82 rounded-3xl border p-4 shadow-xl shadow-violet-950/8 backdrop-blur-xl'>
          <div className='mb-3 flex items-center gap-2 text-sm font-semibold'>
            <ListChecks className='size-4 text-violet-700' />
            {t('套图场景')}
          </div>
          <div className='grid grid-cols-2 gap-2'>
            {COMMERCE_SCENES.map((scene) => (
              <label
                key={scene.id}
                className='border-border/80 bg-background/70 flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs'
              >
                <Checkbox
                  checked={props.selectedScenes.includes(scene.id)}
                  onCheckedChange={(checked) =>
                    props.onSceneToggle(scene.id, checked === true)
                  }
                />
                {t(scene.titleKey)}
              </label>
            ))}
          </div>
        </div>

        <CommerceQueuePanel queue={props.commerceQueue} />
      </div>
    </section>
  )
}

function AssetsWorkspace(props: {
  assetType: AigcAssetType
  visibleCount: number
  visibleResults: WorkshopResult[]
  isFetchingAssets: boolean
  selectedAssetIds: string[]
  refreshVideoPending: boolean
  batchDeletePending: boolean
  batchDownloadProgress: WorkshopArchiveProgress | null
  onAssetTypeChange: (type: AigcAssetType) => void
  onRefreshAssets: () => void
  onSelectVisibleAssets: () => void
  onBatchDownload: () => void
  onBatchDelete: () => void
  onRefreshVideo: (result: WorkshopResult) => void
  onRemoveAsset: (result: WorkshopResult) => void
  onAssetSelection: (assetId: string, selected: boolean) => void
  onBackToStudio: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className='mx-auto flex min-h-full w-full max-w-7xl flex-col gap-3 sm:gap-4'>
      <div className='border-border bg-background rounded-lg border p-3 shadow-sm sm:p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2 text-lg font-semibold'>
              <Library className='size-5' />
              {t('我的资产')}
            </div>
            <p className='text-muted-foreground mt-1 text-xs leading-5 sm:text-sm'>
              {t(
                '生成素材默认保留 30 天，可拖拽回工坊、画布或提示词继续复用。'
              )}
            </p>
          </div>
          <Button
            variant='outline'
            onClick={props.onBackToStudio}
            className='size-11 px-0 sm:h-8 sm:w-auto sm:px-2.5'
            aria-label={t('返回工坊')}
            title={t('返回工坊')}
          >
            <Sparkles data-icon='inline-start' />
            <span className='hidden sm:inline'>{t('返回工坊')}</span>
          </Button>
        </div>
      </div>

      <AssetPanel
        assetView='library'
        assetType={props.assetType}
        visibleCount={props.visibleCount}
        visibleResults={props.visibleResults}
        isFetchingAssets={props.isFetchingAssets}
        selectedAssetIds={props.selectedAssetIds}
        refreshVideoPending={props.refreshVideoPending}
        batchDeletePending={props.batchDeletePending}
        batchDownloadProgress={props.batchDownloadProgress}
        standalone
        onAssetViewChange={() => undefined}
        onAssetTypeChange={props.onAssetTypeChange}
        onRefreshAssets={props.onRefreshAssets}
        onSelectVisibleAssets={props.onSelectVisibleAssets}
        onBatchDownload={props.onBatchDownload}
        onBatchDelete={props.onBatchDelete}
        onClearSession={() => undefined}
        onRefreshVideo={props.onRefreshVideo}
        onRemoveAsset={props.onRemoveAsset}
        onAssetSelection={props.onAssetSelection}
      />
    </div>
  )
}

function WorkspacePlaceholder(props: { workspace: AigcWorkspace }) {
  const { t } = useTranslation()
  const title = props.workspace === 'canvas' ? '无限画布' : '提示词广场'
  const description =
    props.workspace === 'canvas'
      ? '该模块已保留入口，内容将在后续版本重新整理。'
      : '该模块已保留入口，内容将在后续版本重新整理。'

  return (
    <div className='mx-auto flex min-h-full w-full max-w-5xl items-center justify-center px-4 py-12'>
      <section className='border-border bg-background/80 w-full max-w-xl rounded-2xl border p-8 text-center shadow-sm backdrop-blur'>
        <Layers3 className='text-muted-foreground mx-auto size-10' />
        <h1 className='mt-4 text-xl font-semibold'>{t(title)}</h1>
        <p className='text-muted-foreground mt-2 text-sm'>{t(description)}</p>
      </section>
    </div>
  )
}

function buttonLabel(module: WorkshopModule, plan: string): string {
  if (module === 'commerce' && plan.trim()) {
    return '执行套图生成'
  }
  if (module === 'commerce') {
    return '生成套图方案'
  }
  if (module === 'video') {
    return '生成视频'
  }
  return '生成图片'
}

function CommerceQueuePanel(props: { queue: CommerceQueueItem[] }) {
  const { t } = useTranslation()

  return (
    <div className='border-border bg-background rounded-md border'>
      <div className='border-border flex items-center justify-between gap-3 border-b px-3 py-2'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <ListChecks className='size-4' />
          {t('执行队列')}
        </div>
        <Badge variant='outline'>
          {props.queue.length}
          {t('个场景')}
        </Badge>
      </div>
      <div className='space-y-2 p-3'>
        {props.queue.length === 0 ? (
          <div className='text-muted-foreground bg-muted/30 rounded-md px-3 py-4 text-center text-xs'>
            {t('生成方案后点击执行套图生成，场景队列会显示在这里。')}
          </div>
        ) : (
          props.queue.map((item) => (
            <div
              key={item.id}
              className='border-border rounded-md border px-3 py-2'
            >
              <div className='flex items-center justify-between gap-3'>
                <div className='min-w-0'>
                  <div className='truncate text-sm font-medium'>
                    {item.title}
                  </div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {item.sceneId}
                  </div>
                </div>
                <QueueStatusBadge status={item.status} />
              </div>
              {item.error ? (
                <div className='text-destructive mt-2 text-xs'>
                  {item.error}
                </div>
              ) : null}
              {item.resultCount ? (
                <div className='text-muted-foreground mt-2 text-xs'>
                  {t('已生成 {{count}} 张', { count: item.resultCount })}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function QueueStatusBadge(props: { status: CommerceQueueStatus }) {
  const { t } = useTranslation()
  if (props.status === 'failed') {
    return <Badge variant='destructive'>{t('失败')}</Badge>
  }
  if (props.status === 'succeeded') {
    return <Badge variant='secondary'>{t('已完成')}</Badge>
  }
  if (props.status === 'running') {
    return (
      <Badge variant='outline'>
        <Loader2 className='animate-spin' />
        {t('执行中')}
      </Badge>
    )
  }
  return <Badge variant='outline'>{t('等待中')}</Badge>
}

function AssetPanel(props: {
  assetView: 'session' | 'library'
  assetType: AigcAssetType
  visibleCount: number
  visibleResults: WorkshopResult[]
  isFetchingAssets: boolean
  selectedAssetIds: string[]
  refreshVideoPending: boolean
  batchDeletePending: boolean
  batchDownloadProgress: WorkshopArchiveProgress | null
  standalone?: boolean
  onAssetViewChange: (view: 'session' | 'library') => void
  onAssetTypeChange: (type: AigcAssetType) => void
  onRefreshAssets: () => void
  onSelectVisibleAssets: () => void
  onBatchDownload: () => void
  onBatchDelete: () => void
  onClearSession: () => void
  onRefreshVideo: (result: WorkshopResult) => void
  onRemoveAsset: (result: WorkshopResult) => void
  onAssetSelection: (assetId: string, selected: boolean) => void
}) {
  const { t } = useTranslation()
  const allVisibleSelected =
    props.visibleResults.length > 0 &&
    props.visibleResults.every((result) =>
      props.selectedAssetIds.includes(result.id)
    )

  return (
    <section className='border-border bg-background flex min-h-[560px] flex-col overflow-hidden rounded-lg border shadow-sm sm:min-h-[680px]'>
      <div className='border-border flex shrink-0 flex-col gap-3 border-b p-3 sm:p-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-sm font-semibold'>
              <Package className='size-4' />
              {props.assetView === 'library' ? t('资料库') : t('生成结果')}
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {props.assetView === 'library'
                ? t('{{count}} 个素材 · 默认保留 30 天', {
                    count: props.visibleCount,
                  })
                : t('{{count}} 个本次结果', { count: props.visibleCount })}
            </p>
          </div>
          <Button
            variant='outline'
            size='icon-sm'
            className='size-11 sm:size-7'
            aria-label={t('刷新资料库')}
            onClick={props.onRefreshAssets}
            disabled={props.isFetchingAssets}
          >
            <RefreshCw
              className={cn(props.isFetchingAssets && 'animate-spin')}
            />
          </Button>
        </div>

        <div className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap'>
          {props.standalone ? null : (
            <>
              <Button
                variant={props.assetView === 'session' ? 'default' : 'outline'}
                size='sm'
                onClick={() => props.onAssetViewChange('session')}
              >
                <Sparkles data-icon='inline-start' />
                {t('本次结果')}
              </Button>
              <Button
                variant={props.assetView === 'library' ? 'default' : 'outline'}
                size='sm'
                onClick={() => {
                  props.onAssetViewChange('library')
                }}
              >
                <Library data-icon='inline-start' />
                {t('资料库')}
              </Button>
            </>
          )}
          {props.assetView === 'library' ? (
            <>
              <NativeSelect
                value={props.assetType}
                className='w-full sm:w-fit [&_select]:h-11 sm:[&_select]:h-8'
                onChange={(event) =>
                  props.onAssetTypeChange(event.target.value as AigcAssetType)
                }
              >
                <NativeSelectOption value='all'>
                  {t('全部素材')}
                </NativeSelectOption>
                <NativeSelectOption value='image'>
                  {t('图片')}
                </NativeSelectOption>
                <NativeSelectOption value='video'>
                  {t('视频')}
                </NativeSelectOption>
              </NativeSelect>
              <Button
                variant='outline'
                size='sm'
                className='h-11 px-3 sm:h-7'
                onClick={props.onSelectVisibleAssets}
                disabled={props.visibleResults.length === 0}
              >
                {allVisibleSelected ? t('Deselect All') : t('Select All')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                className='hidden min-w-28 sm:inline-flex'
                onClick={props.onBatchDownload}
                disabled={
                  props.selectedAssetIds.length === 0 ||
                  props.batchDownloadProgress !== null ||
                  props.batchDeletePending
                }
              >
                {props.batchDownloadProgress ? (
                  <Loader2 className='animate-spin' data-icon='inline-start' />
                ) : (
                  <Download data-icon='inline-start' />
                )}
                {props.batchDownloadProgress
                  ? t(
                      'Packaging {{completed}}/{{total}}',
                      props.batchDownloadProgress
                    )
                  : `${t('Download Selected')} (${props.selectedAssetIds.length})`}
              </Button>
              <Button
                variant='destructive'
                size='sm'
                className='hidden sm:inline-flex'
                onClick={props.onBatchDelete}
                disabled={
                  props.selectedAssetIds.length === 0 ||
                  props.batchDeletePending ||
                  props.batchDownloadProgress !== null
                }
              >
                <Trash2 data-icon='inline-start' />
                {t('移除所选')}
              </Button>
            </>
          ) : (
            <Button
              variant='outline'
              size='sm'
              onClick={props.onClearSession}
              disabled={props.visibleResults.length === 0}
            >
              <Trash2 data-icon='inline-start' />
              {t('清空')}
            </Button>
          )}
        </div>
      </div>

      {props.visibleResults.length === 0 ? (
        <div className='flex flex-1 items-center justify-center p-6 text-center'>
          <div className='max-w-sm space-y-3'>
            <div className='bg-muted mx-auto flex size-12 items-center justify-center rounded-md'>
              <Bot className='text-muted-foreground size-5' />
            </div>
            <div className='text-sm font-medium'>
              {props.assetView === 'library'
                ? t('资料库暂无素材')
                : t('暂无生成结果')}
            </div>
            <div className='text-muted-foreground text-xs'>
              {props.assetView === 'library'
                ? t('生成成功后的图片和视频任务会在 30 天内显示在这里。')
                : t('提交生成后，本次结果会先显示在这里。')}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'grid flex-1 auto-rows-min gap-3 overflow-auto p-3 sm:p-4 md:grid-cols-2 2xl:grid-cols-3',
            props.assetView === 'library' &&
              props.selectedAssetIds.length > 0 &&
              'pb-40 sm:pb-4'
          )}
        >
          {props.visibleResults.map((result) => (
            <AssetTile
              key={result.id}
              result={result}
              onRefresh={() => props.onRefreshVideo(result)}
              onRemove={() => props.onRemoveAsset(result)}
              refreshing={props.refreshVideoPending}
              selectable={props.assetView === 'library'}
              selected={props.selectedAssetIds.includes(result.id)}
              onSelect={(selected) =>
                props.onAssetSelection(result.id, selected)
              }
            />
          ))}
        </div>
      )}

      {props.assetView === 'library' && props.selectedAssetIds.length > 0 ? (
        <div className='bg-background/95 border-border fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] z-[75] mx-auto flex h-16 max-w-[420px] items-center gap-2 rounded-xl border p-2 shadow-2xl shadow-slate-950/20 backdrop-blur-xl sm:hidden'>
          <div className='min-w-0 flex-1 px-2'>
            <div className='truncate text-sm font-semibold'>
              {t('{{count}} selected', {
                count: props.selectedAssetIds.length,
              })}
            </div>
            {props.batchDownloadProgress ? (
              <div className='text-muted-foreground mt-0.5 truncate text-xs tabular-nums'>
                {t(
                  'Packaging {{completed}}/{{total}}',
                  props.batchDownloadProgress
                )}
              </div>
            ) : null}
          </div>
          <Button
            variant='outline'
            size='icon-lg'
            className='size-11'
            onClick={props.onBatchDownload}
            disabled={
              props.batchDownloadProgress !== null || props.batchDeletePending
            }
            aria-label={t('Download Selected')}
            title={t('Download Selected')}
          >
            {props.batchDownloadProgress ? (
              <Loader2 className='animate-spin' />
            ) : (
              <Download />
            )}
          </Button>
          <Button
            variant='destructive'
            size='icon-lg'
            className='size-11'
            onClick={props.onBatchDelete}
            disabled={
              props.batchDeletePending || props.batchDownloadProgress !== null
            }
            aria-label={t('移除所选')}
            title={t('移除所选')}
          >
            {props.batchDeletePending ? (
              <Loader2 className='animate-spin' />
            ) : (
              <Trash2 />
            )}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function AssetTile(props: {
  result: WorkshopResult
  refreshing: boolean
  onRefresh: () => void
  onRemove?: () => void
  selectable?: boolean
  selected?: boolean
  onSelect?: (selected: boolean) => void
}) {
  const { t } = useTranslation()
  const [isDownloading, setIsDownloading] = useState(false)
  const result = props.result
  const isVideo = result.type === 'video'
  let statusLabel = t('处理中')
  if (result.status === 'succeeded') {
    statusLabel = t('已成功')
  }
  if (result.status === 'failed') {
    statusLabel = t('失败')
  }

  let preview = (
    <div className='text-muted-foreground flex flex-col items-center gap-2 text-xs'>
      {result.status === 'failed' ? (
        <Trash2 className='size-5' />
      ) : (
        <Loader2 className='size-5 animate-spin' />
      )}
      {statusLabel}
    </div>
  )
  if (result.url && result.status === 'succeeded') {
    preview = isVideo ? (
      <AuthenticatedAssetVideo
        src={result.url}
        controls
        preload='none'
        loading='lazy'
        className='h-full w-full object-cover'
      />
    ) : (
      <AuthenticatedAssetImage
        src={result.url}
        alt={result.title}
        loading='lazy'
        decoding='async'
        className='h-full w-full object-cover'
      />
    )
  }

  return (
    <article
      draggable={!!result.url}
      onDragStart={(event) =>
        setDraggedMaterial(event, {
          name: result.title,
          url: result.url,
          type: result.type,
        })
      }
      className='border-border bg-background flex min-h-72 flex-col overflow-hidden rounded-md border'
    >
      <div className='bg-muted relative flex aspect-square items-center justify-center overflow-hidden'>
        {result.url ? (
          <GripVertical className='text-muted-foreground bg-background/80 absolute top-2 right-2 z-10 size-4 rounded' />
        ) : null}
        {props.selectable ? (
          <Checkbox
            checked={props.selected}
            onCheckedChange={(checked) => props.onSelect?.(checked === true)}
            className='bg-background absolute top-2 left-2 z-10 size-6 sm:size-4'
          />
        ) : null}
        {preview}
      </div>
      <div className='flex flex-1 flex-col gap-3 p-3'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <div className='truncate text-sm font-medium'>
              {t(result.title)}
            </div>
            <div className='text-muted-foreground truncate text-xs'>
              {result.meta}
            </div>
          </div>
          <Badge variant={getStatusVariant(result.status)}>{statusLabel}</Badge>
        </div>
        <p className='text-muted-foreground line-clamp-3 text-xs'>
          {result.prompt}
        </p>
        <div className='mt-auto flex gap-2'>
          {isVideo && result.taskId ? (
            <Button
              variant='outline'
              size='icon-sm'
              className='size-11 sm:size-7'
              aria-label={t('刷新')}
              onClick={props.onRefresh}
              disabled={props.refreshing}
            >
              <RefreshCw className={cn(props.refreshing && 'animate-spin')} />
            </Button>
          ) : null}
          {result.url ? (
            <>
              <Button
                variant='outline'
                size='icon-sm'
                className='size-11 sm:size-7'
                aria-label={t('复制链接')}
                onClick={() => {
                  void navigator.clipboard.writeText(result.url ?? '')
                  toast.success(t('已复制到剪贴板'))
                }}
              >
                <Copy />
              </Button>
              <Button
                variant='outline'
                size='icon-sm'
                className='size-11 sm:size-7'
                aria-label={t('下载')}
                onClick={() => {
                  setIsDownloading(true)
                  void downloadWorkshopResult(result)
                    .catch(() => {
                      toast.error(t('下载失败'))
                    })
                    .finally(() => {
                      setIsDownloading(false)
                    })
                }}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2 className='animate-spin' />
                ) : (
                  <Download />
                )}
              </Button>
            </>
          ) : null}
          {props.onRemove ? (
            <Button
              variant='ghost'
              size='icon-sm'
              className='size-11 sm:size-7'
              aria-label={t('移除')}
              onClick={props.onRemove}
            >
              <Trash2 />
            </Button>
          ) : null}
          {result.status === 'succeeded' ? (
            <Check className='text-primary ml-auto size-4 self-center' />
          ) : null}
        </div>
      </div>
    </article>
  )
}

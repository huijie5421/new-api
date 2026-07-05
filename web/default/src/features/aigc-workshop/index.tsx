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
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Bot,
  Check,
  ChevronDownIcon,
  ClipboardList,
  Copy,
  Download,
  FileImage,
  Film,
  GripVertical,
  ImageIcon,
  Layers3,
  Library,
  ListChecks,
  Loader2,
  MessageSquare,
  Package,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
import {
  batchDeleteAigcAssets,
  deleteAigcAsset,
  fetchAigcWorkshopModels,
  fetchAigcAssets,
  fetchVideoTask,
  generateChatCompletion,
  generateImage,
  generateVideo,
} from './api'
import {
  COMMERCE_SCENES,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTION_LEVELS,
  WORKSHOP_MODULES,
} from './constants'
import type {
  AigcAsset,
  AigcAssetType,
  AigcModelOption,
  ChatMessage,
  CommerceScene,
  ImageGenerationPayload,
  ImageGenerationResponse,
  VideoGenerationPayload,
  VideoGenerationResponse,
  WorkshopModule,
  WorkshopResult,
  WorkshopResultStatus,
} from './types'

type ImageAspectRatioValue = (typeof IMAGE_ASPECT_RATIOS)[number]['value']
type ImageResolutionValue = (typeof IMAGE_RESOLUTION_LEVELS)[number]['value']
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

const WORKSPACE_DOCK_ITEMS: {
  value: AigcWorkspace | 'music'
  title: string
  icon: typeof ImageIcon
  locked?: boolean
}[] = [
  { value: 'studio', title: 'AIGC工坊', icon: Sparkles },
  { value: 'canvas', title: '无限画布', icon: Layers3 },
  { value: 'prompts', title: '提示词广场', icon: MessageSquare },
  { value: 'music', title: '音乐创作', icon: Film, locked: true },
  { value: 'assets', title: '我的资产', icon: Library },
]

const VIDEO_SECONDS_OPTIONS = [5, 8, 10, 15] as const
const CUSTOM_IMAGE_SIZE_MIN = 256
const CUSTOM_IMAGE_SIZE_MAX = 4096
const CUSTOM_IMAGE_SIZE_STEP = 64
const MATERIAL_COMPRESSION_THRESHOLD_BYTES = 8 * 1024 * 1024
const FIXED_SEED_MIN = 0
const FIXED_SEED_MAX = 2_147_483_647
const MATERIAL_URL_MIME = 'application/x-aigc-material-url'
const MATERIAL_NAME_MIME = 'application/x-aigc-material-name'
const MODEL_OPTION_SEPARATOR = '\u001f'

function buildResultId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clampInteger(value: string, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function randomFixedSeed(): number {
  return Math.floor(
    Math.random() * (FIXED_SEED_MAX - FIXED_SEED_MIN + 1) + FIXED_SEED_MIN
  )
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`
  }
  return `${Math.max(1, Math.round(size / 1024))}KB`
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('文件读取失败'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
    reader.readAsDataURL(blob)
  })
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
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('图片解码失败'))
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
      if (!context) throw new Error('图片压缩失败')
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
  if (!status) return 'processing'
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
  return response.url ?? response.video_url
}

function getStatusVariant(
  status: WorkshopResultStatus
): 'secondary' | 'destructive' {
  if (status === 'failed') return 'destructive'
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

function modelOptionLabel(option: AigcModelOption): string {
  const baseLabel = option.label || `${option.model} · ${option.group}`
  const videoMeta = [
    option.resolution,
    option.fixed_seconds && option.fixed_duration_seconds
      ? `固定${option.fixed_duration_seconds}秒`
      : undefined,
  ].filter(Boolean)
  return videoMeta.length > 0
    ? `${baseLabel} · ${videoMeta.join(' · ')}`
    : baseLabel
}

function toChipOptions(options: AigcModelOption[]): ChipSelectOption[] {
  return options.map((option) => ({
    value: modelOptionValue(option),
    label: modelOptionLabel(option),
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
): { name: string; url: string } | null {
  const url =
    event.dataTransfer.getData(MATERIAL_URL_MIME) ||
    event.dataTransfer.getData('text/uri-list') ||
    event.dataTransfer.getData('text/plain')
  if (!url) return null
  return {
    url,
    name: event.dataTransfer.getData(MATERIAL_NAME_MIME) || '拖拽素材',
  }
}

function setDraggedMaterial(
  event: DragEvent<HTMLElement>,
  material: { name: string; url?: string }
): void {
  if (!material.url) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(MATERIAL_URL_MIME, material.url)
  event.dataTransfer.setData(MATERIAL_NAME_MIME, material.name)
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
  const materialInputRef = useRef<HTMLInputElement>(null)
  const [activeWorkspace, setActiveWorkspace] = useState<AigcWorkspace>(
    props.initialWorkspace ?? 'studio'
  )
  const [activeModule, setActiveModule] = useState<WorkshopModule>('image')
  const [prompt, setPrompt] = useState('')
  const [referenceImage, setReferenceImage] = useState('')
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
  const [videoSeconds, setVideoSeconds] = useState(5)
  const [videoCount, setVideoCount] = useState(1)
  const [videoReferenceMode, setVideoReferenceMode] = useState<
    'frames' | 'multi'
  >('multi')
  const [resultTab, setResultTab] = useState<'mine' | 'template'>('mine')
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [fixedSeedEnabled, setFixedSeedEnabled] = useState(false)
  const [fixedSeedValue, setFixedSeedValue] = useState(20260705)
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
  const [assetView, setAssetView] = useState<'session' | 'library'>('session')
  const [assetType, setAssetType] = useState<AigcAssetType>('all')
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])

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
  })

  const textModels = useMemo(
    () => modelsResponse?.data?.text ?? [],
    [modelsResponse?.data?.text]
  )
  const imageModels = useMemo(
    () => modelsResponse?.data?.image ?? [],
    [modelsResponse?.data?.image]
  )
  const videoModels = useMemo(
    () => modelsResponse?.data?.video ?? [],
    [modelsResponse?.data?.video]
  )
  const textModelOptions = useMemo(
    () => toChipOptions(textModels),
    [textModels]
  )
  const imageModelOptions = useMemo(
    () => toChipOptions(imageModels),
    [imageModels]
  )
  const videoModelOptions = useMemo(
    () => toChipOptions(videoModels),
    [videoModels]
  )
  const selectedTextOption = selectedModelOption(textModels, textModel)
  const selectedImageOption = selectedModelOption(imageModels, imageModel)
  const selectedVideoOption = selectedModelOption(videoModels, videoModel)
  const selectedTextModel = selectedTextOption?.model ?? ''
  const selectedImageModel = selectedImageOption?.model ?? ''
  const selectedVideoModel = selectedVideoOption?.model ?? ''
  const selectedVideoFixedDuration =
    selectedVideoOption?.fixed_seconds &&
    selectedVideoOption.fixed_duration_seconds
      ? selectedVideoOption.fixed_duration_seconds
      : undefined
  const selectedVideoResolution = selectedVideoOption?.resolution
  const selectedRatio =
    IMAGE_ASPECT_RATIOS.find((ratio) => ratio.value === imageRatio) ??
    IMAGE_ASPECT_RATIOS[1]
  const selectedResolution =
    IMAGE_RESOLUTION_LEVELS.find((level) => level.value === imageResolution) ??
    IMAGE_RESOLUTION_LEVELS[0]
  const computedImageSize =
    imageRatio === 'custom'
      ? `${customImageWidth}x${customImageHeight}`
      : selectedRatio.sizeByResolution[imageResolution]
  const fixedSeedMeta = fixedSeedEnabled ? ` · seed ${fixedSeedValue}` : ''
  const imageMeta = `${t(selectedRatio.labelKey)} · ${t(
    selectedResolution.labelKey
  )} · ${computedImageSize}${fixedSeedMeta}`
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
    mutationFn: async () => {
      if (activeModule === 'commerce') {
        return await executeCommerceSet()
      }
      return await generateSingleImage()
    },
    onSuccess: (newResults) => {
      if (newResults.length === 0) return
      setResults((current) => [...newResults, ...current])
      addMaterialsFromResults(newResults)
      setAssetView('session')
      void refetchAssets()
      toast.success(t('生成请求已提交'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('生成失败'))
    },
  })

  const videoMutation = useMutation({
    mutationFn: generateVideoBatch,
    onSuccess: (newResults) => {
      if (newResults.length === 0) return
      setResults((current) => [...newResults, ...current])
      addMaterialsFromResults(newResults)
      setAssetView('session')
      void refetchAssets()
      toast.success(t('视频任务已提交'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('生成失败'))
    },
  })

  const refreshVideoMutation = useMutation({
    mutationFn: async (result: WorkshopResult) => {
      if (!result.taskId) return result
      const response = await fetchVideoTask(result.taskId)
      const status = normalizeVideoStatus(response.status)
      const directUrl = getVideoUrl(response)
      return {
        ...result,
        status,
        url:
          directUrl ??
          (status === 'succeeded'
            ? `/v1/videos/${result.taskId}/content`
            : result.url),
        meta: response.status ?? result.meta,
      } satisfies WorkshopResult
    },
    onSuccess: (updated) => {
      setResults((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
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
    if (nextMaterials.length === 0) return
    setMaterials((current) => [...nextMaterials, ...current].slice(0, 36))
  }

  function handleMaterialUpload(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    files.forEach((file) => {
      void addUploadedMaterial(file)
    })
  }

  async function addUploadedMaterial(file: File): Promise<void> {
    try {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast.error(t('仅支持上传图片或视频素材'))
        return
      }

      if (
        file.type.startsWith('video/') &&
        file.size > MATERIAL_COMPRESSION_THRESHOLD_BYTES
      ) {
        toast.error(t('视频素材超过 8MB，浏览器端暂不压缩，请先压缩后上传'))
        return
      }

      const materialType: LocalMaterial['type'] = file.type.startsWith('video/')
        ? 'video'
        : 'image'
      let sourceBlob: Blob = file
      let compressed = false

      if (
        file.type.startsWith('image/') &&
        file.size > MATERIAL_COMPRESSION_THRESHOLD_BYTES
      ) {
        sourceBlob = await compressImageFile(file)
        compressed = sourceBlob.size < file.size
      }

      const materialUrl = await readBlobAsDataUrl(sourceBlob)
      const material: LocalMaterial = {
        id: buildResultId('upload'),
        name: file.name,
        type: materialType,
        url: materialUrl,
        source: 'upload',
        createdAt: Date.now(),
      }
      setMaterials((current) => [material, ...current].slice(0, 36))

      if (compressed) {
        toast.success(
          t('已压缩参考图 {{from}} → {{to}}', {
            from: formatFileSize(file.size),
            to: formatFileSize(sourceBlob.size),
          })
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('素材上传失败'))
    }
  }

  function handleTextMaterialDrop(
    event: DragEvent<HTMLElement>,
    onChange: (value: string) => void,
    current: string
  ): void {
    event.preventDefault()
    const material = readDraggedMaterial(event)
    if (!material) return
    onChange(appendTextBlock(current, materialReference(material)))
  }

  function handleReferenceMaterialDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault()
    const material = readDraggedMaterial(event)
    if (!material) return
    setReferenceImage(material.url)
    toast.success(t('已设为视频参考素材'))
  }

  function validateBaseInput(model: string): boolean {
    if (!model) {
      toast.error(t('请先选择模型'))
      return false
    }
    return true
  }

  function buildImagePayload(
    sourcePrompt: string,
    count: number
  ): ImageGenerationPayload {
    const payload: ImageGenerationPayload = {
      model: selectedImageModel,
      prompt: sourcePrompt,
      n: count,
      size: computedImageSize,
      quality: selectedResolution.quality,
      response_format: 'url',
    }
    if (fixedSeedEnabled) {
      payload.seed = fixedSeedValue
    }
    return payload
  }

  async function generateSingleImage(): Promise<WorkshopResult[]> {
    if (!validateBaseInput(selectedImageModel)) return []
    if (!prompt.trim()) {
      toast.error(t('请填写提示词'))
      return []
    }

    const response = await generateImage(
      buildImagePayload(prompt.trim(), imageCount),
      selectedImageOption?.group
    )

    return imageResponseToResults(response, t('图片生成'), prompt)
  }

  async function generateCommercePlan(nextInput?: string): Promise<string> {
    if (!validateBaseInput(selectedTextModel)) return ''
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
    if (!validateBaseInput(selectedImageModel)) return []
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
      const response = await generateImage(
        buildImagePayload(item.prompt, 1),
        selectedImageOption?.group
      )
      const sceneResults = imageResponseToResults(
        response,
        item.title,
        item.prompt
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
    const requestSeconds = selectedVideoOption?.fixed_seconds
      ? '1'
      : String(videoSeconds)
    const displaySeconds =
      selectedVideoOption?.fixed_duration_seconds ?? videoSeconds
    const resolutionMeta = selectedVideoOption?.resolution
      ? `${selectedVideoOption.resolution} · `
      : ''
    const buildPayload = (): VideoGenerationPayload => {
      const payload: VideoGenerationPayload = {
        model: selectedVideoModel,
        prompt: prompt.trim(),
        seconds: requestSeconds,
      }
      if (fixedSeedEnabled) {
        payload.seed = fixedSeedValue
      }
      if (referenceImage.trim()) {
        payload.input_reference = referenceImage.trim()
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
                ? `/v1/videos/${taskId}/content`
                : undefined),
            meta: selectedVideoOption?.fixed_seconds
              ? `${resolutionMeta}${displaySeconds}秒/条 · 固定时长`
              : `${resolutionMeta}${displaySeconds}秒/条`,
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
    sourcePrompt: string
  ): WorkshopResult[] {
    if (response.error?.message) {
      throw new Error(response.error.message)
    }
    return (response.data ?? []).map((item, index) => ({
      id: buildResultId('image'),
      type: 'image',
      status: item.url || item.b64_json ? 'succeeded' : 'processing',
      title,
      prompt: item.revised_prompt || sourcePrompt,
      createdAt: response.created ? response.created * 1000 : Date.now(),
      url:
        item.url ??
        (item.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined),
      meta: `${imageMeta} #${index + 1}`,
    }))
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
      if (checked) return Array.from(new Set([...current, sceneId]))
      return current.filter((item) => item !== sceneId)
    })
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
      void refetchAssets()
    }
  }

  function handleAssetSelection(assetId: string, selected: boolean): void {
    setSelectedAssetIds((current) => {
      if (selected) return Array.from(new Set([...current, assetId]))
      return current.filter((id) => id !== assetId)
    })
  }

  function handleSelectVisibleAssets(): void {
    setSelectedAssetIds(visibleResults.map((result) => result.id))
  }

  const isGenerating =
    imageMutation.isPending ||
    videoMutation.isPending ||
    commercePlanMutation.isPending

  return (
    <div className='relative flex h-full min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_18%_18%,rgba(129,140,248,0.22),transparent_34%),radial-gradient(circle_at_84%_20%,rgba(244,114,182,0.20),transparent_32%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(253,242,248,0.78))] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(99,102,241,0.18),transparent_34%),radial-gradient(circle_at_84%_20%,rgba(190,24,93,0.16),transparent_32%),linear-gradient(135deg,rgba(9,9,11,0.98),rgba(24,24,27,0.96))]'>
      <input
        ref={materialInputRef}
        type='file'
        accept='image/*,video/*'
        multiple
        className='hidden'
        onChange={handleMaterialUpload}
      />
      <aside className='bg-background/88 border-border/60 absolute top-1/2 left-4 z-20 hidden w-[70px] -translate-y-1/2 rounded-[28px] border px-2.5 py-5 shadow-2xl shadow-violet-950/10 backdrop-blur-xl lg:flex lg:flex-col lg:items-center lg:gap-3'>
        {WORKSPACE_DOCK_ITEMS.map((item) => {
          const Icon = item.icon
          const active = activeWorkspace === item.value
          return (
            <button
              key={item.value}
              type='button'
              onClick={() => {
                if (item.locked) {
                  toast.info(t('音乐创作内测中'))
                  return
                }
                openWorkspace(item.value as AigcWorkspace)
              }}
              className={cn(
                'text-muted-foreground hover:bg-muted hover:text-foreground relative flex size-11 items-center justify-center rounded-2xl text-[0px] transition-colors',
                active &&
                  'bg-violet-950 text-white shadow-lg shadow-violet-950/30 hover:bg-violet-950 hover:text-white',
                item.locked && 'opacity-55'
              )}
              title={t(item.title)}
            >
              <Icon className='size-5' />
              {t(item.title)}
              {item.locked ? (
                <span className='bg-muted-foreground/20 absolute top-1 right-1 rounded px-1 text-[10px]'>
                  {t('内测')}
                </span>
              ) : null}
            </button>
          )
        })}
      </aside>

      <main
        className={cn(
          'h-full min-h-0 flex-1 overflow-y-auto overscroll-contain',
          activeWorkspace === 'studio' ? 'p-0' : 'p-4 xl:p-5'
        )}
      >
        {activeWorkspace === 'studio' ? (
          <OriginImageStudio
            activeModule={activeModule}
            prompt={prompt}
            referenceImage={referenceImage}
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
            selectedVideoFixedDuration={selectedVideoFixedDuration}
            selectedVideoResolution={selectedVideoResolution}
            isLoadingModels={isLoadingModels}
            imageRatio={imageRatio}
            imageResolution={imageResolution}
            customImageWidth={customImageWidth}
            customImageHeight={customImageHeight}
            imageCount={imageCount}
            computedImageSize={computedImageSize}
            videoSeconds={videoSeconds}
            videoCount={videoCount}
            videoReferenceMode={videoReferenceMode}
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
            fixedSeedEnabled={fixedSeedEnabled}
            fixedSeedValue={fixedSeedValue}
            refreshVideoPending={refreshVideoMutation.isPending}
            onModuleChange={setActiveModule}
            onPromptChange={setPrompt}
            onCommerceBriefChange={setCommerceBrief}
            onReferenceImageChange={setReferenceImage}
            onImageModelChange={setImageModel}
            onVideoModelChange={setVideoModel}
            onTextModelChange={setTextModel}
            onImageRatioChange={setImageRatio}
            onImageResolutionChange={setImageResolution}
            onCustomImageWidthChange={setCustomImageWidth}
            onCustomImageHeightChange={setCustomImageHeight}
            onImageCountChange={setImageCount}
            onVideoSecondsChange={setVideoSeconds}
            onVideoCountChange={setVideoCount}
            onVideoReferenceModeChange={setVideoReferenceMode}
            onCommerceChatInputChange={setCommerceChatInput}
            onCommercePlanChange={setCommercePlan}
            onSceneToggle={handleSceneToggle}
            onResultTabChange={setResultTab}
            onAdvancedSettingsChange={setShowAdvancedSettings}
            onFixedSeedEnabledChange={setFixedSeedEnabled}
            onFixedSeedValueChange={setFixedSeedValue}
            onUploadClick={() => materialInputRef.current?.click()}
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
        ) : activeWorkspace === 'assets' ? (
          <AssetsWorkspace
            assetType={assetType}
            visibleCount={visibleCount}
            visibleResults={visibleResults}
            isFetchingAssets={isFetchingAssets}
            selectedAssetIds={selectedAssetIds}
            refreshVideoPending={refreshVideoMutation.isPending}
            batchDeletePending={batchDeleteMutation.isPending}
            onAssetTypeChange={setAssetType}
            onRefreshAssets={() => void refetchAssets()}
            onSelectVisibleAssets={handleSelectVisibleAssets}
            onBatchDelete={() => batchDeleteMutation.mutate(selectedAssetIds)}
            onRefreshVideo={(result) => refreshVideoMutation.mutate(result)}
            onRemoveAsset={(result) => deleteAssetMutation.mutate(result.id)}
            onAssetSelection={handleAssetSelection}
            onBackToStudio={() => openWorkspace('studio')}
          />
        ) : activeWorkspace === 'canvas' ? (
          <CanvasWorkspace
            materials={materials}
            results={results}
            selectedCanvasId={props.initialCanvasId}
            onUploadClick={() => materialInputRef.current?.click()}
            onBackToStudio={() => openWorkspace('studio')}
          />
        ) : (
          <PromptGalleryWorkspace
            onUsePrompt={(value) => {
              setPrompt(value)
              openWorkspace('studio')
            }}
          />
        )}
      </main>
    </div>
  )
}

type OriginImageStudioProps = {
  activeModule: WorkshopModule
  prompt: string
  referenceImage: string
  materials: LocalMaterial[]
  imageModels: ChipSelectOption[]
  videoModels: ChipSelectOption[]
  textModels: ChipSelectOption[]
  selectedImageModel: string
  selectedVideoModel: string
  selectedTextModel: string
  selectedImageModelName: string
  selectedVideoFixedDuration?: number
  selectedVideoResolution?: string
  isLoadingModels: boolean
  imageRatio: ImageAspectRatioValue
  imageResolution: ImageResolutionValue
  customImageWidth: number
  customImageHeight: number
  imageCount: number
  computedImageSize: string
  videoSeconds: number
  videoCount: number
  videoReferenceMode: 'frames' | 'multi'
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
  fixedSeedEnabled: boolean
  fixedSeedValue: number
  refreshVideoPending: boolean
  onModuleChange: (value: WorkshopModule) => void
  onPromptChange: (value: string) => void
  onCommerceBriefChange: (value: string) => void
  onReferenceImageChange: (value: string) => void
  onImageModelChange: (value: string) => void
  onVideoModelChange: (value: string) => void
  onTextModelChange: (value: string) => void
  onImageRatioChange: (value: ImageAspectRatioValue) => void
  onImageResolutionChange: (value: ImageResolutionValue) => void
  onCustomImageWidthChange: (value: number) => void
  onCustomImageHeightChange: (value: number) => void
  onImageCountChange: (value: number) => void
  onVideoSecondsChange: (value: number) => void
  onVideoCountChange: (value: number) => void
  onVideoReferenceModeChange: (value: 'frames' | 'multi') => void
  onCommerceChatInputChange: (value: string) => void
  onCommercePlanChange: (value: string) => void
  onSceneToggle: (sceneId: string, checked: boolean) => void
  onResultTabChange: (value: 'mine' | 'template') => void
  onAdvancedSettingsChange: (open: boolean) => void
  onFixedSeedEnabledChange: (enabled: boolean) => void
  onFixedSeedValueChange: (value: number) => void
  onUploadClick: () => void
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

function OriginImageStudio(props: OriginImageStudioProps) {
  const { t } = useTranslation()
  const moduleTitle =
    props.activeModule === 'image'
      ? 'AI 图片工坊'
      : props.activeModule === 'video'
        ? 'AI 视频工坊'
        : '电商套图工坊'
  const moduleSubtitle =
    props.activeModule === 'image'
      ? '用文字创造你的画面'
      : props.activeModule === 'video'
        ? '用文字生成你的电影镜头'
        : '一句话规划整套商品视觉'
  const composerValue =
    props.activeModule === 'commerce' ? props.commerceBrief : props.prompt
  const composerPlaceholder =
    props.activeModule === 'image'
      ? '镜头'
      : props.activeModule === 'video'
        ? '一'
        : '生成电商套图，我要卖的'
  const selectedRatio =
    IMAGE_ASPECT_RATIOS.find((ratio) => ratio.value === props.imageRatio) ??
    IMAGE_ASPECT_RATIOS[0]
  const selectedResolution =
    IMAGE_RESOLUTION_LEVELS.find(
      (level) => level.value === props.imageResolution
    ) ?? IMAGE_RESOLUTION_LEVELS[0]
  const videoDisplaySeconds =
    props.selectedVideoFixedDuration ?? props.videoSeconds
  const videoResolutionLabel = props.selectedVideoResolution ?? '模型内置'
  const estimate =
    props.activeModule === 'video'
      ? `¥${(videoDisplaySeconds * props.videoCount * 0.7).toFixed(1)}`
      : props.activeModule === 'image'
        ? `¥${(
            imagePriceByResolution(props.imageResolution) * props.imageCount
          ).toFixed(2)}`
        : ''
  const primaryLabel =
    props.activeModule === 'commerce' && !props.commerceEditorOpen
      ? '开始编辑'
      : props.activeModule === 'image'
        ? '开始生成'
        : buttonLabel(props.activeModule, props.commercePlan)

  return (
    <div className='relative min-h-full overflow-visible px-4 pt-10 pb-12 lg:pl-28'>
      <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.42),rgba(255,255,255,0.08))]' />
      <section className='relative mx-auto flex w-full max-w-6xl flex-col items-center'>
        <div className='text-center'>
          <h1 className='text-4xl leading-tight font-light tracking-normal text-violet-700 md:text-5xl dark:text-violet-200'>
            <span className='text-violet-400'>✦</span> {t(moduleTitle)}{' '}
            <span className='text-violet-400'>✦</span>
          </h1>
          <p className='text-muted-foreground mt-4 text-sm tracking-normal'>
            <span className='text-amber-500'>•</span> {t(moduleSubtitle)}{' '}
            <span className='text-amber-500'>•</span>
          </p>
        </div>

        <div className='bg-background/78 border-border/70 mt-8 inline-flex rounded-full border p-1 shadow-xl shadow-violet-950/10 backdrop-blur-xl'>
          {WORKSHOP_MODULES.map((module) => {
            const Icon = MODULE_ICON[module.value]
            const active = props.activeModule === module.value
            return (
              <button
                key={module.value}
                type='button'
                onClick={() => props.onModuleChange(module.value)}
                className={cn(
                  'text-muted-foreground hover:text-foreground flex h-10 min-w-[132px] items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-all',
                  active &&
                    'bg-violet-950 text-white shadow-lg shadow-violet-950/30 hover:text-white'
                )}
              >
                <Icon className='size-4' />
                {module.value === 'video' ? '🎬 ' : null}
                {t(module.titleKey)}
              </button>
            )
          })}
          <button
            type='button'
            onClick={() => toast.info(t('音乐创作内测中'))}
            className='text-muted-foreground hover:text-foreground flex h-10 min-w-[132px] items-center justify-center gap-2 rounded-full px-4 text-sm font-medium opacity-60 transition-all'
            title={t('音乐创作内测中')}
          >
            <Film className='size-4' />
            {t('音乐创作')}
            <span className='text-xs'>🔒</span>
          </button>
        </div>

        <div className='bg-background/86 border-border/70 mt-7 w-full max-w-[880px] rounded-[28px] border p-6 shadow-2xl shadow-violet-950/12 backdrop-blur-2xl'>
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
              className='border-border/80 bg-background/80 min-h-[72px] resize-none rounded-xl text-base leading-7 shadow-inner'
              placeholder={t(composerPlaceholder)}
            />
          </div>

          {props.activeModule === 'video' ? (
            <div className='mt-3 flex flex-wrap items-center gap-2'>
              <button
                type='button'
                onClick={() => props.onVideoReferenceModeChange('frames')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-colors',
                  props.videoReferenceMode === 'frames'
                    ? 'border-violet-950 bg-violet-950 text-white'
                    : 'border-border bg-background/70 text-muted-foreground'
                )}
              >
                {t('首帧 / 尾帧')}
              </button>
              <button
                type='button'
                onClick={() => props.onVideoReferenceModeChange('multi')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-colors',
                  props.videoReferenceMode === 'multi'
                    ? 'border-violet-950 bg-violet-950 text-white'
                    : 'border-border bg-background/70 text-muted-foreground'
                )}
              >
                {t('多参考图')}
              </button>
            </div>
          ) : null}

          {props.activeModule !== 'commerce' ? (
            <div
              className='mt-3 flex min-h-16 items-center gap-3'
              onDragOver={(event) => event.preventDefault()}
              onDrop={props.onReferenceMaterialDrop}
            >
              <button
                type='button'
                onClick={props.onUploadClick}
                className='border-border text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-xl border border-dashed text-2xl transition-colors hover:border-violet-400 hover:text-violet-700'
                title={t('上传参考图')}
              >
                +
              </button>
              {props.referenceImage ? (
                <div className='border-border bg-background/80 flex h-14 max-w-52 items-center gap-2 rounded-xl border px-2 text-xs'>
                  <FileImage className='size-4 shrink-0 text-violet-700' />
                  <span className='truncate'>{props.referenceImage}</span>
                </div>
              ) : null}
              {props.materials.slice(0, 4).map((material) => (
                <button
                  key={material.id}
                  type='button'
                  draggable
                  onDragStart={(event) => setDraggedMaterial(event, material)}
                  onClick={() => props.onReferenceImageChange(material.url)}
                  className='border-border bg-background/80 h-14 w-20 overflow-hidden rounded-xl border'
                  title={material.name}
                >
                  {material.type === 'video' ? (
                    <video
                      src={material.url}
                      className='h-full w-full object-cover'
                      muted
                    />
                  ) : (
                    <img
                      src={material.url}
                      alt={material.name}
                      className='h-full w-full object-cover'
                    />
                  )}
                </button>
              ))}
              <span className='text-muted-foreground text-xs'>
                {props.activeModule === 'image'
                  ? t('可选参考图，最多 16 张 · 超 8MB 自动压缩 · Ctrl+V 粘贴')
                  : t('图片超 8MB 自动压缩，视频需先压缩')}
              </span>
            </div>
          ) : null}

          <div className='border-border/70 mt-4 flex flex-wrap items-center gap-2 border-t pt-4'>
            {props.activeModule === 'video' ? (
              <>
                <span className='border-border bg-background/75 rounded-full border px-3 py-2 text-sm'>
                  {t('比例')} <strong>9:16</strong>
                </span>
                <ChipSelect
                  label={t('视频模型')}
                  value={props.selectedVideoModel}
                  disabled={props.isLoadingModels}
                  options={props.videoModels}
                  onChange={props.onVideoModelChange}
                />
                <span className='border-border bg-background/75 rounded-full border px-3 py-2 text-sm'>
                  9:16 · {videoResolutionLabel} ·{' '}
                  {props.selectedVideoFixedDuration
                    ? `${props.selectedVideoFixedDuration}${t('秒/条')} · ${t('固定时长')}`
                    : `${props.videoSeconds}${t('秒/条')}`}{' '}
                  · {props.videoCount}
                  {t('条')}
                </span>
                {props.selectedVideoFixedDuration ? (
                  <span className='border-border bg-background/75 text-muted-foreground rounded-full border px-3 py-2 text-xs'>
                    {t('模型名含 15s，按条生成')}
                  </span>
                ) : (
                  <div className='border-border bg-background/75 flex rounded-full border p-1'>
                    {VIDEO_SECONDS_OPTIONS.map((seconds) => (
                      <button
                        key={seconds}
                        type='button'
                        onClick={() => props.onVideoSecondsChange(seconds)}
                        className={cn(
                          'h-8 rounded-full px-3 text-xs transition-colors',
                          props.videoSeconds === seconds &&
                            'bg-violet-950 text-white'
                        )}
                      >
                        {seconds}
                        {t('秒/条')}
                      </button>
                    ))}
                  </div>
                )}
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
                  className='h-9 w-20 rounded-full'
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
                {IMAGE_RESOLUTION_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    type='button'
                    onClick={() => props.onImageResolutionChange(level.value)}
                    className={cn(
                      'h-9 min-w-11 rounded-full border px-3 text-sm transition-all',
                      props.imageResolution === level.value
                        ? 'border-violet-950 bg-violet-950 text-white shadow-lg shadow-violet-950/30'
                        : 'border-border bg-background/75 text-muted-foreground hover:text-foreground'
                    )}
                    title={`${t(level.labelKey)} · ${props.selectedImageModelName}`}
                  >
                    {level.value.toUpperCase()}
                  </button>
                ))}
                {props.activeModule === 'image' ? (
                  <div className='border-border bg-background/75 flex h-9 items-center gap-3 rounded-full border px-3'>
                    <span className='text-sm'>{t('数量')}</span>
                    <input
                      type='range'
                      min={1}
                      max={4}
                      value={props.imageCount}
                      onChange={(event) =>
                        props.onImageCountChange(
                          clampInteger(event.target.value, 1, 4)
                        )
                      }
                      className='accent-violet-950'
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
                'h-9 rounded-full border px-3 text-sm transition-all',
                props.showAdvancedSettings
                  ? 'border-violet-950 bg-violet-950 text-white shadow-lg shadow-violet-950/30'
                  : 'border-border bg-background/75 text-muted-foreground hover:text-foreground'
              )}
            >
              <Settings2 className='mr-1 inline size-4' />
              {t('更多设置')}
            </button>

            {estimate ? (
              <span className='text-muted-foreground ml-auto text-xs'>
                {t('预计')}{' '}
                <strong className='text-amber-500'>{estimate}</strong>
              </span>
            ) : (
              <span className='ml-auto' />
            )}

            <Button
              onClick={props.onPrimaryAction}
              disabled={props.isGenerating}
              className='rounded-full bg-violet-950 px-7 text-white shadow-lg shadow-violet-950/25 hover:bg-violet-900'
            >
              {props.isGenerating ? (
                <Loader2 className='animate-spin' />
              ) : props.activeModule === 'commerce' &&
                props.commerceEditorOpen &&
                props.commercePlan.trim() ? (
                <Play data-icon='inline-start' />
              ) : (
                <Send data-icon='inline-start' />
              )}
              {t(primaryLabel)}
            </Button>
          </div>

          <div className='text-muted-foreground mt-2 text-xs'>
            {t(selectedRatio.descriptionKey)} ·{' '}
            {selectedResolution.value.toUpperCase()} · {props.computedImageSize}
          </div>

          {props.showAdvancedSettings ? (
            <div className='border-border/70 bg-background/72 mt-4 rounded-2xl border p-4'>
              <AigcSwitch
                label={t('风控保障（待接入）')}
                description={t('当前生成仍按后台原有计费和失败处理规则执行')}
                checked={false}
                disabled
              />
              <AigcSwitch
                label={t('公开到广场（已关闭）')}
                description={t(
                  '当前不公开作品，资料库素材默认 24 小时后自动清理'
                )}
                checked={false}
                disabled
              />
              <AigcSwitch
                label={t('固定参数')}
                description={
                  props.fixedSeedEnabled
                    ? t('已固定 seed，便于同模型同参数复现')
                    : t('开启后向支持 seed 的模型提交固定随机种子')
                }
                checked={props.fixedSeedEnabled}
                onCheckedChange={props.onFixedSeedEnabledChange}
              />
              {props.fixedSeedEnabled ? (
                <div className='border-border/70 bg-muted/30 mt-3 rounded-2xl border p-3'>
                  <div className='flex flex-wrap items-end gap-3'>
                    <label className='min-w-52 flex-1 space-y-1'>
                      <span className='text-muted-foreground text-xs'>
                        {t('随机种子')}
                      </span>
                      <Input
                        type='number'
                        min={FIXED_SEED_MIN}
                        max={FIXED_SEED_MAX}
                        value={props.fixedSeedValue}
                        onChange={(event) =>
                          props.onFixedSeedValueChange(
                            clampInteger(
                              event.target.value,
                              FIXED_SEED_MIN,
                              FIXED_SEED_MAX
                            )
                          )
                        }
                        className='bg-background h-9 rounded-xl'
                      />
                    </label>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className='h-9 rounded-xl'
                      onClick={() =>
                        props.onFixedSeedValueChange(randomFixedSeed())
                      }
                    >
                      <RefreshCw data-icon='inline-start' />
                      {t('随机')}
                    </Button>
                  </div>
                  <p className='text-muted-foreground mt-2 text-xs'>
                    {t(
                      '固定 seed 只对支持该参数的模型生效；如果上游不支持，请关闭该开关后重试。'
                    )}
                  </p>
                </div>
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

        <section className='mt-12 w-full max-w-7xl'>
          <div className='border-border/80 flex items-center gap-8 border-b'>
            <button
              type='button'
              onClick={() => props.onResultTabChange('mine')}
              className={cn(
                'border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
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
                'border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
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
              className='ml-auto'
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
          ) : props.results.length === 0 ? (
            <div className='text-muted-foreground flex min-h-60 flex-col items-center justify-center gap-3 text-center'>
              <div className='text-4xl'>
                {props.activeModule === 'video'
                  ? '🎬'
                  : props.activeModule === 'commerce'
                    ? '🧩'
                    : '🖼️'}
              </div>
              <div className='text-foreground text-sm font-medium'>
                {props.activeModule === 'video'
                  ? t('暂无视频作品')
                  : props.activeModule === 'commerce'
                    ? t('准备规划你的套图')
                    : t('准备开始你的创作')}
              </div>
              <p className='max-w-sm text-xs'>
                {props.activeModule === 'video'
                  ? t('输入描述并上传参考图，开始创作视频')
                  : props.activeModule === 'commerce'
                    ? t('输入商品和场景需求，直接生成一套不同用途的图片')
                    : t('输入提示词，让 AI 为你生成画面')}
              </p>
            </div>
          ) : (
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
          )}
        </section>
      </section>
    </div>
  )
}

function normalizeCustomImageDimension(value: string): number {
  return clampInteger(value, CUSTOM_IMAGE_SIZE_MIN, CUSTOM_IMAGE_SIZE_MAX)
}

function ratioPreviewAspect(
  value: ImageAspectRatioValue,
  customWidth: number,
  customHeight: number
): string {
  if (value === 'landscape') return '16 / 9'
  if (value === 'portrait') return '9 / 16'
  if (value === 'custom') return `${customWidth} / ${customHeight}`
  if (value.includes(':')) return value.replace(':', ' / ')
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
            className='border-border bg-background/75 hover:bg-background flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors'
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
        className='border-border/80 max-h-[min(78svh,640px)] w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-3xl p-4 shadow-2xl shadow-violet-950/15'
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
  return (
    <label className='border-border bg-background/75 flex h-9 items-center gap-2 rounded-full border px-3 text-sm'>
      <span className='text-muted-foreground'>{props.label}</span>
      <NativeSelect
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className='h-7 w-auto min-w-24 border-0 bg-transparent px-0 py-0 text-sm font-semibold shadow-none focus-visible:ring-0'
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
            props.commerceMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
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

function imagePriceByResolution(resolution: ImageResolutionValue): number {
  if (resolution === '4k') return 0.15
  if (resolution === '2k') return 0.1
  return 0.05
}

function AssetsWorkspace(props: {
  assetType: AigcAssetType
  visibleCount: number
  visibleResults: WorkshopResult[]
  isFetchingAssets: boolean
  selectedAssetIds: string[]
  refreshVideoPending: boolean
  batchDeletePending: boolean
  onAssetTypeChange: (type: AigcAssetType) => void
  onRefreshAssets: () => void
  onSelectVisibleAssets: () => void
  onBatchDelete: () => void
  onRefreshVideo: (result: WorkshopResult) => void
  onRemoveAsset: (result: WorkshopResult) => void
  onAssetSelection: (assetId: string, selected: boolean) => void
  onBackToStudio: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className='mx-auto flex min-h-full w-full max-w-7xl flex-col gap-4'>
      <div className='border-border bg-background rounded-lg border p-4 shadow-sm'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-lg font-semibold'>
              <Library className='size-5' />
              {t('我的资产')}
            </div>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                '生成素材默认保留 24 小时，可拖拽回工坊、画布或提示词继续复用。'
              )}
            </p>
          </div>
          <Button variant='outline' onClick={props.onBackToStudio}>
            <Sparkles data-icon='inline-start' />
            {t('返回工坊')}
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
        standalone
        onAssetViewChange={() => undefined}
        onAssetTypeChange={props.onAssetTypeChange}
        onRefreshAssets={props.onRefreshAssets}
        onSelectVisibleAssets={props.onSelectVisibleAssets}
        onBatchDelete={props.onBatchDelete}
        onClearSession={() => undefined}
        onRefreshVideo={props.onRefreshVideo}
        onRemoveAsset={props.onRemoveAsset}
        onAssetSelection={props.onAssetSelection}
      />
    </div>
  )
}

function CanvasWorkspace(props: {
  materials: LocalMaterial[]
  results: WorkshopResult[]
  selectedCanvasId?: string
  onUploadClick: () => void
  onBackToStudio: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [canvasItems, setCanvasItems] = useState([
    {
      id: props.selectedCanvasId ?? 'default',
      title: '未命名画布',
      count: props.results.length,
      expires: '3天后删除',
    },
  ])
  const activeCanvasId =
    props.selectedCanvasId ?? canvasItems[0]?.id ?? 'default'

  return (
    <div className='mx-auto grid min-h-full w-full max-w-7xl gap-4 xl:grid-cols-[360px_1fr]'>
      <section className='border-border bg-background rounded-lg border p-4 shadow-sm'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-lg font-semibold'>
              <Layers3 className='size-5' />
              {t('无限画布')}
            </div>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('创建画布，自由组合 AI 生成的图片。')}
            </p>
          </div>
          <Button
            size='sm'
            onClick={() =>
              setCanvasItems((current) => [
                {
                  id: buildResultId('canvas'),
                  title: `画布 ${current.length + 1}`,
                  count: 0,
                  expires: '3天后删除',
                },
                ...current,
              ])
            }
          >
            <Plus data-icon='inline-start' />
            {t('新建画布')}
          </Button>
        </div>

        <div className='mt-4 space-y-2'>
          <div className='text-muted-foreground text-xs'>
            {t('我的画布')} · {canvasItems.length} {t('个画布')}
          </div>
          {canvasItems.map((item) => (
            <button
              key={item.id}
              type='button'
              onClick={() =>
                void navigate({
                  to: '/canvas/$canvasId',
                  params: { canvasId: item.id },
                })
              }
              className={cn(
                'border-border hover:border-foreground/40 flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors',
                activeCanvasId === item.id
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-muted/20'
              )}
            >
              <span>
                <span className='block text-sm font-medium'>{item.title}</span>
                <span className='text-muted-foreground text-xs'>
                  {item.count} {t('张图片')} · {t(item.expires)}
                </span>
              </span>
              <Layers3 className='text-muted-foreground size-4' />
            </button>
          ))}
        </div>

        <div className='mt-4 flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' onClick={props.onUploadClick}>
            <Upload data-icon='inline-start' />
            {t('上传素材')}
          </Button>
          <Button variant='ghost' size='sm' onClick={props.onBackToStudio}>
            {t('返回工坊')}
          </Button>
        </div>
      </section>

      <section className='border-border bg-background relative min-h-[680px] overflow-hidden rounded-lg border shadow-sm'>
        <div className='absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.45)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.45)_1px,transparent_1px)] bg-[size:32px_32px]' />
        <div className='relative flex h-full flex-col p-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <div className='text-sm font-semibold'>
                {t('画布工作区')} ·{' '}
                {canvasItems.find((item) => item.id === activeCanvasId)
                  ?.title ?? t('未命名画布')}
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('拖入素材后可作为商品套图、参考图和方案草稿的组织面板。')}
              </p>
            </div>
            <Badge variant='outline'>
              {props.materials.length + props.results.length}
              {t('个素材')}
            </Badge>
          </div>

          <div className='mt-4 grid auto-rows-min gap-3 sm:grid-cols-2 xl:grid-cols-3'>
            {[...props.materials, ...resultToMaterials(props.results)].map(
              (material) => (
                <div
                  key={material.id}
                  draggable
                  onDragStart={(event) => setDraggedMaterial(event, material)}
                  className='border-border bg-background/95 overflow-hidden rounded-md border shadow-sm'
                >
                  <div className='bg-muted flex aspect-video items-center justify-center overflow-hidden'>
                    {material.type === 'video' ? (
                      <video
                        src={material.url}
                        className='h-full w-full object-cover'
                        muted
                      />
                    ) : (
                      <img
                        src={material.url}
                        alt={material.name}
                        className='h-full w-full object-cover'
                      />
                    )}
                  </div>
                  <div className='p-2 text-xs font-medium'>{material.name}</div>
                </div>
              )
            )}
          </div>

          {props.materials.length === 0 && props.results.length === 0 ? (
            <div className='text-muted-foreground bg-background/80 m-auto max-w-sm rounded-lg border border-dashed p-6 text-center text-sm'>
              {t('当前画布暂无素材。先在工坊生成或上传素材，再回到画布整理。')}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function PromptGalleryWorkspace(props: {
  onUsePrompt: (value: string) => void
}) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const prompts = [
    {
      title: '高转化商品主图',
      tag: '电商',
      prompt:
        '为一款高端便携式咖啡机生成电商主图，白色干净背景，高级棚拍布光，突出金属材质和小体积便携卖点，画面留出平台裁切安全边距。',
    },
    {
      title: '小红书生活方式图',
      tag: '社媒',
      prompt:
        '真实家居厨房清晨场景，柔和自然光，年轻用户正在使用便携咖啡机，画面温暖但不过度滤镜，适合小红书种草封面。',
    },
    {
      title: '详情页卖点图',
      tag: '详情页',
      prompt:
        '电商详情页卖点视觉，突出快速萃取、易清洗、轻便收纳三个核心优势，构图预留右侧中文文案区域，不直接生成文字。',
    },
    {
      title: '竖版视频首帧',
      tag: '视频',
      prompt:
        '9:16 竖版短视频首帧，商品位于画面中心，桌面有咖啡豆和玻璃杯，道具简洁，光线从左侧进入，适合后续生成 5 秒产品展示视频。',
    },
  ]
  const visiblePrompts = prompts.filter((item) => {
    const haystack = `${item.title} ${item.tag} ${item.prompt}`
    return haystack.includes(keyword.trim())
  })

  return (
    <div className='mx-auto flex min-h-full w-full max-w-7xl flex-col gap-4'>
      <div className='border-border bg-background rounded-lg border p-4 shadow-sm'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-lg font-semibold'>
              <MessageSquare className='size-5' />
              {t('提示词广场')}
            </div>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('沉淀常用图片、视频和电商套图提示词，一键带回工坊继续编辑。')}
            </p>
          </div>
          <div className='relative w-full sm:w-72'>
            <Search className='text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2' />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className='pl-8'
              placeholder={t('搜索提示词')}
            />
          </div>
        </div>
      </div>

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        {visiblePrompts.map((item) => (
          <article
            key={item.title}
            className='border-border bg-background flex min-h-56 flex-col rounded-lg border p-4 shadow-sm'
          >
            <div className='flex items-center justify-between gap-2'>
              <h3 className='text-sm font-semibold'>{t(item.title)}</h3>
              <Badge variant='outline'>{t(item.tag)}</Badge>
            </div>
            <p className='text-muted-foreground mt-3 line-clamp-6 text-xs leading-5'>
              {item.prompt}
            </p>
            <Button
              className='mt-auto'
              size='sm'
              onClick={() => props.onUsePrompt(item.prompt)}
            >
              <Send data-icon='inline-start' />
              {t('带回工坊')}
            </Button>
          </article>
        ))}
      </div>
    </div>
  )
}

function buttonLabel(module: WorkshopModule, plan: string): string {
  if (module === 'commerce' && plan.trim()) return '执行套图生成'
  if (module === 'commerce') return '生成套图方案'
  if (module === 'video') return '生成视频'
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
  standalone?: boolean
  onAssetViewChange: (view: 'session' | 'library') => void
  onAssetTypeChange: (type: AigcAssetType) => void
  onRefreshAssets: () => void
  onSelectVisibleAssets: () => void
  onBatchDelete: () => void
  onClearSession: () => void
  onRefreshVideo: (result: WorkshopResult) => void
  onRemoveAsset: (result: WorkshopResult) => void
  onAssetSelection: (assetId: string, selected: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <section className='border-border bg-background flex min-h-[680px] flex-col overflow-hidden rounded-lg border shadow-sm'>
      <div className='border-border flex shrink-0 flex-col gap-3 border-b p-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-sm font-semibold'>
              <Package className='size-4' />
              {props.assetView === 'library' ? t('资料库') : t('生成结果')}
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {props.assetView === 'library'
                ? t('{{count}} 个素材 · 默认保留 24 小时', {
                    count: props.visibleCount,
                  })
                : t('{{count}} 个本次结果', { count: props.visibleCount })}
            </p>
          </div>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('刷新资料库')}
            onClick={props.onRefreshAssets}
            disabled={props.isFetchingAssets}
          >
            <RefreshCw
              className={cn(props.isFetchingAssets && 'animate-spin')}
            />
          </Button>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
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
                  props.onRefreshAssets()
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
                onClick={props.onSelectVisibleAssets}
                disabled={props.visibleResults.length === 0}
              >
                {t('全选')}
              </Button>
              <Button
                variant='destructive'
                size='sm'
                onClick={props.onBatchDelete}
                disabled={
                  props.selectedAssetIds.length === 0 ||
                  props.batchDeletePending
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
                ? t('生成成功后的图片和视频任务会在 24 小时内显示在这里。')
                : t('提交生成后，本次结果会先显示在这里。')}
            </div>
          </div>
        </div>
      ) : (
        <div className='grid flex-1 auto-rows-min gap-3 overflow-auto p-4 md:grid-cols-2 2xl:grid-cols-3'>
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
  const result = props.result
  const isVideo = result.type === 'video'
  let statusLabel = t('处理中')
  if (result.status === 'succeeded') statusLabel = t('已成功')
  if (result.status === 'failed') statusLabel = t('失败')

  return (
    <article
      draggable={!!result.url}
      onDragStart={(event) =>
        setDraggedMaterial(event, {
          name: result.title,
          url: result.url,
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
            className='bg-background absolute top-2 left-2 z-10'
          />
        ) : null}
        {result.url && result.status === 'succeeded' ? (
          isVideo ? (
            <video
              src={result.url}
              controls
              className='h-full w-full object-cover'
            />
          ) : (
            <img
              src={result.url}
              alt={result.title}
              className='h-full w-full object-cover'
            />
          )
        ) : (
          <div className='text-muted-foreground flex flex-col items-center gap-2 text-xs'>
            {result.status === 'failed' ? (
              <Trash2 className='size-5' />
            ) : (
              <Loader2 className='size-5 animate-spin' />
            )}
            {statusLabel}
          </div>
        )}
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
                aria-label={t('下载')}
                onClick={() => window.open(result.url, '_blank', 'noopener')}
              >
                <Download />
              </Button>
            </>
          ) : null}
          {props.onRemove ? (
            <Button
              variant='ghost'
              size='icon-sm'
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

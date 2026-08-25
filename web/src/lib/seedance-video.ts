import {
  modelOptionName,
  resolveModelRequestConfig,
  type AiConfig,
} from '@/stores/use-config-store'
import type { ReferenceImage } from '@/types/image'
import type { ReferenceAudio, ReferenceVideo } from '@/types/media'

export const SEEDANCE_REFERENCE_LIMITS = {
  images: 30,
  videos: 10,
  audios: 10,
  total: 50,
  imageMaxBytes: 30 * 1024 * 1024,
  videoMaxBytes: 50 * 1024 * 1024,
  audioMaxBytes: 15 * 1024 * 1024,
}

export type SeedanceVideoModelConstraints = {
  hasDurationSuffix: boolean
  maxSeconds?: number
  fixedSeconds: boolean
  fixedPrice: boolean
  requiredImages: number
  maxReferenceImages: number
  maxReferenceVideos: number
  maxReferenceAudios: number
  maxReferenceVideoDurationSeconds: number
  maxDirectSeconds: number
  disableVideoReferences: boolean
  dropVideoReferences: boolean
  disableAudioReferences: boolean
  resolution?: string
}

type SeedanceReferenceLimits = Pick<
  SeedanceVideoModelConstraints,
  | 'maxReferenceImages'
  | 'maxReferenceVideos'
  | 'maxReferenceAudios'
  | 'fixedPrice'
>

const defaultSeedanceReferenceLimits: SeedanceReferenceLimits = {
  maxReferenceImages: 9,
  maxReferenceVideos: 3,
  maxReferenceAudios: 3,
  fixedPrice: false,
}

const seedanceReferenceLimitsByModel = new Map<
  string,
  Partial<SeedanceReferenceLimits>
>([
  ['seedance2.0 720p-fast', { maxReferenceImages: 4 }],
  ['seedance2.0 720p-pro', { maxReferenceImages: 9 }],
  ['破甲seedance 720p-fast', { maxReferenceImages: 9 }],
  [
    'cc-seedance2.0 480p-fast-nsp',
    { maxReferenceImages: 9, maxReferenceVideos: 0 },
  ],
  ['cc-seedance2.0 480p-nsp', { maxReferenceImages: 9, maxReferenceVideos: 0 }],
  ['mg-seedance2.0 -480p', { maxReferenceImages: 4, maxReferenceAudios: 1 }],
  [
    'mg-seedance2.0 -480p fast',
    { maxReferenceImages: 4, maxReferenceAudios: 1 },
  ],
  [
    'mg-seedance2.0 -480p mini',
    { maxReferenceImages: 4, maxReferenceAudios: 1 },
  ],
  [
    'mg-seedance2.0 -720p fast',
    { maxReferenceImages: 4, maxReferenceAudios: 1 },
  ],
  [
    'mg-seedance2.0 -720p mini',
    { maxReferenceImages: 4, maxReferenceAudios: 1 },
  ],
  [
    'mg-seedance2.0 -720p pro',
    { maxReferenceImages: 4, maxReferenceAudios: 1 },
  ],
  [
    'mg-seedance2.0 -480p-fast-gz-15s',
    { maxReferenceImages: 9, fixedPrice: true },
  ],
  ['mg-seedance2.0 -480p-gz-15s', { maxReferenceImages: 9, fixedPrice: true }],
  [
    'mg-seedance2.0 -720p-fast-gz-15s',
    { maxReferenceImages: 9, fixedPrice: true },
  ],
  ['mg-seedance2.0 -720p-gz-15s', { maxReferenceImages: 9, fixedPrice: true }],
  [
    'mg-seedance2.0 -720p-mini-gz-15s',
    { maxReferenceImages: 9, fixedPrice: true },
  ],
  [
    'xx-seedance 1080p-pro-nyp-15s',
    { maxReferenceImages: 9, maxReferenceAudios: 0, fixedPrice: true },
  ],
  [
    'xx-seedance 720p-fast-nyp-15s',
    { maxReferenceImages: 9, maxReferenceAudios: 0, fixedPrice: true },
  ],
  [
    'xx-seedance 720p-mini-nyp-15s',
    { maxReferenceImages: 9, maxReferenceAudios: 0, fixedPrice: true },
  ],
  [
    'xx-seedance 720p-pro-nyp-15s',
    { maxReferenceImages: 9, maxReferenceAudios: 0, fixedPrice: true },
  ],
])

export const seedanceResolutionOptions = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
] as const

export const seedanceRatioOptions = [
  { value: '16:9', label: '横屏' },
  { value: '9:16', label: '竖屏' },
  { value: '1:1', label: '方形' },
  { value: '4:3', label: '标准横屏' },
  { value: '3:4', label: '标准竖屏' },
  { value: '21:9', label: '宽银幕' },
  { value: 'adaptive', label: '自适应' },
] as const

export const seedanceDurationOptions = [-1, 5, 6, 8, 10, 12, 15] as const

export const seedance25DurationOptions = [
  -1, 5, 6, 8, 10, 12, 15, 20, 25, 30,
] as const

const seedancePixels = {
  '480p': {
    '16:9': '864x496',
    '4:3': '752x560',
    '1:1': '640x640',
    '3:4': '560x752',
    '9:16': '496x864',
    '21:9': '992x432',
  },
  '720p': {
    '16:9': '1280x720',
    '4:3': '1112x834',
    '1:1': '960x960',
    '3:4': '834x1112',
    '9:16': '720x1280',
    '21:9': '1470x630',
  },
  '1080p': {
    '16:9': '1920x1080',
    '4:3': '1664x1248',
    '1:1': '1440x1440',
    '3:4': '1248x1664',
    '9:16': '1080x1920',
    '21:9': '2206x946',
  },
} as const

export function isSeedanceVideoConfig(
  config: AiConfig | Pick<AiConfig, 'model' | 'videoModel' | 'baseUrl'>
) {
  const requestConfig =
    'channels' in config
      ? resolveModelRequestConfig(config, config.model || config.videoModel)
      : config
  return (
    isSeedanceVideoModel(
      modelOptionName(requestConfig.model || requestConfig.videoModel)
    ) || isArkPlanBaseUrl(requestConfig.baseUrl)
  )
}

export function isSeedanceVideoModel(model: string) {
  const value = model.toLowerCase()
  return value.includes('seedance') || value.includes('doubao-seedance')
}

export function isSeedanceFastModel(model: string) {
  const value = model.toLowerCase()
  return isSeedanceVideoModel(value) && value.includes('fast')
}

export function parseSeedanceVideoModelConstraints(
  model: string
): SeedanceVideoModelConstraints {
  const modelKey = normalizeModelConstraintKey(model)
  const isSeedance25 = modelKey.includes('seedance-2.5')
  const limits = {
    ...defaultSeedanceReferenceLimits,
    ...(isSeedance25
      ? {
          maxReferenceImages: SEEDANCE_REFERENCE_LIMITS.images,
          maxReferenceVideos: SEEDANCE_REFERENCE_LIMITS.videos,
          maxReferenceAudios: SEEDANCE_REFERENCE_LIMITS.audios,
        }
      : {}),
    ...seedanceReferenceLimitsForModel(modelKey),
  }
  const durationMatch = model.match(/(?:^|[-_\s])(\d+)s(?:$|[-_\s])/i)
  const imageCountMatch = model.match(/(?:^|[-_\s])(\d+)img(?:$|[-_\s])/i)
  const resolutionMatch = model.match(/(?:^|[-_\s])(\d+p)(?:$|[-_\s])/i)
  const fixedSeconds = /(?:^|[-_\s])gz(?:$|[-_\s])/i.test(model)
  const fixedPrice = fixedSeconds || /-(?:15|30)s/i.test(model)
  const dropVideoReferences = /(?:^|[-_\s])nv(?:$|[-_\s])/i.test(model)
  const disableVideoReferences =
    dropVideoReferences || limits.maxReferenceVideos === 0
  const maxReferenceVideos = disableVideoReferences
    ? 0
    : limits.maxReferenceVideos

  return {
    hasDurationSuffix: Boolean(durationMatch),
    maxSeconds: durationMatch ? Number(durationMatch[1]) : undefined,
    fixedSeconds,
    fixedPrice: fixedPrice || limits.fixedPrice,
    requiredImages: imageCountMatch ? Number(imageCountMatch[1]) : 0,
    maxReferenceImages: limits.maxReferenceImages,
    maxReferenceVideos,
    maxReferenceAudios: limits.maxReferenceAudios,
    maxReferenceVideoDurationSeconds: isSeedance25 ? 29 : 15,
    maxDirectSeconds: isSeedance25 ? 30 : 15,
    disableVideoReferences,
    dropVideoReferences,
    disableAudioReferences: limits.maxReferenceAudios === 0,
    resolution: resolutionMatch?.[1]?.toLowerCase(),
  }
}

function seedanceReferenceLimitsForModel(modelKey: string) {
  const exact = seedanceReferenceLimitsByModel.get(modelKey)
  if (exact) return exact

  let baseKey = modelKey
  while (true) {
    const trimmed = baseKey.replace(/(?:[-_\s]+(?:\d+s|gz))$/i, '').trim()
    if (trimmed === baseKey) break
    baseKey = trimmed
  }
  return seedanceReferenceLimitsByModel.get(baseKey)
}

function normalizeModelConstraintKey(model: string) {
  return model.trim().toLowerCase().replaceAll(/\s+/g, ' ')
}

export function isArkPlanBaseUrl(baseUrl: string) {
  return (
    baseUrl.toLowerCase().includes('ark.cn-beijing.volces.com/api/plan/v3') ||
    baseUrl.toLowerCase().includes('/api/plan/v3')
  )
}

export function normalizeSeedanceResolution(value: string, model = '') {
  const normalized = normalizeResolutionToken(value)
  if (isSeedanceFastModel(model) && normalized === '1080p') return '720p'
  return seedanceResolutionOptions.some((item) => item.value === normalized)
    ? normalized
    : '720p'
}

export function normalizeResolutionToken(value: string) {
  if (value === 'low') return '480p'
  if (value === 'auto' || value === 'high' || value === 'medium') return '720p'
  const resolution = String(value || '').replace(/p$/i, '') || '720'
  return `${resolution}p`
}

export function seedanceDurationOptionsForModel(model: string) {
  return normalizeModelConstraintKey(model).includes('seedance-2.5')
    ? seedance25DurationOptions
    : seedanceDurationOptions
}

export function normalizeSeedanceDuration(value: string, model = '') {
  if (String(value).trim() === '-1') return -1
  const seconds = Math.floor(Number(value) || 5)
  const maxSeconds = parseSeedanceVideoModelConstraints(model).maxDirectSeconds
  return Math.max(5, Math.min(maxSeconds, seconds))
}

export function resolveSeedanceVideoRequestDuration(
  value: string,
  constraints: SeedanceVideoModelConstraints
): { seconds: string; mySeconds?: string } {
  if (!constraints.hasDurationSuffix || !constraints.maxSeconds) {
    const seconds = Math.floor(Number(value) || 5)
    return {
      seconds: String(
        Math.max(5, Math.min(constraints.maxDirectSeconds, seconds))
      ),
    }
  }

  const requestedSeconds = Number(value)
  const selectedSeconds = constraints.fixedSeconds
    ? constraints.maxSeconds
    : Math.min(
        constraints.maxSeconds,
        Number.isFinite(requestedSeconds) && requestedSeconds > 0
          ? Math.floor(requestedSeconds)
          : constraints.maxSeconds
      )
  return {
    seconds: '1',
    mySeconds: String(Math.max(1, selectedSeconds)),
  }
}

export function seedanceReferenceCountError(
  counts: { images: number; videos: number; audios: number },
  constraints: SeedanceVideoModelConstraints
) {
  if (counts.images > constraints.maxReferenceImages) {
    return `当前模型参考图片最多 ${constraints.maxReferenceImages} 张`
  }
  if (counts.videos > constraints.maxReferenceVideos) {
    return `当前模型参考视频最多 ${constraints.maxReferenceVideos} 个`
  }
  if (counts.audios > constraints.maxReferenceAudios) {
    return `当前模型参考音频最多 ${constraints.maxReferenceAudios} 个`
  }
  const totalLimit =
    constraints.maxReferenceImages +
    constraints.maxReferenceVideos +
    constraints.maxReferenceAudios
  if (counts.images + counts.videos + counts.audios > totalLimit) {
    return `参考素材总数最多 ${totalLimit} 个`
  }
  if (counts.images < constraints.requiredImages) {
    return `当前模型至少需要 ${constraints.requiredImages} 张参考图片`
  }
  return ''
}

export function normalizeSeedanceRatio(value: string) {
  if (!value || value === 'auto' || value === 'adaptive') return 'adaptive'
  if (seedanceRatioOptions.some((item) => item.value === value)) return value
  const match = value.match(/^(\d+)x(\d+)$/)
  if (!match) return 'adaptive'
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return 'adaptive'
  const ratio = width / height
  const options = [
    ['16:9', 16 / 9],
    ['4:3', 4 / 3],
    ['1:1', 1],
    ['3:4', 3 / 4],
    ['9:16', 9 / 16],
    ['21:9', 21 / 9],
  ] as const
  return options.reduce(
    (best, item) =>
      Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best,
    options[0]
  )[0]
}

export function seedancePixelLabel(resolution: string, ratio: string) {
  const normalizedResolution = normalizeSeedanceResolution(
    resolution
  ) as keyof typeof seedancePixels
  const normalizedRatio = normalizeSeedanceRatio(ratio) as
    | keyof (typeof seedancePixels)[typeof normalizedResolution]
    | 'adaptive'
  if (normalizedRatio === 'adaptive') return '自动匹配'
  return seedancePixels[normalizedResolution][normalizedRatio] || ''
}

export function boolConfig(value: string | undefined, fallback: boolean) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function seedanceReferenceLabel(
  kind: 'image' | 'video' | 'audio',
  index: number
) {
  if (kind === 'image') return `图片${index + 1}`
  if (kind === 'video') return `视频${index + 1}`
  return `音频${index + 1}`
}

export function buildSeedancePromptText(
  prompt: string,
  images: ReferenceImage[],
  videos: ReferenceVideo[],
  audios: ReferenceAudio[]
) {
  const labels = [
    ...images.map((_, index) => seedanceReferenceLabel('image', index)),
    ...videos.map((_, index) => seedanceReferenceLabel('video', index)),
    ...audios.map((_, index) => seedanceReferenceLabel('audio', index)),
  ]
  const text = prompt.trim()
  if (!labels.length) return text
  return `参考素材编号：${labels.join('、')}。请按这些编号理解提示词中的图片、视频和音频引用。\n\n${text}`
}

export function seedanceVideoReferenceError(
  videos: ReferenceVideo[],
  requireKnownDuration = false,
  maxDurationSeconds = 15
) {
  const maxDurationMs = maxDurationSeconds * 1000
  let totalDurationMs = 0
  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index]
    const label = seedanceReferenceLabel('video', index)
    if (video.bytes && video.bytes > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) {
      return `${label} 超过 50MB，请压缩后再上传`
    }
    if (video.durationMs != null && Number.isFinite(video.durationMs)) {
      if (video.durationMs < 2000 || video.durationMs > maxDurationMs) {
        return `${label} 时长需要在 2-${maxDurationSeconds} 秒之间`
      }
      totalDurationMs += video.durationMs
    } else if (requireKnownDuration) {
      return `${label} 时长读取失败，请重新选择视频`
    }
    if (video.width && video.height) {
      if (
        video.width < 300 ||
        video.width > 6000 ||
        video.height < 300 ||
        video.height > 6000
      ) {
        return `${label} 宽高需要在 300-6000px 之间`
      }
      const ratio = video.width / video.height
      if (ratio < 0.4 || ratio > 2.5) {
        return `${label} 宽高比需要在 0.4-2.5 之间`
      }
      const pixels = video.width * video.height
      if (pixels < 640 * 640 || pixels > 2206 * 946) {
        return `${label} 像素总量不符合 Seedance 要求，请转成 480p/720p/1080p 后再上传`
      }
    }
  }
  if (totalDurationMs > maxDurationMs) {
    return `Seedance 参考视频总时长不能超过 ${maxDurationSeconds} 秒`
  }
  return ''
}

export const seedanceVideoReferenceHint =
  '参考视频需为 mp4/mov，H.264/H.265，FPS 24-60；含真人人脸素材请使用火山授权 asset:// 素材。'

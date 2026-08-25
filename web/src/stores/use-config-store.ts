import { nanoid } from 'nanoid'
import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  AigcModelOption,
  AigcWorkshopModels,
} from '@/features/aigc-workshop/types'

export type ApiCallFormat = 'openai' | 'gemini'

export type ModelChannel = {
  id: string
  name: string
  group?: string
  baseUrl: string
  apiKey: string
  apiFormat: ApiCallFormat
  models: string[]
}

export type AiConfig = {
  channelMode: 'remote' | 'local'
  baseUrl: string
  apiKey: string
  apiFormat: ApiCallFormat
  channels: ModelChannel[]
  model: string
  imageModel: string
  videoModel: string
  textModel: string
  audioModel: string
  audioVoice: string
  audioFormat: string
  audioSpeed: string
  audioInstructions: string
  videoSeconds: string
  vquality: string
  videoGenerateAudio: string
  videoWatermark: string
  systemPrompt: string
  models: string[]
  imageModels: string[]
  videoModels: string[]
  textModels: string[]
  audioModels: string[]
  quality: string
  size: string
  count: string
  canvasImageCount: string
}

export type WebdavSyncConfig = {
  url: string
  username: string
  password: string
  directory: string
  lastSyncedAt: string
}

export const CONFIG_STORE_KEY = 'infinite-canvas:ai_config_store'
export type ModelCapability = 'image' | 'video' | 'text' | 'audio'
const CHANNEL_MODEL_SEPARATOR = '::'
const NEW_API_BASE_URL = '/api/aigc'
const OPENAI_BASE_URL = 'https://api.openai.com'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'

export const defaultConfig: AiConfig = {
  channelMode: 'local',
  baseUrl: NEW_API_BASE_URL,
  apiKey: 'new-api-session',
  apiFormat: 'openai',
  channels: [],
  model: '',
  imageModel: '',
  videoModel: '',
  textModel: '',
  audioModel: '',
  audioVoice: 'alloy',
  audioFormat: 'mp3',
  audioSpeed: '1',
  audioInstructions: '',
  videoSeconds: '6',
  vquality: '720',
  videoGenerateAudio: 'true',
  videoWatermark: 'false',
  systemPrompt: '',
  models: [],
  imageModels: [],
  videoModels: [],
  textModels: [],
  audioModels: [],
  quality: 'auto',
  size: '1:1',
  count: '1',
  canvasImageCount: '3',
}

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
  url: '',
  username: '',
  password: '',
  directory: 'infinite-canvas',
  lastSyncedAt: '',
}

type ConfigStore = {
  config: AiConfig
  webdav: WebdavSyncConfig
  isConfigOpen: boolean
  shouldPromptContinue: boolean
  updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void
  syncNewApiModels: (models: AigcWorkshopModels) => void
  updateWebdavConfig: <K extends keyof WebdavSyncConfig>(
    key: K,
    value: WebdavSyncConfig[K]
  ) => void
  isAiConfigReady: (config: AiConfig, model: string) => boolean
  openConfigDialog: (shouldPromptContinue?: boolean) => void
  setConfigDialogOpen: (isOpen: boolean) => void
  clearPromptContinue: () => void
}

function isVideoModelName(model: string) {
  const value = modelOptionName(model).toLowerCase()
  return (
    value.includes('seedance') ||
    value.includes('video') ||
    value.includes('sora') ||
    value.includes('veo') ||
    value.includes('kling') ||
    value.includes('wan') ||
    value.includes('hailuo')
  )
}

function isImageModelName(model: string) {
  const value = modelOptionName(model).toLowerCase()
  return (
    !isVideoModelName(model) &&
    !isAudioModelName(model) &&
    (value.includes('seedream') ||
      value.includes('gpt-image') ||
      value.includes('image') ||
      value.includes('dall-e') ||
      value.includes('dalle') ||
      value.includes('imagen') ||
      value.includes('flux') ||
      value.includes('sdxl') ||
      value.includes('stable-diffusion') ||
      value.includes('midjourney'))
  )
}

function isAudioModelName(model: string) {
  const value = modelOptionName(model).toLowerCase()
  return (
    value.includes('audio') ||
    value.includes('tts') ||
    value.includes('speech') ||
    value.includes('voice') ||
    value.includes('music') ||
    value.includes('sound')
  )
}

function isTextModelName(model: string) {
  return (
    !isImageModelName(model) &&
    !isVideoModelName(model) &&
    !isAudioModelName(model)
  )
}

export function modelMatchesCapability(
  model: string,
  capability?: ModelCapability
) {
  if (!capability) {
    return true
  }
  if (capability === 'image') {
    return isImageModelName(model)
  }
  if (capability === 'video') {
    return isVideoModelName(model)
  }
  if (capability === 'audio') {
    return isAudioModelName(model)
  }
  return isTextModelName(model)
}

export function filterModelsByCapability(
  models: string[],
  capability?: ModelCapability
) {
  return capability
    ? models.filter((model) => modelMatchesCapability(model, capability))
    : models
}

export function selectableModelsByCapability(
  config: AiConfig,
  capability?: ModelCapability
) {
  if (!capability) {
    return config.models
  }
  return config[modelListKey(capability)]
}

function modelListKey(capability: ModelCapability) {
  return `${capability}Models` as
    | 'imageModels'
    | 'videoModels'
    | 'textModels'
    | 'audioModels'
}

function isAiConfigReady(config: AiConfig, model: string) {
  return Boolean(model.trim() && resolveModelChannel(config, model))
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      config: defaultConfig,
      webdav: defaultWebdavSyncConfig,
      isConfigOpen: false,
      shouldPromptContinue: false,
      updateConfig: (key, value) =>
        set((state) => ({
          config: {
            ...state.config,
            [key]: value,
          },
        })),
      syncNewApiModels: (models) =>
        set((state) => ({
          config: mergeNewApiModels(state.config, models),
        })),
      updateWebdavConfig: (key, value) =>
        set((state) => ({
          webdav: {
            ...state.webdav,
            [key]: value,
          },
        })),
      isAiConfigReady: (config, model) => isAiConfigReady(config, model),
      openConfigDialog: (shouldPromptContinue = false) =>
        set({ isConfigOpen: true, shouldPromptContinue }),
      setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
      clearPromptContinue: () => set({ shouldPromptContinue: false }),
    }),
    {
      name: CONFIG_STORE_KEY,
      partialize: (state) => ({ config: state.config, webdav: state.webdav }),
      merge: (persisted, current) => {
        const persistedState = (persisted || {}) as Partial<ConfigStore>
        const persistedConfig = (persistedState.config ||
          {}) as Partial<AiConfig>
        const persistedWebdav = (persistedState.webdav ||
          {}) as Partial<WebdavSyncConfig>
        const config = { ...defaultConfig, ...persistedConfig }
        if (!Array.isArray(persistedConfig.channels)) {
          config.channels = []
        }
        const channels = normalizeChannels(config)
        const models = modelOptionsFromChannels(channels)
        return {
          ...current,
          webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
          config: {
            ...config,
            channelMode: 'local',
            apiFormat: normalizeApiFormat(config.apiFormat),
            channels,
            models,
            imageModel: normalizeModelOptionValue(
              config.imageModel || config.model,
              channels
            ),
            videoModel: normalizeModelOptionValue(
              config.videoModel || 'grok-imagine-video',
              channels
            ),
            textModel: normalizeModelOptionValue(
              config.textModel || config.model,
              channels
            ),
            audioModel: normalizeModelOptionValue(
              config.audioModel || defaultConfig.audioModel,
              channels
            ),
            audioVoice: config.audioVoice || defaultConfig.audioVoice,
            audioFormat: config.audioFormat || defaultConfig.audioFormat,
            audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
            audioInstructions: config.audioInstructions || '',
            videoSeconds: config.videoSeconds || '6',
            vquality: config.vquality || '720',
            videoGenerateAudio: config.videoGenerateAudio || 'true',
            videoWatermark: config.videoWatermark || 'false',
            canvasImageCount: config.canvasImageCount || '3',
            imageModels: Array.isArray(persistedConfig.imageModels)
              ? normalizeModelList(config.imageModels, channels)
              : filterModelsByCapability(models, 'image'),
            videoModels: Array.isArray(persistedConfig.videoModels)
              ? normalizeModelList(config.videoModels, channels)
              : filterModelsByCapability(models, 'video'),
            textModels: Array.isArray(persistedConfig.textModels)
              ? normalizeModelList(config.textModels, channels)
              : filterModelsByCapability(models, 'text'),
            audioModels: Array.isArray(persistedConfig.audioModels)
              ? normalizeModelList(config.audioModels, channels)
              : filterModelsByCapability(models, 'audio'),
          },
        }
      },
    }
  )
)

function normalizeModelList(models: string[], channels: ModelChannel[]) {
  const allModelOptions = channels.flatMap((channel) =>
    channel.models.map((model) => encodeChannelModel(channel.id, model))
  )
  return [
    ...new Set((models || []).map((model) => model.trim()).filter(Boolean)),
  ]
    .map((model) => normalizeModelOptionValue(model, channels))
    .filter(
      (model) =>
        !allModelOptions.length ||
        allModelOptions.includes(model) ||
        !isChannelModelValue(model)
    )
}

export function useEffectiveConfig() {
  const config = useConfigStore((state) => state.config)
  return useMemo(() => ({ ...config, channelMode: 'local' as const }), [config])
}

export function createModelChannel(
  channel?: Partial<ModelChannel>
): ModelChannel {
  const apiFormat = normalizeApiFormat(channel?.apiFormat)
  return {
    id: channel?.id?.trim() || nanoid(),
    name: channel?.name?.trim() || '新渠道',
    group: channel?.group,
    baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
    apiKey: channel?.apiKey || '',
    apiFormat,
    models: uniqueRawModels(channel?.models || []),
  }
}

export function encodeChannelModel(channelId: string, model: string) {
  return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`
}

export function isChannelModelValue(value: string) {
  return value.includes(CHANNEL_MODEL_SEPARATOR)
}

export function decodeChannelModel(value: string) {
  const index = value.indexOf(CHANNEL_MODEL_SEPARATOR)
  if (index < 0) {
    return null
  }
  return {
    channelId: value.slice(0, index),
    model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length),
  }
}

export function modelOptionName(value: string) {
  return decodeChannelModel(value)?.model || value
}

export function modelOptionLabel(config: AiConfig, value: string) {
  const decoded = decodeChannelModel(value)
  if (!decoded) {
    return value
  }
  const channel = config.channels.find((item) => item.id === decoded.channelId)
  return channel ? `${decoded.model}（${channel.name}）` : decoded.model
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
  return uniqueModelOptions(
    channels.flatMap((channel) =>
      channel.models.map((model) => encodeChannelModel(channel.id, model))
    )
  )
}

export function normalizeModelOptionValue(
  value: string | undefined,
  channels: ModelChannel[]
) {
  const model = (value || '').trim()
  if (!model) {
    return ''
  }
  const decoded = decodeChannelModel(model)
  if (decoded) {
    const channel = channels.find((item) => item.id === decoded.channelId)
    return channel && channel.models.includes(decoded.model) ? model : ''
  }
  const channel =
    channels.find((item) => item.models.includes(model)) || channels[0]
  return channel && channel.models.includes(model)
    ? encodeChannelModel(channel.id, model)
    : model
}

export function resolveModelChannel(config: AiConfig, value: string) {
  const decoded = decodeChannelModel(value)
  const model = decoded?.model || value
  const matched = decoded
    ? config.channels.find((channel) => channel.id === decoded.channelId)
    : config.channels.find((channel) => channel.models.includes(model))
  return (
    matched ||
    config.channels[0] ||
    createModelChannel({
      id: 'default',
      name: '默认渠道',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      apiFormat: config.apiFormat,
      models: config.models.map(modelOptionName),
    })
  )
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
  const channel = resolveModelChannel(config, value)
  return {
    ...config,
    model: modelOptionName(value || config.model),
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
    apiFormat: channel.apiFormat,
  }
}

export function resolveNewApiGroup(config: AiConfig, value: string) {
  return resolveModelChannel(config, value)?.group || undefined
}

function normalizeChannels(config: AiConfig) {
  const persistedChannels = Array.isArray(config.channels)
    ? config.channels
    : []
  const channels = persistedChannels.map((channel, index) =>
    createModelChannel({
      ...channel,
      id: channel.id || (index === 0 ? 'default' : `channel-${index + 1}`),
      name: channel.name || (index === 0 ? '默认渠道' : `渠道 ${index + 1}`),
      models: uniqueRawModels(channel.models || []),
    })
  )
  if (!channels.length) {
    channels.push(
      createModelChannel({
        id: 'default',
        name: '默认渠道',
        baseUrl: config.baseUrl || defaultConfig.baseUrl,
        apiKey: config.apiKey || '',
        apiFormat: config.apiFormat || defaultConfig.apiFormat,
        models: uniqueRawModels([
          ...(config.models || []),
          config.model,
          config.imageModel,
          config.videoModel,
          config.textModel,
          config.audioModel,
        ]),
      })
    )
  }
  return channels.map((channel) => ({
    ...channel,
    models: uniqueRawModels(channel.models),
  }))
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
  return apiFormat === 'gemini' ? GEMINI_BASE_URL : OPENAI_BASE_URL
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
  return apiFormat === 'gemini' ? 'gemini' : 'openai'
}

function uniqueRawModels(models: string[]) {
  return [
    ...new Set(
      (models || [])
        .map((model) => modelOptionName(model).trim())
        .filter(Boolean)
    ),
  ]
}

function uniqueModelOptions(models: string[]) {
  return [
    ...new Set((models || []).map((model) => model.trim()).filter(Boolean)),
  ]
}

export function buildApiUrl(baseUrl: string, path: string) {
  let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl)
  const lowerBaseUrl = normalizedBaseUrl.toLowerCase()
  const apiBaseUrl =
    lowerBaseUrl.endsWith('/v1') ||
    lowerBaseUrl.endsWith('/api/v3') ||
    lowerBaseUrl.endsWith('/api/plan/v3')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/v1`
  return `${apiBaseUrl}${path}`
}

function mergeNewApiModels(
  config: AiConfig,
  models: AigcWorkshopModels
): AiConfig {
  const imageChannels = newApiChannels(models.image)
  const videoChannels = newApiChannels(models.video)
  const textChannels = newApiChannels(models.text)
  const channels = mergeChannels([
    ...imageChannels,
    ...videoChannels,
    ...textChannels,
  ])
  const allModels = modelOptionsFromChannels(channels)
  const imageModels = channelModelOptions(imageChannels)
  const videoModels = channelModelOptions(videoChannels)
  const textModels = channelModelOptions(textChannels)

  return {
    ...config,
    channelMode: 'local',
    baseUrl: NEW_API_BASE_URL,
    apiKey: 'new-api-session',
    apiFormat: 'openai',
    channels,
    models: allModels,
    imageModels,
    videoModels,
    textModels,
    audioModels: [],
    imageModel: keepOrFirst(config.imageModel, imageModels),
    videoModel: keepOrFirst(config.videoModel, videoModels),
    textModel: keepOrFirst(config.textModel, textModels),
    audioModel: '',
    model: keepOrFirst(config.model, imageModels, textModels, videoModels),
  }
}

function newApiChannels(options: AigcModelOption[] = []): ModelChannel[] {
  const groups = new Map<string, AigcModelOption[]>()
  options.forEach((option) => {
    const key = option.group || 'default'
    groups.set(key, [...(groups.get(key) || []), option])
  })

  return [...groups.entries()].map(([group, groupOptions]) =>
    createModelChannel({
      id: `new-api-group-${encodeURIComponent(group)}`,
      name: group === 'default' ? '默认分组' : group,
      group,
      baseUrl: NEW_API_BASE_URL,
      apiKey: 'new-api-session',
      apiFormat: 'openai',
      models: groupOptions.map((option) => option.model),
    })
  )
}

function mergeChannels(channels: ModelChannel[]): ModelChannel[] {
  const merged = new Map<string, ModelChannel>()
  channels.forEach((channel) => {
    const key = `${channel.group || channel.id}`
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, { ...channel })
      return
    }
    previous.models = uniqueRawModels([...previous.models, ...channel.models])
  })
  return [...merged.values()]
}

function channelModelOptions(channels: ModelChannel[]) {
  return modelOptionsFromChannels(channels)
}

function keepOrFirst(current: string, ...lists: string[][]) {
  const options = lists.flat()
  return options.includes(current) ? current : options[0] || ''
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl)
    const path = url.pathname.replace(/\/+$/, '')
    const lowerPath = path.toLowerCase()
    const arkPlanIndex = lowerPath.indexOf('/api/plan/v3')
    if (arkPlanIndex < 0) {
      return baseUrl
    }
    const end = arkPlanIndex + '/api/plan/v3'.length
    if (lowerPath.length !== end && lowerPath[end] !== '/') {
      return baseUrl
    }
    url.pathname = path.slice(0, end)
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return baseUrl
  }
}

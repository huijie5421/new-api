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
import type { CommerceScene, WorkshopModule } from './types'

export const WORKSHOP_MODULES: {
  value: WorkshopModule
  titleKey: string
  descriptionKey: string
}[] = [
  {
    value: 'image',
    titleKey: '图片生成',
    descriptionKey: '用提示词生成可交付图片素材',
  },
  {
    value: 'video',
    titleKey: '视频生成',
    descriptionKey: '用文字或参考图生成短视频任务',
  },
  {
    value: 'commerce',
    titleKey: '电商套图',
    descriptionKey: '先沟通套图方案，再批量执行商品场景图',
  },
]

export const IMAGE_RESOLUTION_LEVELS = [
  { value: '1k', labelKey: '1K 标准', quality: 'standard' },
  { value: '2k', labelKey: '2K 高清', quality: 'hd' },
  { value: '4k', labelKey: '4K 超清', quality: 'hd' },
] as const

export const IMAGE_ASPECT_RATIOS = [
  {
    value: 'auto',
    labelKey: '自动',
    descriptionKey: 'AI 自动选择合适比例',
    sizeByResolution: {
      '1k': '1024x1024',
      '2k': '2048x2048',
      '4k': '4096x4096',
    },
  },
  {
    value: 'square',
    labelKey: '正方形',
    descriptionKey: '头像 / 商品主图',
    sizeByResolution: {
      '1k': '1024x1024',
      '2k': '2048x2048',
      '4k': '4096x4096',
    },
  },
  {
    value: 'landscape',
    labelKey: '横屏',
    descriptionKey: '封面 / 海报',
    sizeByResolution: {
      '1k': '1536x864',
      '2k': '2560x1440',
      '4k': '3840x2160',
    },
  },
  {
    value: 'portrait',
    labelKey: '竖屏',
    descriptionKey: '手机海报 / 小红书',
    sizeByResolution: {
      '1k': '864x1536',
      '2k': '1440x2560',
      '4k': '2160x3840',
    },
  },
  {
    value: '4:3',
    labelKey: '4:3 横版',
    descriptionKey: '横向构图',
    sizeByResolution: {
      '1k': '1365x1024',
      '2k': '2048x1536',
      '4k': '4096x3072',
    },
  },
  {
    value: '3:4',
    labelKey: '3:4 竖版',
    descriptionKey: '纵向构图',
    sizeByResolution: {
      '1k': '1024x1365',
      '2k': '1536x2048',
      '4k': '3072x4096',
    },
  },
  {
    value: '3:2',
    labelKey: '3:2 横版',
    descriptionKey: '横版摄影',
    sizeByResolution: {
      '1k': '1536x1024',
      '2k': '3072x2048',
      '4k': '4096x2731',
    },
  },
  {
    value: '2:3',
    labelKey: '2:3 竖版',
    descriptionKey: '竖版摄影',
    sizeByResolution: {
      '1k': '1024x1536',
      '2k': '2048x3072',
      '4k': '2731x4096',
    },
  },
  {
    value: '4:5',
    labelKey: '4:5 竖版',
    descriptionKey: '社交电商海报',
    sizeByResolution: {
      '1k': '1024x1280',
      '2k': '2048x2560',
      '4k': '3277x4096',
    },
  },
  {
    value: '5:4',
    labelKey: '5:4 横版',
    descriptionKey: '商品横幅',
    sizeByResolution: {
      '1k': '1280x1024',
      '2k': '2560x2048',
      '4k': '4096x3277',
    },
  },
  {
    value: '21:9',
    labelKey: '21:9 超宽',
    descriptionKey: '宽幅营销视觉',
    sizeByResolution: {
      '1k': '1792x768',
      '2k': '3440x1440',
      '4k': '4096x1755',
    },
  },
  {
    value: 'custom',
    labelKey: '自定义',
    descriptionKey: '按自定义宽高生成',
    sizeByResolution: {
      '1k': '1024x1024',
      '2k': '2048x2048',
      '4k': '4096x4096',
    },
  },
] as const

export const COMMERCE_SCENES: CommerceScene[] = [
  {
    id: 'main',
    titleKey: '商品主图',
    promptKey: '干净的电商商品主图，高级布光，突出商品主体，适合店铺首图',
  },
  {
    id: 'white',
    titleKey: '白底图',
    promptKey: '纯白背景商品图，准确呈现产品轮廓、颜色和材质，电商平台审核友好',
  },
  {
    id: 'lifestyle',
    titleKey: '场景图',
    promptKey: '真实生活方式场景，自然使用场景，商业摄影质感',
  },
  {
    id: 'detail',
    titleKey: '细节特写',
    promptKey: '微距细节特写，材质纹理清晰，电商级画质',
  },
  {
    id: 'selling',
    titleKey: '卖点图',
    promptKey: '突出核心卖点的商品视觉，构图留出文字排版空间，适合详情页',
  },
  {
    id: 'banner',
    titleKey: '营销横幅',
    promptKey: '宽幅营销横幅构图，预留文案区域，零售促销氛围',
  },
]

export const DEFAULT_IMAGE_MODEL_HINTS = [
  'gpt-image',
  'dall-e',
  'imagen',
  'flux',
  'sd',
  'image',
]

export const DEFAULT_VIDEO_MODEL_HINTS = [
  'sora',
  'veo',
  'kling',
  'pika',
  'wan',
  'video',
  'cogvideo',
]

export const DEFAULT_TEXT_MODEL_HINTS = [
  'gpt',
  'claude',
  'gemini',
  'deepseek',
  'qwen',
  'doubao',
  'moonshot',
  'glm',
  'chat',
]

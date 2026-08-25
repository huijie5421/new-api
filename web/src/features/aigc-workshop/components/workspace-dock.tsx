import {
  Film,
  Layers3,
  Library,
  MessageSquare,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export type AigcWorkspaceDockValue =
  | 'studio'
  | 'canvas'
  | 'prompts'
  | 'music'
  | 'assets'

type AigcWorkspaceDockItem = {
  value: AigcWorkspaceDockValue
  title: string
  icon: LucideIcon
  locked?: boolean
}

type AigcWorkspaceDockProps = {
  active: AigcWorkspaceDockValue
  onSelect: (value: AigcWorkspaceDockValue) => void
  onLocked?: (value: AigcWorkspaceDockValue) => void
  className?: string
}

const AIGC_WORKSPACE_DOCK_ITEMS: AigcWorkspaceDockItem[] = [
  { value: 'studio', title: 'AIGC工坊', icon: Sparkles },
  { value: 'canvas', title: '无限画布', icon: Layers3 },
  { value: 'prompts', title: '提示词广场', icon: MessageSquare },
  { value: 'music', title: '音乐创作', icon: Film, locked: true },
  { value: 'assets', title: '我的资产', icon: Library },
]

export function AigcWorkspaceDock(props: AigcWorkspaceDockProps) {
  const { t } = useTranslation()

  return (
    <aside
      aria-label={t('AIGC工坊')}
      className={cn(
        'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-[70] mx-auto flex h-16 max-w-[420px] items-center justify-around rounded-2xl border border-sky-200/70 bg-sky-50/90 px-2 py-2 shadow-2xl shadow-sky-950/10 backdrop-blur-xl lg:absolute lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-5 lg:mx-0 lg:h-auto lg:w-[86px] lg:max-w-none lg:-translate-y-1/2 lg:flex-col lg:gap-6 lg:rounded-[40px] lg:bg-sky-50/70 lg:px-3 lg:py-7',
        props.className
      )}
    >
      {AIGC_WORKSPACE_DOCK_ITEMS.map((item) => {
        const Icon = item.icon
        const active = item.value === props.active
        return (
          <button
            key={item.value}
            type='button'
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (item.locked) {
                props.onLocked?.(item.value)
                return
              }
              props.onSelect(item.value)
            }}
            className={cn(
              'relative flex size-11 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-white/70 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-violet-400/40 focus-visible:outline-none lg:size-12 lg:rounded-full',
              active &&
                'bg-violet-950 text-white shadow-xl shadow-violet-950/30 hover:bg-violet-950 hover:text-white lg:size-14',
              item.locked && 'text-slate-400 hover:text-slate-400'
            )}
            title={t(item.title)}
          >
            <Icon className='size-6 shrink-0' aria-hidden='true' />
            <span className='sr-only'>{t(item.title)}</span>
            {item.locked ? (
              <span className='absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-sky-100/80 text-center text-[10px] leading-4 font-medium text-slate-400 lg:text-[11px]'>
                {t('内测')}
              </span>
            ) : null}
          </button>
        )
      })}
    </aside>
  )
}

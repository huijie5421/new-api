/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { Loader2, Video as VideoIcon } from 'lucide-react'
import { useEffect, useRef, useState, type VideoHTMLAttributes } from 'react'

import {
  isSameOriginMediaUrl,
  resolveAuthenticatedMediaObjectUrl,
} from '@/lib/authenticated-media'
import { cn } from '@/lib/utils'

type AuthenticatedAssetVideoProps = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  'src'
> & {
  src: string
  loading?: 'lazy' | 'eager'
}

type PreviewState = {
  source: string
  status: 'loading' | 'ready' | 'error'
  url?: string
}

function initialPreviewState(source: string): PreviewState {
  if (isSameOriginMediaUrl(source)) {
    return { source, status: 'loading' }
  }
  return { source, status: 'ready', url: source }
}

export function AuthenticatedAssetVideo(props: AuthenticatedAssetVideoProps) {
  const targetRef = useRef<HTMLSpanElement>(null)
  const [visibleSource, setVisibleSource] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState>(() =>
    initialPreviewState(props.src)
  )
  const defersLoading =
    props.loading === 'lazy' && isSameOriginMediaUrl(props.src)
  const shouldLoad = !defersLoading || visibleSource === props.src
  const currentPreview =
    preview.source === props.src ? preview : initialPreviewState(props.src)

  useEffect(() => {
    if (!defersLoading) return
    const target = targetRef.current
    if (!target || typeof IntersectionObserver === 'undefined') {
      setVisibleSource(props.src)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisibleSource(props.src)
        observer.disconnect()
      },
      { rootMargin: '200px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [defersLoading, props.src])

  useEffect(() => {
    if (!shouldLoad) return
    if (!isSameOriginMediaUrl(props.src)) {
      setPreview({ source: props.src, status: 'ready', url: props.src })
      return
    }

    const controller = new AbortController()
    let active = true
    let release: (() => void) | undefined
    setPreview({ source: props.src, status: 'loading' })

    void resolveAuthenticatedMediaObjectUrl(props.src, {
      signal: controller.signal,
    })
      .then((resolved) => {
        if (!active) {
          resolved.release()
          return
        }
        release = resolved.release
        setPreview({
          source: props.src,
          status: 'ready',
          url: resolved.url,
        })
      })
      .catch((error: unknown) => {
        if (
          !active ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return
        }
        setPreview({ source: props.src, status: 'error' })
      })

    return () => {
      active = false
      controller.abort()
      release?.()
    }
  }, [props.src, shouldLoad])

  const { src: _src, loading: _loading, ...videoProps } = props

  if (!shouldLoad) {
    return (
      <span
        ref={targetRef}
        className={cn('flex items-center justify-center', props.className)}
      >
        <VideoIcon
          aria-label={props['aria-label'] ?? 'video'}
          role='img'
          className='text-muted-foreground size-5'
        />
      </span>
    )
  }

  if (currentPreview.status === 'loading') {
    return (
      <Loader2
        aria-label={props['aria-label'] ?? 'video'}
        role='status'
        className='text-muted-foreground size-5 animate-spin'
      />
    )
  }

  if (currentPreview.status === 'error' || !currentPreview.url) {
    return (
      <VideoIcon
        aria-label={props['aria-label'] ?? 'video'}
        role='img'
        className='text-muted-foreground size-5'
      />
    )
  }

  return <video {...videoProps} src={currentPreview.url} />
}

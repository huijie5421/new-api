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
import { ImageIcon, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'

import {
  isSameOriginMediaUrl,
  resolveAuthenticatedMediaObjectUrl,
} from '@/lib/authenticated-media'
import { cn } from '@/lib/utils'

type AuthenticatedAssetImageProps = {
  src: string
  alt: string
  className?: string
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading']
  decoding?: ImgHTMLAttributes<HTMLImageElement>['decoding']
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

export function AuthenticatedAssetImage(props: AuthenticatedAssetImageProps) {
  const lazyTargetRef = useRef<HTMLSpanElement>(null)
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
    const target = lazyTargetRef.current
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

  if (!shouldLoad) {
    return (
      <span
        ref={lazyTargetRef}
        className={cn('flex items-center justify-center', props.className)}
      >
        <ImageIcon
          aria-label={props.alt}
          role='img'
          className='text-muted-foreground size-5'
        />
      </span>
    )
  }

  if (currentPreview.status === 'loading') {
    return (
      <Loader2
        aria-label={props.alt}
        role='status'
        className='text-muted-foreground size-5 animate-spin'
      />
    )
  }
  if (currentPreview.status === 'error' || !currentPreview.url) {
    return (
      <ImageIcon
        aria-label={props.alt}
        role='img'
        className='text-muted-foreground size-5'
      />
    )
  }

  return (
    <img
      src={currentPreview.url}
      alt={props.alt}
      loading={props.loading}
      decoding={props.decoding}
      className={props.className}
    />
  )
}

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
import type { WorkshopResult } from './types'

export const MAX_SETTLED_WORKSHOP_RESULTS = 36

export function boundWorkshopResults(
  results: WorkshopResult[]
): WorkshopResult[] {
  let settledCount = 0
  return results.filter((result) => {
    if (result.status === 'processing') return true
    settledCount++
    return settledCount <= MAX_SETTLED_WORKSHOP_RESULTS
  })
}

export function collectWorkshopLiveUrls(
  urls: Array<string | undefined | null>
): Set<string> {
  return new Set(urls.filter((url): url is string => Boolean(url)))
}

export function createImageObjectUrl(
  encoded: string,
  mimeType: string,
  runtime = {
    decodeBase64: (value: string) =>
      Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
    createObjectURL: (blob: Blob) => URL.createObjectURL(blob),
  }
): string {
  return runtime.createObjectURL(
    new Blob([runtime.decodeBase64(encoded)], { type: mimeType })
  )
}

export function createWorkshopObjectUrlOwner(
  revokeObjectURL = (url: string) => URL.revokeObjectURL(url)
) {
  const owned = new Set<string>()
  let disposed = false
  return {
    track(url: string) {
      if (disposed) {
        revokeObjectURL(url)
        return url
      }
      owned.add(url)
      return url
    },
    retainOnly(live: ReadonlySet<string>) {
      for (const url of owned) {
        if (live.has(url)) continue
        revokeObjectURL(url)
        owned.delete(url)
      }
    },
    dispose() {
      disposed = true
      for (const url of owned) revokeObjectURL(url)
      owned.clear()
    },
  }
}

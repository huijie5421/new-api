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
export interface HeaderRow {
  key: string
  value: string
}

export function parseHeaderRows(headers: string): HeaderRow[] {
  if (!headers.trim()) return []
  try {
    const value = JSON.parse(headers) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).map(([key, item]) => ({
        key,
        value: typeof item === 'string' ? item : JSON.stringify(item),
      }))
    }
  } catch {
    return []
  }
  return []
}

export function buildHeadersJson(rows: HeaderRow[]): string {
  const filledRows = rows.filter((row) => row.key.trim())
  if (filledRows.length === 0) return ''

  const headers: Record<string, string> = {}
  for (const row of filledRows) {
    headers[row.key.trim()] = row.value
  }
  return JSON.stringify(headers)
}

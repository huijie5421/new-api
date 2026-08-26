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
import { describe, expect, test } from 'vitest'

import { Route } from '../index'

describe('default entry route', () => {
  test('redirects the removed home page to the protected dashboard', () => {
    const beforeLoad = Route.options.beforeLoad
    expect(beforeLoad).toBeTypeOf('function')

    expect(() =>
      beforeLoad?.({
        location: {
          search: { aff: 'inviter' },
          hash: 'continue',
        },
      } as never)
    ).toThrowError(
      expect.objectContaining({
        options: expect.objectContaining({
          to: '/dashboard',
          search: { aff: 'inviter' },
          hash: 'continue',
          replace: true,
        }),
      })
    )
  })
})

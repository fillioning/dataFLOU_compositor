import type { ExposedApi } from '@shared/types'

declare global {
  interface Window {
    api: ExposedApi
  }
}

export {}

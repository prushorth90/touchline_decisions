import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/fplApi'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status === 404) && failureCount < 2,
    },
  },
})
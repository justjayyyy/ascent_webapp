import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
      refetchOnMount: true, // Refetch on mount for fresh data
      networkMode: 'online',
    },
    mutations: {
      retry: 1,
      networkMode: 'online',
    },
  },
});

// Prefetch common data on app load
export async function prefetchCommonData() {
  // This can be called on app initialization to warm up the cache
  // Example: await queryClientInstance.prefetchQuery({ queryKey: ['accounts'], queryFn: ... })
}

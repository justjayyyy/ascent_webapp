import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
      // Refetch on mount only when stale: fresh data (under staleTime) is not fetched again. Not `false`, which
      // never refetches on mount: lists restored from the device and marked stale on start-up then stayed stale
      // on every page that mounted after the restore, hiding what others added meanwhile
      refetchOnMount: true,
      refetchOnReconnect: true, // Refetch when network reconnects
      networkMode: 'online',
      // Enable structural sharing to prevent unnecessary re-renders
      structuralSharing: true,
      // Deduplicate requests made within 1 second
      queryDeduplication: true,
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

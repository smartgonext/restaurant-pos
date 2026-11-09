import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000, // 3 minutes fresh data across the whole application
      gcTime: 15 * 60 * 1000, // 15 minutes cache retention in memory
      retry: 1,
      refetchOnWindowFocus: false, // Prevents freezing / lag when clicking in & out of window
      refetchOnMount: false, // Instant screen render from memory cache
      refetchOnReconnect: true,
    },
  },
});

import { MutationCache, QueryClient } from '@tanstack/react-query';
import { reportIpcError } from './toast';

export const queryClient = new QueryClient({
  /*
   * 写操作失败一律走同一条提示（ui-spec 第 7 节）：大纲里每敲一下 Enter/Tab 都是一次
   * mutation，指望每处自己接 onError 迟早会漏，漏掉的那次就变成「按了没反应」。
   */
  mutationCache: new MutationCache({
    onError: (error) => reportIpcError(error),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

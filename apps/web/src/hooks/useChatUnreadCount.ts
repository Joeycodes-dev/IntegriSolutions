import { useEffect, useState } from 'react';
import { getChatThreads } from '../services/api';
import { hasSupabaseRealtimeConfig, supabaseRealtime } from '../lib/supabaseRealtime';

export function useChatUnreadCount(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }

    let mounted = true;

    const refresh = async () => {
      try {
        const threads = await getChatThreads();
        if (mounted) {
          const total = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
          setUnreadCount(total);
        }
      } catch {
        // Ignore unread badge errors to avoid blocking nav rendering.
      }
    };

    void refresh();

    let removeRealtime: (() => void) | null = null;
    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      void refresh();
    }, 12000);

    if (hasSupabaseRealtimeConfig && supabaseRealtime) {
      const channel = supabaseRealtime
        .channel('web-chat-unread')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          () => {
            void refresh();
          }
        )
        .subscribe();

      removeRealtime = () => {
        void supabaseRealtime.removeChannel(channel);
      };
    }

    return () => {
      mounted = false;
      removeRealtime?.();
      clearInterval(interval);
    };
  }, [enabled]);

  return unreadCount;
}

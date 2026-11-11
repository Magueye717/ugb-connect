import { useState } from 'react';
import { RefreshControl } from 'react-native';

import { colors } from '@/constants/theme';

/**
 * Pull to refresh, the same on every screen: give it what reloads the screen (one call or several), put the result
 * in the scroll view's `refreshControl`. A failure keeps what's shown (the screen says so itself if it can't load).
 */
export function usePullRefresh(...reloads: (() => unknown)[]) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled(reloads.map((r) => Promise.resolve().then(r)));
    } finally {
      setRefreshing(false);
    }
  };
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />;
}

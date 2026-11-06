import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PopOnChange } from '@/components/motion';
import { colors, radii, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { commerceApi, type ItemDto } from './api';

type Props = {
  item: Pick<ItemDto, 'id' | 'name' | 'likes' | 'liked'>;
  /** `overlay`: a round chip on the photo. `inline`: the heart and its count in a line of text. */
  variant?: 'overlay' | 'inline';
  /** The server's answer, for the screen to keep its list in step. */
  onChange?: (v: { liked: boolean; likes: number }) => void;
  /** Its own team: the count only (they don't like their own items). */
  readOnly?: boolean;
};

/**
 * The heart on an article or a dish, with how many students like it. Filled at once on tap (the server confirms, or
 * it goes back with the reason: its own shop, say).
 */
export function LikeButton({ item, variant = 'overlay', onChange, readOnly }: Props) {
  const [state, setState] = useState({ liked: item.liked, likes: item.likes });
  const [busy, setBusy] = useState(false);
  // A fresh list from the server (pull to refresh, back to the screen): its values win (render-time, no effect).
  const [seen, setSeen] = useState(item);
  if (seen.liked !== item.liked || seen.likes !== item.likes || seen.id !== item.id) {
    setSeen(item);
    setState({ liked: item.liked, likes: item.likes });
  }

  const toggle = async () => {
    if (busy) return;
    const before = state;
    const on = !before.liked;
    haptics.select();
    setState({ liked: on, likes: Math.max(0, before.likes + (on ? 1 : -1)) });
    setBusy(true);
    try {
      const res = await commerceApi.like(item.id, on);
      setState(res);
      onChange?.(res);
    } catch (err) {
      setState(before);
      toast(err instanceof ApiError ? err.message : 'Pas de connexion : réessaie.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const { liked, likes } = state;
  const label = `${liked ? 'Je n’aime plus' : 'J’aime'} ${item.name}${likes ? `, ${likes} j’aime` : ''}`;
  const heart = (
    <PopOnChange id={liked ? 1 : 0}>
      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={variant === 'overlay' ? 15 : 16} color={liked ? colors.danger : variant === 'overlay' ? colors.navy : colors.muted2} />
    </PopOnChange>
  );
  if (readOnly)
    return (
      <View style={variant === 'overlay' ? styles.overlay : styles.inline} accessibilityLabel={`${likes} j’aime`}>
        <Ionicons name="heart" size={variant === 'overlay' ? 15 : 16} color={likes ? colors.danger : colors.muted} />
        <Text style={variant === 'overlay' ? styles.overlayCount : styles.inlineCount}>{likes}</Text>
      </View>
    );
  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      style={variant === 'overlay' ? styles.overlay : styles.inline}
      accessibilityRole="button"
      accessibilityState={{ selected: liked, busy }}
      accessibilityLabel={label}>
      {heart}
      {likes > 0 && <Text style={[variant === 'overlay' ? styles.overlayCount : styles.inlineCount, liked && { color: colors.danger }]}>{likes}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 28, height: 28, paddingHorizontal: 7, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center' },
  overlayCount: { ...typo.label, color: colors.navy },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  inlineCount: { ...typo.smallStrong, color: colors.muted2 },
});

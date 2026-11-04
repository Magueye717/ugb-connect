import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { profileApi } from '@/features/profile/api';
import { ApiError } from '@/lib/api';
import { pickPhoto } from '@/lib/pickPhoto';
import { uploadImage } from '@/lib/upload';

/**
 * The signed-in person's picture, tap to change it (camera or gallery): the same on every space (student profile,
 * a shop's or an organizer's account, the app creator's team). Initials until there is one.
 */
export function AvatarPicker({ size = 56, tone = 'solid' }: { size?: number; tone?: 'solid' | 'soft' }) {
  const { user, reloadAccount } = useAuth();
  const [uploading, setUploading] = useState(false);

  const change = async () => {
    const [asset] = await pickPhoto({ aspect: [1, 1], title: 'Photo de profil' });
    if (!asset) return;
    setUploading(true);
    try {
      const up = await uploadImage(asset, 'avatar');
      await profileApi.setAvatar(up.id);
      await reloadAccount();
    } catch (err) {
      Alert.alert('Photo refusée', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setUploading(false);
    }
  };

  const solid = tone === 'solid';
  return (
    <Pressable
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: solid ? colors.primary : colors.primarySoft }]}
      onPress={change}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel="Changer ma photo de profil">
      {user?.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={[size >= 56 ? typo.h3 : typo.bodyStrong, { color: solid ? '#fff' : colors.primary }]}>{user?.initials ?? ''}</Text>
      )}
      <View style={[styles.camera, { height: Math.max(16, size * 0.32) }]}>{uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={Math.max(10, size * 0.2)} color="#fff" />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  camera: { position: 'absolute', right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,16,40,0.55)', alignItems: 'center', justifyContent: 'center' },
});

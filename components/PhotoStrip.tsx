import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radii, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { pickPhoto } from '@/lib/pickPhoto';
import { uploadImage } from '@/lib/upload';

export type StripPhoto = { id: string; url: string };

type Props = {
  photos: StripPhoto[];
  onChange: (photos: StripPhoto[]) => void;
  /** From the server (reference). */
  max: number;
  purpose: Parameters<typeof uploadImage>[1];
  /** The picker's title: "Photos de l’article". */
  title: string;
  /** Uploads in progress: the form waits before saving. */
  onUploading?: (busy: boolean) => void;
};

/**
 * Several photos for one thing (an article): add some (camera or gallery, several at once), remove one, star one to
 * make it the cover. The first is the cover: it's the one on cards and in the basket.
 */
export function PhotoStrip({ photos, onChange, max, purpose, title, onUploading }: Props) {
  const [uploading, setUploading] = useState(false);
  const busy = (v: boolean) => {
    setUploading(v);
    onUploading?.(v);
  };

  const add = async () => {
    // Whole photos, as taken (landscape kept): no forced square crop.
    const assets = await pickPhoto({ multiple: Math.min(50, max - photos.length), title });
    if (!assets.length) return;
    busy(true);
    let list = photos;
    try {
      for (const asset of assets.slice(0, max - photos.length)) {
        const up = await uploadImage(asset, purpose);
        list = [...list, { id: up.id, url: up.url }];
        onChange(list);
      }
    } catch (err) {
      Alert.alert('Image refusée', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      busy(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>
        {/* A real limit is shown (an owner's 6); Référencement's ceiling isn't one. */}
        Photos · {max >= 100 ? photos.length : `${photos.length}/${max}`}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {photos.map((p, i) => (
          <View key={p.id}>
            <Image source={{ uri: p.url }} style={styles.photo} contentFit="cover" accessibilityLabel={i === 0 ? 'Photo de couverture' : `Photo ${i + 1}`} />
            {i === 0 ? (
              <View style={styles.coverTag}>
                <Text style={styles.coverTagText}>Couverture</Text>
              </View>
            ) : (
              <Pressable
                style={styles.star}
                onPress={() => onChange([p, ...photos.filter((x) => x.id !== p.id)])}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Mettre en couverture">
                <Ionicons name="star-outline" size={13} color="#fff" />
              </Pressable>
            )}
            <Pressable style={styles.remove} onPress={() => onChange(photos.filter((x) => x.id !== p.id))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Retirer la photo">
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {photos.length < max && (
          <Pressable style={[styles.photo, styles.add]} onPress={add} disabled={uploading} accessibilityRole="button" accessibilityLabel="Ajouter des photos">
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.addText}>Ajouter</Text>
              </>
            )}
          </Pressable>
        )}
      </ScrollView>
      {photos.length > 1 && <Text style={styles.hint}>La couverture s’affiche sur la carte de l’article. Touche l’étoile d’une photo pour la mettre en avant.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typo.smallStrong, color: colors.navy },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 2 },
  photo: { width: 92, height: 92, borderRadius: radii.md, backgroundColor: colors.border },
  add: { alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  addText: { ...typo.label, color: colors.primary },
  coverTag: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(10,16,40,0.7)', borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  coverTagText: { ...typo.label, color: '#fff' },
  star: { position: 'absolute', top: 4, left: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(10,16,40,0.7)', alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(10,16,40,0.7)', alignItems: 'center', justifyContent: 'center' },
  hint: { ...typo.caption, color: colors.muted2 },
});

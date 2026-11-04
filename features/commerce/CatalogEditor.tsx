import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { EmptyState } from '@/components/states';
import { Field, LabeledField, PrimaryButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type BusinessKind, type BusinessTarget, type ItemDto, type ItemSection } from '@/features/commerce/api';
import { ApiError } from '@/lib/api';
import { pickPhoto } from '@/lib/pickPhoto';
import { uploadImage } from '@/lib/upload';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const SECTION_LABEL: Record<ItemSection, string> = { menu: 'Menus du jour', drink: 'Boissons', article: 'Articles' };
/** The usual aisles of a campus shop; the shop's own ones are added to them. */
const AISLES = ['Fournitures', 'Impression', 'Épicerie', 'Boissons', 'Hygiène', 'Téléphonie', 'Électronique', 'Vêtements', 'Accessoires'];

/**
 * What students can order: a restaurant's menus and drinks, a shop's articles (with stock). Everyone who sees it can
 * switch an item off for today; `canManage` (owner, managers, Référencement) add, edit and remove. Goes inside a
 * ScrollView, under the screen's title.
 */
export function CatalogEditor({ target, kind, canManage, title = 'Catalogue' }: { target: BusinessTarget; kind: BusinessKind; canManage: boolean; title?: string }) {
  const [items, setItems] = useState<ItemDto[] | null>(null);
  const [editing, setEditing] = useState<ItemDto | 'new' | null>(null);
  const load = useCallback(() => {
    commerceApi.catalog(target).then((r) => setItems(r.items), () => setItems((i) => i ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the target's identity, not the object
  }, ['editorOf' in target ? target.editorOf : `${target.orgId}:${target.kind}`]);
  useFocusEffect(load);
  const sections: ItemSection[] = kind === 'restaurant' ? ['menu', 'drink'] : ['article'];

  const toggle = (item: ItemDto, available: boolean) => {
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, available } : i)) ?? null);
    commerceApi.updateItem(target, item.id, { available }).catch((err) => {
      fail('Changement impossible')(err);
      load();
    });
  };

  return (
    <>
      <View style={styles.row}>
        <Text style={[styles.h1, { flex: 1 }]}>{title}</Text>
        {canManage && (
          <Pressable style={styles.add} onPress={() => setEditing('new')} accessibilityRole="button">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>Ajouter</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sub}>Désactive un article épuisé : il disparaît pour les clients jusqu’à ce qu’il soit réactivé.</Text>

      {!items && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
      {items?.length === 0 && (
        <EmptyState
          icon={kind === 'restaurant' ? 'restaurant-outline' : 'pricetags-outline'}
          title="Le catalogue est vide"
          text={kind === 'restaurant' ? 'Ajoute les menus du jour et les boissons.' : 'Ajoute les articles avec leur prix et leur stock.'}
          action={canManage ? { label: 'Ajouter', onPress: () => setEditing('new') } : undefined}
        />
      )}

      {items &&
        sections.map((section) => {
          const list = items.filter((i) => i.section === section);
          if (!list.length) return null;
          return (
            <View key={section} style={{ gap: 10 }}>
              <Text style={styles.section}>
                {SECTION_LABEL[section]} · {list.length}
              </Text>
              {list.map((i) => (
                <Pressable key={i.id} style={[styles.item, shadow.card, !i.available && { opacity: 0.6 }]} onPress={() => canManage && setEditing(i)} accessibilityRole={canManage ? 'button' : undefined}>
                  <View style={styles.thumb}>{i.photo ? <Image source={{ uri: i.photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={20} color={colors.muted} />}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {i.name}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {[i.category, i.detail].filter(Boolean).join(' · ') || ' '}
                    </Text>
                    <Text style={styles.price}>
                      {formatFcfa(i.price)}
                      {i.stock !== null && <Text style={[styles.muted, i.stock <= 3 && { color: colors.dangerText }]}>  ·  {i.stock} en stock</Text>}
                    </Text>
                  </View>
                  <Switch value={i.available} onValueChange={(v) => toggle(i, v)} trackColor={{ true: colors.success }} accessibilityLabel={`${i.name} disponible`} />
                </Pressable>
              ))}
            </View>
          );
        })}

      {editing && (
        <ItemEditor
          business={target}
          kind={kind}
          item={editing === 'new' ? null : editing}
          aisles={[...new Set([...AISLES, ...(items ?? []).flatMap((i) => (i.category ? [i.category] : []))])]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ItemEditor({ business, kind, item, aisles, onClose, onSaved }: { business: BusinessTarget; kind: 'restaurant' | 'shop'; item: ItemDto | null; aisles: string[]; onClose: () => void; onSaved: () => void }) {
  const [section, setSection] = useState<ItemSection>(item?.section ?? (kind === 'restaurant' ? 'menu' : 'article'));
  const [name, setName] = useState(item?.name ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  // A new aisle, typed: only when none of the list fits.
  const [otherAisle, setOtherAisle] = useState(false);
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [stock, setStock] = useState(item?.stock !== null && item?.stock !== undefined ? String(item.stock) : '');
  const [photo, setPhoto] = useState<{ id: string | null; url: string | null }>({ id: item?.photoId ?? null, url: item?.photo ?? null });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    const [asset] = await pickPhoto({ aspect: [1, 1], title: kind === 'restaurant' ? 'Photo du plat' : 'Photo de l’article' });
    if (!asset) return;
    setUploading(true);
    try {
      const up = await uploadImage(asset, 'business');
      setPhoto({ id: up.id, url: up.url });
    } catch (err) {
      fail('Image refusée')(err);
    } finally {
      setUploading(false);
    }
  };

  const ready = name.trim().length >= 2 && /^\d+$/.test(price) && (!stock || /^\d+$/.test(stock)) && !uploading && !saving;
  const save = async () => {
    setSaving(true);
    try {
      const body = {
        section, name: name.trim(), detail: detail.trim(), price: Number(price), photoId: photo.id,
        ...(kind === 'shop' ? { category: category.trim() || null, stock: stock ? Number(stock) : null } : {}),
      };
      if (item) await commerceApi.updateItem(business, item.id, body);
      else await commerceApi.addItem(business, body);
      onSaved();
    } catch (err) {
      fail('Enregistrement impossible')(err);
    } finally {
      setSaving(false);
    }
  };
  const remove = () =>
    item &&
    Alert.alert(`Retirer « ${item.name} » ?`, 'Il disparaît du catalogue. Les commandes passées le gardent.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => commerceApi.removeItem(business, item.id).then(onSaved, fail('Suppression impossible')) },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 12, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>{item ? 'Modifier' : 'Nouvel article'}</Text>
          {kind === 'restaurant' && (
            <View style={styles.row}>
              {(['menu', 'drink'] as const).map((s) => (
                <Pressable key={s} onPress={() => setSection(s)} style={[styles.chip, section === s && styles.chipOn]}>
                  <Text style={[styles.chipText, section === s && { color: '#fff' }]}>{s === 'menu' ? 'Plat' : 'Boisson'}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable style={styles.photo} onPress={pick} accessibilityRole="button" accessibilityLabel="Choisir une photo">
            {photo.url ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="camera-outline" size={26} color={colors.primary} />}
            {uploading && <ActivityIndicator color={colors.primary} />}
          </Pressable>
          <LabeledField label="Nom">
            <Field placeholder={kind === 'restaurant' ? 'Mafé yap' : 'Cahier 200 pages'} value={name} onChangeText={setName} maxLength={50} />
          </LabeledField>
          <LabeledField label="Détail (facultatif)">
            <Field placeholder={kind === 'restaurant' ? 'Riz · sauce arachide' : 'Grands carreaux'} value={detail} onChangeText={setDetail} maxLength={120} />
          </LabeledField>
          {kind === 'shop' && (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Rayon</Text>
              <View style={styles.wrap}>
                {aisles.map((a) => {
                  const on = !otherAisle && category === a;
                  return (
                    <Pressable
                      key={a}
                      onPress={() => {
                        setOtherAisle(false);
                        setCategory(on ? '' : a);
                      }}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}>
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>{a}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setOtherAisle(true);
                    setCategory('');
                  }}
                  style={[styles.chip, otherAisle && styles.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: otherAisle }}>
                  <Text style={[styles.chipText, otherAisle && { color: '#fff' }]}>+ Autre</Text>
                </Pressable>
              </View>
              {otherAisle && <Field placeholder="Nom du rayon" value={category} onChangeText={setCategory} maxLength={30} autoFocus autoCapitalize="sentences" />}
            </View>
          )}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label="Prix (FCFA)">
                <Field keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} />
              </LabeledField>
            </View>
            {kind === 'shop' && (
              <View style={{ flex: 1 }}>
                <LabeledField label="Stock (vide : illimité)">
                  <Field keyboardType="number-pad" value={stock} onChangeText={(v) => setStock(v.replace(/\D/g, ''))} />
                </LabeledField>
              </View>
            )}
          </View>
          <PrimaryButton label="Enregistrer" disabled={!ready} loading={saving} onPress={save} />
          {item && (
            <Pressable onPress={remove} style={{ alignSelf: 'center' }} hitSlop={8}>
              <Text style={{ color: colors.dangerText, fontWeight: '700' }}>Retirer du catalogue</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  h1: { ...typo.h2, color: colors.navy },
  sub: { ...typo.small, color: colors.muted2, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primary },
  addText: { ...typo.smallStrong, color: '#fff' },
  section: { ...typo.section, color: colors.navy, marginTop: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 10 },
  thumb: { width: 56, height: 56, borderRadius: radii.sm, backgroundColor: colors.bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  itemName: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  price: { ...typo.smallStrong, color: colors.primary, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { maxHeight: 640, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  label: { ...typo.smallStrong, color: colors.navy },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...typo.smallStrong, color: colors.navy },
  photo: { alignSelf: 'center', width: 110, height: 110, borderRadius: radii.lg, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});

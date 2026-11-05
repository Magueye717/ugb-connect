import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { PhotoStrip, type StripPhoto } from '@/components/PhotoStrip';
import { EmptyState, ErrorState } from '@/components/states';
import { Chip, Field, LabeledField, PrimaryButton, SafeBottom } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type BusinessKind, type BusinessTarget, type ItemDto, type ItemSection } from '@/features/commerce/api';
import { useCommerceReference } from '@/features/commerce/useCommerceReference';
import { ApiError } from '@/lib/api';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const SECTION_LABEL: Record<ItemSection, string> = { menu: 'Menus du jour', drink: 'Boissons', article: 'Articles' };
/** The usual aisles of a campus shop; the shop's own ones are added to them. */
const AISLES = ['Fournitures', 'Impression', 'Épicerie', 'Boissons', 'Hygiène', 'Téléphonie', 'Électronique', 'Vêtements', 'Accessoires'];
/** The aisles to pick from: the usual ones and the shop's own. */
export const aislesFor = (items: Pick<ItemDto, 'category'>[]) => [...new Set([...AISLES, ...items.flatMap((i) => (i.category ? [i.category] : []))])];

/**
 * What students can order: a restaurant's menus and drinks, a shop's articles (with stock). Everyone who sees it can
 * switch an item off for today; `canManage` (owner, managers, Référencement) add, edit and remove. Goes inside a
 * ScrollView, under the screen's title.
 */
export function CatalogEditor({ target, kind, canManage, title = 'Catalogue' }: { target: BusinessTarget; kind: BusinessKind; canManage: boolean; title?: string }) {
  const [items, setItems] = useState<ItemDto[] | null>(null);
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not an empty list).
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<ItemDto | 'new' | null>(null);
  const load = useCallback(() => {
    setLoadFailed(false);
    commerceApi.catalog(target).then((r) => setItems(r.items), () => setLoadFailed(true));
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

      {!items && !loadFailed && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
      {!items && loadFailed && <ErrorState onRetry={load} />}
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
                  <View style={styles.thumb}>
                    {i.photo ? <Image source={{ uri: i.photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={20} color={colors.muted} />}
                    {i.photos.length > 1 && (
                      <View style={styles.thumbCount}>
                        <Text style={styles.thumbCountText}>{i.photos.length}</Text>
                      </View>
                    )}
                  </View>
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
                      {!i.orderable && <Text style={styles.muted}>  ·  Infos seulement</Text>}
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
          aisles={aislesFor(items ?? [])}
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

/** Add or edit one item (a sheet): also opened from the business's own page by its owner or managers. */
export function ItemEditor({ business, kind, item, aisles, onClose, onSaved }: { business: BusinessTarget; kind: 'restaurant' | 'shop'; item: ItemDto | null; aisles: string[]; onClose: () => void; onSaved: () => void }) {
  const [section, setSection] = useState<ItemSection>(item?.section ?? (kind === 'restaurant' ? 'menu' : 'article'));
  const [name, setName] = useState(item?.name ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  // A new aisle, typed: only when none of the list fits.
  const [otherAisle, setOtherAisle] = useState(false);
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [stock, setStock] = useState(item?.stock !== null && item?.stock !== undefined ? String(item.stock) : '');
  // A service done on the spot (printing, photocopies…): shown with its price, students don't order it.
  const [orderable, setOrderable] = useState(item?.orderable ?? true);
  // The cover first. The limit comes from the server; until it answers, the photos already there.
  const [photos, setPhotos] = useState<StripPhoto[]>(item ? item.photoIds.map((id, k) => ({ id, url: item.photos[k]! })) : []);
  const { reference } = useCommerceReference();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ready = name.trim().length >= 2 && /^\d+$/.test(price) && (!stock || /^\d+$/.test(stock)) && !uploading && !saving;
  const save = async () => {
    setSaving(true);
    try {
      const body = {
        section, name: name.trim(), detail: detail.trim(), price: Number(price), photoIds: photos.map((p) => p.id), orderable,
        ...(kind === 'shop' ? { category: category.trim() || null, stock: stock && orderable ? Number(stock) : null } : {}),
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
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 12, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>{item ? 'Modifier' : 'Nouvel article'}</Text>
          {kind === 'restaurant' && (
            <View style={styles.row}>
              {(['menu', 'drink'] as const).map((s) => (
                <Chip key={s} label={s === 'menu' ? 'Plat' : 'Boisson'} selected={section === s} onPress={() => setSection(s)} />
              ))}
            </View>
          )}
          <PhotoStrip
            photos={photos}
            onChange={setPhotos}
            max={reference?.maxItemPhotos ?? Math.max(1, photos.length)}
            purpose="business"
            title={kind === 'restaurant' ? 'Photos du plat' : 'Photos de l’article'}
            onUploading={setUploading}
          />
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
                    <Chip key={a} label={a} selected={on} onPress={() => {
                        setOtherAisle(false);
                        setCategory(on ? '' : a);
                      }} />
                  );
                })}
                <Chip label="+ Autre" selected={otherAisle} onPress={() => {
                    setOtherAisle(true);
                    setCategory('');
                  }} />
              </View>
              {otherAisle && <Field placeholder="Nom du rayon" value={category} onChangeText={setCategory} maxLength={30} autoFocus autoCapitalize="sentences" />}
            </View>
          )}
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Les étudiants</Text>
            <View style={styles.row}>
              <Chip label="Le commandent" icon="cart-outline" selected={orderable} onPress={() => setOrderable(true)} />
              <Chip label="Infos seulement" icon="information-circle-outline" selected={!orderable} onPress={() => setOrderable(false)} />
            </View>
            {!orderable && <Text style={styles.muted}>Affiché avec son prix (ex. impression, photocopie) : ça se fait sur place, sans commande.</Text>}
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label={orderable ? 'Prix (FCFA)' : 'Prix indicatif (FCFA)'}>
                <Field keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} />
              </LabeledField>
            </View>
            {kind === 'shop' && orderable && (
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
          <SafeBottom />
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
  sheet: { flexShrink: 1, maxHeight: 640, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  label: { ...typo.smallStrong, color: colors.navy },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbCount: { position: 'absolute', right: 3, bottom: 3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: 'rgba(10,16,40,0.75)', alignItems: 'center', justifyContent: 'center' },
  thumbCountText: { ...typo.label, color: '#fff' },
});

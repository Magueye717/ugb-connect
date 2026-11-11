import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { PhotoStrip, type StripPhoto } from '@/components/PhotoStrip';
import { EmptyState, ErrorState } from '@/components/states';
import { Chip, Field, LabeledField, PrimaryButton, SheetFooter, SheetHeader, Toggle, useDirty } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, daysLabel, WEEK_DAYS, type BusinessKind, type BusinessTarget, type ItemDto, type ItemSection } from '@/features/commerce/api';
import { useCommerceReference } from '@/features/commerce/useCommerceReference';
import { ApiError } from '@/lib/api';
import { closeGuarded } from '@/lib/leaveGuard';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const SECTION_LABEL: Record<ItemSection, string> = { menu: 'Menus du jour', drink: 'Boissons', article: 'Articles' };
/** The usual aisles of a campus shop; the shop's own ones are added to them. */
const AISLES = ['Fournitures', 'Impression', 'Épicerie', 'Boissons', 'Hygiène', 'Téléphonie', 'Électronique', 'Vêtements', 'Accessoires'];
/** The aisles to pick from: the usual ones and the shop's own. */
/** Today, 1 (lundi) to 7 (dimanche). */
const today = () => ((new Date().getDay() + 6) % 7) + 1;

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
                    {/* The weekly menu: its days; « Pas au menu aujourd’hui » when today isn't one of them. */}
                    {kind === 'restaurant' && !!i.days && (
                      <Text style={[styles.muted, !i.days.includes(today()) && { color: colors.orangeText }]} numberOfLines={1}>
                        {daysLabel(i.days)}
                        {!i.days.includes(today()) ? ' · pas au menu aujourd’hui' : ''}
                      </Text>
                    )}
                  </View>
                  <Toggle value={i.available} onValueChange={(v) => toggle(i, v)} accessibilityLabel={`${i.name} disponible`} />
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
  // Restaurants: the days it's on the menu (all: every day).
  const [days, setDays] = useState<number[]>(item?.days ?? WEEK_DAYS.map((d) => d.day));
  const toggleDay = (d: number) => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort()));
  // The cover first. The limit comes from the server; until it answers, the photos already there.
  const [photos, setPhotos] = useState<StripPhoto[]>(item ? item.photoIds.map((id, k) => ({ id, url: item.photos[k]! })) : []);
  const { reference } = useCommerceReference();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Closing with changes not saved asks first.
  const dirty = useDirty({ section, name, detail, category, price, stock, orderable, photos: photos.map((p) => p.id), days });
  const close = () => closeGuarded(dirty && !saving, onClose);
  const ready = name.trim().length >= 2 && /^\d+$/.test(price) && (!stock || /^\d+$/.test(stock)) && (kind !== 'restaurant' || days.length > 0) && !uploading && !saving;
  const save = async () => {
    setSaving(true);
    try {
      const body = {
        section, name: name.trim(), detail: detail.trim(), price: Number(price), photoIds: photos.map((p) => p.id), orderable,
        ...(kind === 'shop' ? { category: category.trim() || null, stock: stock && orderable ? Number(stock) : null } : { days: days.length === 7 ? null : days }),
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
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <SheetHeader onClose={close} titleStyle={styles.sheetTitle}>{item ? 'Modifier' : 'Nouvel article'}</SheetHeader>
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
            // Référencement documents a full catalogue: its own (higher) limit.
            max={('editorOf' in business ? reference?.editorMaxItemPhotos : undefined) ?? reference?.maxItemPhotos ?? Math.max(1, photos.length)}
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
          {kind === 'restaurant' && (
            <View style={{ gap: 8 }}>
              <Text style={styles.daysLabel}>Au menu le</Text>
              <View style={styles.days}>
                {WEEK_DAYS.map((d) => {
                  const on = days.includes(d.day);
                  return (
                    <Pressable key={d.day} onPress={() => toggleDay(d.day)} style={[styles.day, on && styles.dayOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={d.long}>
                      <Text style={[styles.dayText, on && { color: '#fff' }]}>{d.short}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.muted}>
                {days.length === 0 ? 'Choisis au moins un jour.' : days.length === 7 ? 'Tous les jours. ' : `Publié automatiquement : ${daysLabel(days)}. `}
                Le bouton « disponible » le retire juste pour aujourd’hui.
              </Text>
            </View>
          )}
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
            <Text style={styles.label}>Comment les étudiants l’obtiennent ?</Text>
            <View style={styles.row}>
              <Chip label="Commande dans l’app" icon="cart-outline" selected={orderable} onPress={() => setOrderable(true)} />
              <Chip label="Sur place" icon="storefront-outline" selected={!orderable} onPress={() => setOrderable(false)} />
            </View>
            <Text style={styles.muted}>
              {orderable
                ? 'Les étudiants l’ajoutent au panier et passent commande dans l’app : tu la reçois dans « Commandes ».'
                : 'Affiché avec son prix, sans panier (ex. impression, photocopie) : le service se fait sur place. Les étudiants peuvent te contacter sur WhatsApp.'}
            </Text>
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
          {item && (
            <Pressable onPress={remove} style={{ alignSelf: 'center' }} hitSlop={8}>
              <Text style={{ color: colors.dangerText, fontWeight: '700' }}>Retirer du catalogue</Text>
            </Pressable>
          )}
        </ScrollView>
        {/* Pinned, as on every form. */}
        <SheetFooter>
          <PrimaryButton label="Enregistrer" disabled={!ready} loading={saving} onPress={save} />
        </SheetFooter>
        </View>
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
  daysLabel: { ...typo.smallStrong, color: colors.navy },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, minHeight: 40, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.primary },
  dayText: { ...typo.smallStrong, color: colors.primary },
});

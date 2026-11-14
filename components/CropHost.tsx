import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, typo } from '@/constants/theme';
import { closeCrop, subscribeCrop, type CropRequest } from '@/lib/crop';

const MAX_ZOOM = 5;
const MARGIN = 20;

type Point = { x: number; y: number };
/** What the crop gestures read (one crop screen at a time): the zoom and shift on screen, and where a gesture began. */
const box = {
  zoom: 1,
  shift: { x: 0, y: 0 } as Point,
  fit: (_z: number, s: Point) => s,
  start: { zoom: 1, shift: { x: 0, y: 0 } as Point, dist: 0, two: false },
};

/** Mounted once (root layout): shows the crop screen when `cropPhoto` asks for it. */
export function CropHost() {
  const [req, setReq] = useState<CropRequest | null>(null);
  useEffect(() => subscribeCrop(setReq), []);
  if (!req) return null;
  return <CropEditor key={req.id} req={req} />;
}

type Frame = { label: string; ratio: number | 'source' };
const FRAMES: Frame[] = [
  { label: 'Original', ratio: 'source' },
  { label: 'Carré', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
];

/**
 * Our own crop screen (the phone's only crops square on iPhone): a frame of the chosen shape stays still, the picture
 * moves under it: one finger slides it, two fingers zoom. The frame always stays filled. « Valider » cuts exactly what
 * the frame shows, from the full-size picture.
 */
function CropEditor({ req }: { req: CropRequest }) {
  const insets = useSafeAreaInsets();
  const iw = req.width || 1;
  const ih = req.height || 1;
  const wanted = req.aspect ? req.aspect[0] / req.aspect[1] : null;
  const [frameIndex, setFrameIndex] = useState(() => {
    const i = wanted ? FRAMES.findIndex((f) => typeof f.ratio === 'number' && Math.abs(f.ratio - wanted) < 0.01) : -1;
    return i >= 0 ? i : 0;
  });
  const ratio = (() => {
    const r = FRAMES[frameIndex]!.ratio;
    return r === 'source' ? iw / ih : r;
  })();
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  // The frame: as big as the area allows, in the chosen shape, centered.
  const maxW = Math.max(1, area.w - MARGIN * 2);
  const maxH = Math.max(1, area.h - MARGIN * 2);
  const fw = maxW / maxH > ratio ? maxH * ratio : maxW;
  const fh = fw / ratio;
  // The picture covers the frame at zoom 1.
  const base = Math.max(fw / iw, fh / ih);
  const dispW = iw * base * zoom;
  const dispH = ih * base * zoom;

  const clamp = (z: number, s: { x: number; y: number }) => {
    const w = iw * base * z;
    const h = ih * base * z;
    const mx = Math.max(0, (w - fw) / 2);
    const my = Math.max(0, (h - fh) / 2);
    return { x: Math.min(mx, Math.max(-mx, s.x)), y: Math.min(my, Math.max(-my, s.y)) };
  };

  // The gestures read the latest values from `box`, kept up to date after each render (the responder is made once:
  // remade mid-gesture, it would lose the finger's travel).
  useLayoutEffect(() => {
    box.zoom = zoom;
    box.shift = shift;
    box.fit = clamp;
  });
  const [responder] = useState(() => {
    const distance = (t: readonly { pageX: number; pageY: number }[]) => Math.hypot(t[0]!.pageX - t[1]!.pageX, t[0]!.pageY - t[1]!.pageY);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const t = e.nativeEvent.touches;
        box.start = { zoom: box.zoom, shift: box.shift, dist: t.length > 1 ? distance(t) : 0, two: t.length > 1 };
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        if (t.length > 1) {
          // A second finger joined: zoom from here on.
          if (!box.start.two) box.start = { zoom: box.zoom, shift: box.shift, dist: distance(t), two: true };
          const z = Math.min(MAX_ZOOM, Math.max(1, box.start.zoom * (distance(t) / Math.max(1, box.start.dist))));
          setZoom(z);
          setShift(box.fit(z, box.start.shift));
        } else if (!box.start.two) {
          setShift(box.fit(box.zoom, { x: box.start.shift.x + g.dx, y: box.start.shift.y + g.dy }));
        }
      },
      onPanResponderRelease: () => {
        box.start.two = false;
      },
    });
  });

  const chooseFrame = (i: number) => {
    setFrameIndex(i);
    setZoom(1);
    setShift({ x: 0, y: 0 });
  };

  const done = async () => {
    setSaving(true);
    try {
      const k = base * zoom;
      const originX = Math.max(0, Math.round((dispW / 2 - shift.x - fw / 2) / k));
      const originY = Math.max(0, Math.round((dispH / 2 - shift.y - fh / 2) / k));
      const width = Math.min(iw - originX, Math.round(fw / k));
      const height = Math.min(ih - originY, Math.round(fh / k));
      const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
      const image = await ImageManipulator.manipulate(req.uri).crop({ originX, originY, width, height }).renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      closeCrop(req.id, { uri: saved.uri, width: saved.width, height: saved.height });
    } catch {
      // The crop couldn't be made (an old app build without the module): the whole picture goes instead.
      closeCrop(req.id, { uri: req.uri, width: req.width, height: req.height });
    }
  };

  const fx = (area.w - fw) / 2;
  const fy = (area.h - fh) / 2;

  return (
    <Modal visible animationType="slide" onRequestClose={() => closeCrop(req.id, null)} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Pressable onPress={() => closeCrop(req.id, null)} hitSlop={10} accessibilityRole="button">
            <Text style={styles.topBtn}>Annuler</Text>
          </Pressable>
          <Text style={styles.title}>Recadrer</Text>
          <Pressable onPress={done} disabled={saving} hitSlop={10} accessibilityRole="button">
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.topBtn, styles.topDone]}>Valider</Text>}
          </Pressable>
        </View>

        <View style={styles.area} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...responder.panHandlers}>
          {area.w > 0 && (
            <>
              <Image
                source={{ uri: req.uri }}
                style={{ position: 'absolute', width: dispW, height: dispH, left: area.w / 2 + shift.x - dispW / 2, top: area.h / 2 + shift.y - dispH / 2 }}
                contentFit="fill"
              />
              {/* Outside the frame: darkened. */}
              <View pointerEvents="none" style={[styles.mask, { left: 0, right: 0, top: 0, height: fy }]} />
              <View pointerEvents="none" style={[styles.mask, { left: 0, right: 0, top: fy + fh, bottom: 0 }]} />
              <View pointerEvents="none" style={[styles.mask, { left: 0, width: fx, top: fy, height: fh }]} />
              <View pointerEvents="none" style={[styles.mask, { right: 0, width: fx, top: fy, height: fh }]} />
              {/* The frame, with its thirds. */}
              <View pointerEvents="none" style={[styles.frame, { left: fx, top: fy, width: fw, height: fh }]}>
                <View style={[styles.grid, { left: fw / 3, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
                <View style={[styles.grid, { left: (2 * fw) / 3, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
                <View style={[styles.grid, { top: fh / 3, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
                <View style={[styles.grid, { top: (2 * fh) / 3, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
              </View>
            </>
          )}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frames}>
            {FRAMES.map((f, i) => {
              const on = i === frameIndex;
              return (
                <Pressable key={f.label} onPress={() => chooseFrame(i)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.hint}>
            <Ionicons name="hand-left-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.hintText}>Glisse pour cadrer · pince pour zoomer</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05080F' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, height: 52 },
  title: { ...typo.title, color: '#fff' },
  topBtn: { ...typo.bodyStrong, color: 'rgba(255,255,255,0.85)' },
  topDone: { color: colors.accent },
  area: { flex: 1, overflow: 'hidden' },
  mask: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  frame: { position: 'absolute', borderWidth: 2, borderColor: '#fff' },
  grid: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.45)' },
  bottom: { paddingTop: 12, gap: 10 },
  frames: { gap: 8, paddingHorizontal: 18 },
  chip: { paddingHorizontal: 14, minHeight: 34, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  chipOn: { backgroundColor: '#fff' },
  chipText: { ...typo.smallStrong, color: '#fff' },
  chipTextOn: { color: colors.navy },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hintText: { ...typo.caption, color: 'rgba(255,255,255,0.7)' },
});

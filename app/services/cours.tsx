import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader, StatusChip } from '@/components/ui';
import { schedule, weekDays } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';

const TODAY = weekDays[0].id;

export default function CoursScreen() {
  const [day, setDay] = useState(TODAY);
  const courses = schedule[day] ?? [];
  const moved = courses.find((c) => c.movedFrom);
  const current = weekDays.find((d) => d.id === day) ?? weekDays[0];
  const dayLabel = current.short.charAt(0) + current.short.slice(1).toLowerCase() + '.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Mes cours" subtitle={`Semaine du ${weekDays[0].day} octobre`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.week}>
          {weekDays.map((d) => {
            const on = d.id === day;
            return (
              <Pressable key={d.id} onPress={() => setDay(d.id)} style={[styles.day, on && styles.dayOn]}>
                <Text style={[styles.dayShort, on && styles.dayTextOn]}>{d.short}</Text>
                <Text style={[styles.dayNum, on && styles.dayTextOn]}>{d.day}</Text>
              </Pressable>
            );
          })}
        </View>

        {moved && (
          <View style={styles.alert}>
            <View style={styles.alertIcon}>
              <Ionicons name="notifications" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{moved.title} déplacé</Text>
              <Text style={styles.alertSub}>
                Maintenant à {moved.start.replace(':00', 'h')} · {moved.room} (au lieu de {moved.movedFrom})
              </Text>
            </View>
          </View>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.section}>{day === TODAY ? 'Aujourd’hui' : dayLabel}</Text>
          <Text style={styles.link}>
            {dayLabel} {current.day} oct.
          </Text>
        </View>

        {courses.length === 0 && <Text style={styles.empty}>Pas de cours ce jour-là.</Text>}

        {courses.map((c) => (
          <View key={c.id} style={styles.slot}>
            <View style={styles.time}>
              <Text style={styles.start}>{c.start}</Text>
              <Text style={styles.end}>{c.end}</Text>
            </View>
            <View style={[styles.course, shadow.card, c.movedFrom && styles.courseMoved]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.courseTitle}>{c.title}</Text>
                <Text style={styles.muted}>
                  {c.room} · {c.teacher}
                </Text>
              </View>
              {c.movedFrom ? <StatusChip label="Modifié" tone="warning" /> : <KindChip kind={c.kind} />}
            </View>
          </View>
        ))}

        <Pressable style={[styles.inscription, shadow.card]} onPress={() => router.push('/services/inscription')}>
          <View style={styles.inscriptionIcon}>
            <Ionicons name="book-outline" size={20} color={colors.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.courseTitle}>Inscription pédagogique</Text>
            <Text style={styles.muted}>Ouverte jusqu’au 10 nov.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function KindChip({ kind }: { kind: string }) {
  return (
    <View style={styles.kind}>
      <Text style={styles.kindText}>{kind}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 50, paddingVertical: 8, borderRadius: radii.md, alignItems: 'center', gap: 2, backgroundColor: colors.card },
  dayOn: { backgroundColor: colors.primary },
  dayShort: { ...typo.label, color: colors.muted2 },
  dayNum: { ...typo.title, color: colors.navy },
  dayTextOn: { color: '#fff' },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    padding: 12,
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { ...typo.bodyStrong, color: colors.navy },
  alertSub: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  section: { ...typo.section, color: colors.navy },
  link: { ...typo.smallStrong, color: colors.primary },
  empty: { color: colors.muted2, textAlign: 'center', paddingVertical: 24 },
  slot: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  time: { width: 46, paddingTop: 12 },
  start: { ...typo.bodyStrong, color: colors.navy },
  end: { ...typo.caption, color: colors.muted2 },
  course: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  courseMoved: { borderLeftColor: colors.orange },
  courseTitle: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  kind: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  kindText: { ...typo.captionStrong, color: colors.primary },
  inscription: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  inscriptionIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: '#EEE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

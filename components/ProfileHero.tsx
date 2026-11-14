import { StyleSheet, Text, View } from 'react-native';

import { AvatarPicker } from '@/components/AvatarPicker';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

/**
 * The person's card at the top of an account screen, the same in every space as on the student profile: the brand's
 * blue, the photo in its orange ring (tap to change it), the name in white, then small chips (the organization, the
 * role…). Switching space keeps the same card: only the chips tell where you are.
 */
export function ProfileHero({ chips }: { chips: (string | null | undefined | false)[] }) {
  const { user } = useAuth();
  const shown = chips.filter((c): c is string => !!c);
  return (
    <View style={[styles.hero, shadow.raised]}>
      <AvatarPicker size={64} tone="solid" ring />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.name} numberOfLines={2}>
          {user?.firstName} {user?.lastName}
        </Text>
        {shown.length > 0 && (
          <View style={styles.chips}>
            {shown.map((c) => (
              <View key={c} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {c}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.primary, borderRadius: radii.lg, padding: 18 },
  name: { ...typo.h2, color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.14)' },
  chipText: { ...typo.label, color: '#fff' },
});

/**
 * Who is signed in, on a work space's account screen: a slim row (photo, name, number). The space itself is named at
 * the top of every screen (SpaceBar): the person isn't the subject here.
 */
export function AccountRow() {
  const { user } = useAuth();
  const phone = user?.phone?.replace(/^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
  return (
    <View style={[accountStyles.account, shadow.card]}>
      <AvatarPicker size={44} tone="soft" />
      <View style={{ flex: 1 }}>
        <Text style={accountStyles.accountName} numberOfLines={1}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={accountStyles.accountSub} numberOfLines={1}>
          Connecté{phone ? ` · ${phone}` : ''}
        </Text>
      </View>
    </View>
  );
}

const accountStyles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  accountName: { ...typo.bodyStrong, color: colors.navy },
  accountSub: { ...typo.caption, color: colors.muted2, marginTop: 1 },
});

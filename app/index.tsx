import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BrandLogo } from '@/components/BrandLogo';
import { colors } from '@/constants/theme';

import { spaceHome, useAuth } from '@/context/AuthContext';

// Entry point: the account's current space, or the welcome screen.
export default function Index() {
  const { status, user, space } = useAuth();
  // The saved session is being checked: the splash stays up; past its time limit (slow network), the same blue and logo.
  if (status === 'restoring') {
    return (
      <View style={styles.splash}>
        <BrandLogo size={200} />
      </View>
    );
  }
  if (!user) return <Redirect href="/(auth)/welcome" />;
  return <Redirect href={spaceHome(space)} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});

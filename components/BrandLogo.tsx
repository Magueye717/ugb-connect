import { Image } from 'expo-image';

/** The UGB Connect logo: the app icon's white tile, corners already rounded in the file. */
export function BrandLogo({ size }: { size: number }) {
  return (
    <Image
      source={require('@/assets/images/logo.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="UGB Connect"
    />
  );
}

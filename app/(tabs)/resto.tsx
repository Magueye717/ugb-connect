import { TabScreen } from '@/components/TabScreen';
import { MarketBoard, PrivateRestosBoard } from '@/features/commerce/BusinessBoard';

// Commander: everything ordered on campus, in one place (one basket): the shops first (what opens), then the private restaurants.
// The university restaurants' menus are on the home screen. Links open a section with ?vue=.
export default function CommanderScreen() {
  return (
    <TabScreen
      title="Commander"
      views={[
        { key: 'boutiques', label: 'Boutiques', icon: 'storefront-outline', render: () => <MarketBoard /> },
        { key: 'prives', label: 'Restaurants', icon: 'fast-food-outline', render: () => <PrivateRestosBoard /> },
      ]}
    />
  );
}

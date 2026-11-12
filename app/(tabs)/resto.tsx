import { TabScreen } from '@/components/TabScreen';
import { MarketBoard, PrivateRestosBoard } from '@/features/commerce/BusinessBoard';

// Commander: everything ordered on campus, in one place (one basket): the private restaurants first, then the shops.
// The university restaurants' menus are on the home screen. Links open a section with ?vue=.
export default function CommanderScreen() {
  return (
    <TabScreen
      title="Commander"
      views={[
        { key: 'prives', label: 'Restaurants', icon: 'fast-food-outline', subtitle: 'Commande en ligne · à emporter ou livré', render: () => <PrivateRestosBoard /> },
        { key: 'boutiques', label: 'Boutiques', icon: 'storefront-outline', subtitle: 'Le marché des boutiques du campus', render: () => <MarketBoard /> },
      ]}
    />
  );
}

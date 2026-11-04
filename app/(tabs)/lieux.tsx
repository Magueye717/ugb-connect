import { TabScreen } from '@/components/TabScreen';
import { MarketBoard } from '@/features/commerce/BusinessBoard';
import { LostBoard } from '@/features/lost/LostBoard';
import { PlacesBoard } from '@/features/places/PlacesBoard';

// Campus: places to know, lost and found, and the shops (order online).
export default function CampusScreen() {
  return (
    <TabScreen
      title="Campus"
      views={[
        { key: 'lieux', label: 'Lieux', icon: 'map-outline', subtitle: 'Les endroits à connaître', render: () => <PlacesBoard /> },
        { key: 'objets', label: 'Objets perdus', icon: 'search-outline', subtitle: 'Perdus et trouvés sur le campus', render: () => <LostBoard /> },
        { key: 'boutiques', label: 'Boutiques', icon: 'storefront-outline', subtitle: 'Le marché des boutiques du campus', render: () => <MarketBoard /> },
      ]}
    />
  );
}

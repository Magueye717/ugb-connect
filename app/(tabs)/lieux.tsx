import { TabScreen } from '@/components/TabScreen';
import { MarketBoard } from '@/features/commerce/BusinessBoard';
import { LostBoard } from '@/features/lost/LostBoard';
import { PlacesBoard } from '@/features/places/PlacesBoard';

// Campus: the shops (order online), lost and found, places to know. Opens on the shops, the everyday use; links
// still open any section with ?vue=.
export default function CampusScreen() {
  return (
    <TabScreen
      title="Campus"
      views={[
        { key: 'boutiques', label: 'Boutiques', icon: 'storefront-outline', subtitle: 'Le marché des boutiques du campus', render: () => <MarketBoard /> },
        { key: 'objets', label: 'Objets perdus', icon: 'search-outline', subtitle: 'Perdus et trouvés sur le campus', render: () => <LostBoard /> },
        { key: 'lieux', label: 'Lieux', icon: 'map-outline', subtitle: 'Les endroits à connaître', render: () => <PlacesBoard /> },
      ]}
    />
  );
}

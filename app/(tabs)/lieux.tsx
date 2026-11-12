import { TabScreen } from '@/components/TabScreen';
import { EventsBoard } from '@/features/events/EventsBoard';
import { LostBoard } from '@/features/lost/LostBoard';
import { PlacesBoard } from '@/features/places/PlacesBoard';

// Campus: what happens on campus (events), lost and found, places to know. Links open a section with ?vue=.
export default function CampusScreen() {
  return (
    <TabScreen
      title="Campus"
      views={[
        { key: 'evenements', label: 'Événements', icon: 'sparkles-outline', subtitle: 'Soirées, conférences et sorties', render: () => <EventsBoard /> },
        { key: 'objets', label: 'Objets perdus', icon: 'search-outline', subtitle: 'Perdus et trouvés sur le campus', render: () => <LostBoard /> },
        { key: 'lieux', label: 'Lieux', icon: 'map-outline', subtitle: 'Les endroits à connaître', render: () => <PlacesBoard /> },
      ]}
    />
  );
}

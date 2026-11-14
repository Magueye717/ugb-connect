import { TabScreen } from '@/components/TabScreen';
import { EntraideBoard } from '@/features/campus/EntraideBoard';
import { EventsBoard } from '@/features/events/EventsBoard';
import { PlacesBoard } from '@/features/places/PlacesBoard';

// Campus, three roles: Entraide (what students post for each other: lost and found, housing), what happens on
// campus (events), the places to know. Links open a section with ?vue= (objets and logement open Entraide).
export default function CampusScreen() {
  return (
    <TabScreen
      title="Campus"
      views={[
        { key: 'entraide', label: 'Entraide', icon: 'people-outline', aliases: ['objets', 'logement'], render: () => <EntraideBoard /> },
        { key: 'evenements', label: 'Événements', icon: 'sparkles-outline', render: () => <EventsBoard /> },
        { key: 'lieux', label: 'Lieux', icon: 'map-outline', render: () => <PlacesBoard /> },
      ]}
    />
  );
}

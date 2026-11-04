import { TabScreen } from '@/components/TabScreen';
import { CaravanBoard } from '@/features/caravans/CaravanBoard';
import { SunuTaxiBoard } from '@/features/taxi/SunuTaxiBoard';

// Trajets: short shared rides (Sunu Taxi, the everyday use, shown first) and long trips (caravanes).
export default function TrajetsScreen() {
  return (
    <TabScreen
      title="Trajets"
      views={[
        { key: 'taxi', label: 'Sunu Taxi', icon: 'car-outline', subtitle: 'Partage un taxi entre étudiants', render: () => <SunuTaxiBoard /> },
        { key: 'caravanes', label: 'Caravanes', icon: 'bus-outline', subtitle: 'Réserve ton billet en ligne', render: () => <CaravanBoard /> },
      ]}
    />
  );
}

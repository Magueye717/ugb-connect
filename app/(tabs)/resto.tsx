import { TabScreen } from '@/components/TabScreen';
import { PrivateRestosBoard } from '@/features/commerce/BusinessBoard';
import { RestoUBoard } from '@/features/food/RestoUBoard';

// Manger: the private restaurants first (order online), then the university restaurants' menus.
export default function MangerScreen() {
  return (
    <TabScreen
      title="Manger"
      views={[
        { key: 'prives', label: 'Restos privés', subtitle: 'Commande en ligne · à emporter ou livré', render: () => <PrivateRestosBoard /> },
        { key: 'publics', label: 'Restos publics', subtitle: 'Menus des restaurants universitaires', render: () => <RestoUBoard /> },
      ]}
    />
  );
}

import { useAuth } from '@/context/AuthContext';
import { TeamScreen } from '@/features/team/TeamScreen';

/** The entity's team (all its spaces): here, managers prepare departures and controllers scan. Only the owner sees this tab. */
export default function MonEquipe() {
  const { organizer } = useAuth();
  if (!organizer) return null;
  return <TeamScreen orgId={organizer.orgId} name={organizer.name} intro="Les gérants préparent les départs ; les contrôleurs scannent les billets." />;
}

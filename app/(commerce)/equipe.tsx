import { useAuth } from '@/context/AuthContext';
import { TeamScreen } from '@/features/team/TeamScreen';

/** The entity's team (all its spaces); the restaurant's and shop's members receive their orders. Only the owner sees this tab. */
export default function Equipe() {
  const { business } = useAuth();
  if (!business) return null;
  return <TeamScreen orgId={business.orgId} name={business.name} intro="Gérants et employés reçoivent les nouvelles commandes de leur espace." />;
}

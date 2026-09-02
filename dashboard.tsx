import { ProtectedPage } from '@/components/ProtectedPage';
import { DashboardPage } from '@/screens/DashboardPage';

export default function DashboardRoute() {
  return (
    <ProtectedPage>
      <DashboardPage />
    </ProtectedPage>
  );
}

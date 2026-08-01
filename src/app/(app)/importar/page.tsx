import { requireCapability } from '@/lib/auth';
import { Importador } from './Importador';

export const dynamic = 'force-dynamic';

export default async function ImportarPage() {
  await requireCapability('gestionar_inventario');
  return <Importador />;
}

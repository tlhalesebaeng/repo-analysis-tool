import { useApi } from '../api/hooks.js';
import ApiStatus from '../components/ui/ApiStatus.jsx';
import PlaceholderPage from '../components/ui/PlaceholderPage.jsx';

export default function ReposPage() {
  const health = useApi('/health');

  return (
    <PlaceholderPage
      title="Repositories"
      note="Repository import (zip upload and remote URL cloning) lands in milestone M1."
    >
      <ApiStatus state={health} />
    </PlaceholderPage>
  );
}

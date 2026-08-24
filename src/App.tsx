// Корень приложения: два уровня без роутера (CLAUDE.md «Чего не делать»).
// Уровень выбирается по currentStageId в store: null — обзор (SPEC §4.1),
// иначе детализация этапа (SPEC §4.2). Deep-link (?stage=…, SPEC §4.7)
// подставит id в store до первого рендера — отдельная задача M3.
import { Overview } from './components/Overview';
import { StageDetail } from './components/StageDetail';
import { useProcessStore } from './store/useProcessStore';

function App() {
  const currentStageId = useProcessStore((state) => state.currentStageId);

  return currentStageId === null ? <Overview /> : <StageDetail />;
}

export default App;

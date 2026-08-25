// Корень приложения: два уровня без роутера (CLAUDE.md «Чего не делать»).
// Уровень выбирается по currentStageId в store: null — обзор (SPEC §4.1),
// иначе детализация этапа (SPEC §4.2). Deep-link (?stage=&node=, SPEC §4.7)
// разбирается хуком useDeepLink: он подставляет id в store сразу после
// монтирования и дальше синхронизирует URL (replaceState) при любой
// навигации — см. src/hooks/useDeepLink.ts.
import { Overview } from './components/Overview';
import { StageDetail } from './components/StageDetail';
import { useDeepLink } from './hooks/useDeepLink';
import { useProcessStore } from './store/useProcessStore';

function App() {
  useDeepLink();
  const currentStageId = useProcessStore((state) => state.currentStageId);

  return currentStageId === null ? <Overview /> : <StageDetail />;
}

export default App;

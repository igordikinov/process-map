// Корень приложения. Уровень 2 (StageDetail) появится в M2 — сейчас всегда
// рендерится обзор, клик по карточке только меняет currentStageId в store.
import { Overview } from './components/Overview';

function App() {
  return <Overview />;
}

export default App;

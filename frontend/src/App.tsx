// App — shell. PR 1에서 VoiceShell로 위임.
// 기존 1683줄의 음성 화면 골조는 shared/layout/VoiceShell + features/{tbm,ehs}/* + shared/* 로 분해됨.
// TBMScreen이 `../App`을 import하므로 default export 시그니처 유지.
import VoiceShell from "./shared/layout/VoiceShell";
import type { SessionDomain } from "./services/sessionModel";
import "./App.css";

interface AppProps {
  sessionId?: string;
  initialMode?: "TBM" | "EHS";
  initialDomain?: SessionDomain;
}

function App({ sessionId, initialMode, initialDomain }: AppProps = {}) {
  return (
    <VoiceShell
      sessionId={sessionId}
      initialMode={initialMode}
      initialDomain={initialDomain}
    />
  );
}

export default App;

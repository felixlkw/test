import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import HomeScreen from "./screens/HomeScreen";
import TBMScreen from "./screens/TBMScreen";
import PrepareScreen from "./screens/PrepareScreen";
import FinishScreen from "./screens/FinishScreen";
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { createEmptySession } from "./services/sessionModel";
import { putSession } from "./services/db";

const basename = "/";

// Legacy `/ehs` (no sessionId) 진입 — 외부 링크/북마크/뒤로가기 호환.
// 신규 EHS 흐름은 HomeScreen에서 createEmptySession 후 `/ehs/:id`로 직접 진입한다.
// 이 wrapper는 sessionId 없이 도달한 경우에만 1회 세션 생성 후 redirect.
function EhsAutoRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = createEmptySession("EHS", "korean");
        await putSession(s);
        if (!cancelled) navigate(`/ehs/${s.session_id}`, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  if (error) {
    return (
      <div className="min-h-screen bg-pwc-bg text-pwc-ink flex items-center justify-center p-6 text-sm">
        EHS 세션을 시작하지 못했습니다 — {error}
      </div>
    );
  }
  return null;
}

export default function Router() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        {/* PR A — c6 결정 1=B: 4 라우트 분리. */}
        <Route path="/tbm/:sessionId/prepare" element={<PrepareScreen />} />
        {/* PR B (c6 §3.VII) — RunScreen rename: `/tbm/:sessionId/run` 신규.
             더 구체적인 라우트가 먼저 매치되도록 legacy `/tbm/:sessionId`보다 위에 둔다.
             VoiceShell wrapper(TBMScreen)는 동일 — 라우트만 분기. */}
        <Route path="/tbm/:sessionId/run" element={<TBMScreen />} />
        {/* PR D (c6 §3.IX) — 종료 모드 progressive form. */}
        <Route path="/tbm/:sessionId/finish" element={<FinishScreen />} />
        {/* legacy `/tbm/:sessionId` — backward compat (draft resume / v0.2.0 외부 링크 / 북마크 / 뒤로가기). */}
        <Route path="/tbm/:sessionId" element={<TBMScreen />} />
        {/* EHS — sessionId 보유 세션은 TBMScreen(VoiceShell)으로 직행. handlePhotoCaptured
             가 sessionId를 필요로 하므로 EHS도 영속 세션을 사용한다(Phase 2.x EHS-photo 패치). */}
        <Route path="/ehs/:sessionId" element={<TBMScreen forceMode="EHS" />} />
        {/* legacy `/ehs` — 외부 링크/북마크 호환. 1회 세션 생성 후 `/ehs/:id`로 redirect. */}
        <Route path="/ehs" element={<EhsAutoRedirect />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

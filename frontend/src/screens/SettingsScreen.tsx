import { useState } from "react";
import TopBar from "../components/TopBar";
import RuleLine from "../components/RuleLine";
import { useSessionList } from "../hooks/useSession";

export default function SettingsScreen() {
  const { sessions, clearAll } = useSessionList();
  const [busy, setBusy] = useState(false);

  const handleClearAll = async () => {
    if (!confirm(`저장된 세션 ${sessions.length}개를 모두 삭제합니다. 계속할까요?`)) return;
    setBusy(true);
    await clearAll();
    setBusy(false);
    alert("모든 로컬 데이터를 삭제했습니다.");
  };

  return (
    <div className="w-full min-h-screen bg-pwc-bg text-pwc-ink flex flex-col">
      <TopBar title="설정" backTo="/" />

      <div className="flex-1 px-5 py-6 flex flex-col gap-8">
        <section>
          <h2 className="text-[16px] font-bold">앱 정보</h2>
          <RuleLine className="mt-2 mb-4" />
          <div className="flex justify-between text-sm py-2 border-b border-pwc-border">
            <span className="text-pwc-ink-soft">버전</span>
            <span className="font-semibold">0.1.0 · Phase B</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b border-pwc-border">
            <span className="text-pwc-ink-soft">저장된 세션</span>
            <span className="font-semibold">{sessions.length}개</span>
          </div>
          <div className="flex justify-between text-sm py-2">
            <span className="text-pwc-ink-soft">빌드</span>
            <span className="font-semibold">PwC Brand · Light</span>
          </div>
        </section>

        <section>
          <h2 className="text-[16px] font-bold">데이터</h2>
          <RuleLine className="mt-2 mb-4" />
          <button
            onClick={handleClearAll}
            disabled={busy || sessions.length === 0}
            className="w-full rounded-pwc bg-pwc-orange text-white py-3 text-sm font-semibold active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pwc-orange-deep"
          >
            모든 로컬 데이터 삭제 →
          </button>
          <p className="text-[11px] text-pwc-ink-mute mt-2">
            기기에 저장된 모든 TBM 세션과 대화 기록이 영구 삭제됩니다.
          </p>
        </section>
      </div>
    </div>
  );
}

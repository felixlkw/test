import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { useSessionList } from "../hooks/useSession";
import { IconTrash, IconChevronRight } from "../components/Icon";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const { sessions, loading, remove } = useSessionList();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("이 세션을 삭제할까요?")) return;
    await remove(id);
  };

  return (
    <div className="w-full min-h-screen bg-pwc-bg text-pwc-ink flex flex-col">
      <TopBar title="과거 TBM 기록" backTo="/" />

      <div className="flex-1 px-5 py-6">
        {loading && <div className="text-pwc-ink-mute text-sm">불러오는 중...</div>}

        {!loading && sessions.length === 0 && (
          <div className="text-center text-pwc-ink-mute text-sm mt-20">
            저장된 세션이 없습니다.
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <ul className="divide-y divide-pwc-border border-t border-pwc-border">
            {sessions.map((s) => {
              const isConfirmed = s.status === "confirmed";
              return (
                <li
                  key={s.session_id}
                  onClick={() => navigate(`/tbm/${s.session_id}`)}
                  className="w-full flex items-center gap-3 py-4 text-left hover:bg-pwc-orange-wash transition cursor-pointer"
                >
                  <div className="w-24 shrink-0 pl-1">
                    <div className="text-sm font-bold">{formatDate(s.updated_at)}</div>
                    <div className="text-[11px] text-pwc-ink-mute">{formatTime(s.updated_at)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider ${
                          isConfirmed
                            ? "text-pwc-ink bg-pwc-bg-card"
                            : "text-pwc-orange bg-pwc-orange-wash"
                        }`}
                      >
                        {isConfirmed ? "확정" : "초안"}
                      </span>
                      <span className="text-[10px] text-pwc-ink-mute uppercase tracking-wider">
                        {s.mode}
                      </span>
                    </div>
                    <div className="text-sm font-semibold truncate">
                      {s.work_type || "제목 없음"}
                    </div>
                    <div className="text-[11px] text-pwc-ink-mute mt-0.5">
                      메시지 {s.messages.length}개 · 체크리스트 {s.checklist_items.length}개
                    </div>
                  </div>
                  <IconChevronRight size={16} className="text-pwc-ink-mute shrink-0" />
                  <button
                    onClick={(e) => handleDelete(s.session_id, e)}
                    className="shrink-0 w-9 h-9 flex items-center justify-center text-pwc-ink-mute hover:text-pwc-orange"
                    aria-label="삭제"
                  >
                    <IconTrash size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

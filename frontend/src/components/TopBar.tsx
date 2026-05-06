// TopBar — BackTopBar pattern. 정적 화면(History · Settings · Prepare 등)에서 좌측
// 뒤로가기 + 중앙 타이틀의 단순 상단 바. RunScreen 음성 상단(VoiceTopBar)과 명시
// 분리된 역할이며, 이름은 호환 보존을 위해 유지(rename 보류 — felix lock §6 Q6 결정 시).
// PR E 후보: file rename → BackTopBar.tsx + import 갱신.
import { useNavigate } from "react-router-dom";
import RuleLine from "./RuleLine";
import { IconChevronLeft } from "./Icon";

interface TopBarProps {
  title: string;
  backTo?: string;
  right?: React.ReactNode;
}

/** BackTopBar pattern — for static screens with `backTo`. RunScreen uses VoiceTopBar. */
export default function TopBar({ title, backTo, right }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <div className="w-full bg-pwc-bg text-pwc-ink">
      <div className="h-14 flex items-center justify-between px-4">
        <button
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          className="w-10 h-10 flex items-center justify-center text-pwc-ink hover:text-pwc-orange active:scale-95 transition"
          aria-label="back"
        >
          <IconChevronLeft size={22} />
        </button>
        <h1 className="font-serif-display text-[18px] text-pwc-ink truncate">
          {title}
        </h1>
        <div className="w-10 h-10 flex items-center justify-center text-pwc-ink-soft">
          {right}
        </div>
      </div>
      <RuleLine />
    </div>
  );
}

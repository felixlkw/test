import { useNavigate } from "react-router-dom";
import RuleLine from "./RuleLine";
import { IconChevronLeft } from "./Icon";

interface TopBarProps {
  title: string;
  backTo?: string;
  right?: React.ReactNode;
}

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
        <h1 className="text-[15px] font-bold truncate">{title}</h1>
        <div className="w-10 h-10 flex items-center justify-center text-pwc-ink-soft">
          {right}
        </div>
      </div>
      <RuleLine />
    </div>
  );
}

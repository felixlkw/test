// PortalRoot — Portal helper. plan §10.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  children: React.ReactNode;
}

export function Portal({ children }: PortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("portal-root");
    if (el) {
      setTarget(el);
    } else {
      console.warn("[Portal] #portal-root 요소가 없습니다. index.html 확인 필요.");
    }
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}

// DomainBadge — PR 1에서는 placeholder. UI 노출은 PR 5에서.
// invariant #9: domain === undefined일 때 null 렌더, 크래시 X.
import type { SessionDomain } from "../../services/sessionModel";

interface DomainBadgeProps {
  domain: SessionDomain | undefined;
}

const DOMAIN_LABEL: Record<SessionDomain, string> = {
  manufacturing: "제조",
  construction: "건설",
  heavy_industry: "중공업",
  semiconductor: "반도체",
};

export function DomainBadge({ domain }: DomainBadgeProps) {
  if (!domain) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pwc-bg-card border border-pwc-border text-pwc-ink-soft uppercase tracking-wider">
      {DOMAIN_LABEL[domain]}
    </span>
  );
}

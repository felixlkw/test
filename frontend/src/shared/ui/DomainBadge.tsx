// DomainBadge — domain label comes from active tenant (multi-PoC support).
// invariant #9: domain === undefined일 때 null 렌더, 크래시 X.
import type { SessionDomain } from "../../services/sessionModel";
import { domainLabel } from "../tenant/config";

interface DomainBadgeProps {
  domain: SessionDomain | undefined;
}

export function DomainBadge({ domain }: DomainBadgeProps) {
  if (!domain) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pwc-bg-card border border-pwc-border text-pwc-ink-soft uppercase tracking-wider">
      {domainLabel(domain)}
    </span>
  );
}

// TBMSession — VoiceShell의 TBM 진입점.
// PR 1에서는 단순 wrapper. 이후 PR에서 TBM-specific 옵션을 여기로.
import VoiceShell from "../../shared/layout/VoiceShell";
import type { SessionDomain } from "../../services/sessionModel";

interface TBMSessionProps {
  sessionId?: string;
  initialDomain?: SessionDomain;
}

export default function TBMSession({ sessionId, initialDomain }: TBMSessionProps) {
  return <VoiceShell sessionId={sessionId} initialMode="TBM" initialDomain={initialDomain} />;
}

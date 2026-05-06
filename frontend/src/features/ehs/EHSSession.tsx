// EHSSession — VoiceShell의 EHS 진입점.
// PR 1에서는 단순 wrapper.
import VoiceShell from "../../shared/layout/VoiceShell";

export default function EHSSession() {
  return <VoiceShell initialMode="EHS" />;
}

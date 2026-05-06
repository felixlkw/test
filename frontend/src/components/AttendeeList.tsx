// AttendeeList — PR D (Phase 2.0 MVP, c6 §3.VIII).
//
// 참석자 목록 + 서명 상태(✓ 서명됨 / ○ 미서명) + 서명 thumbnail.
// onSign 클릭 시 부모가 SignaturePad 모달 open. onRemove로 항목 제거.

import type { Attendee } from "../services/sessionModel";

interface AttendeeListProps {
  attendees: Attendee[];
  onRemove: (id: string) => void;
  onSign: (id: string) => void;
}

export function AttendeeList({ attendees, onRemove, onSign }: AttendeeListProps) {
  if (attendees.length === 0) {
    return (
      <div className="text-xs text-pwc-ink-mute italic px-3 py-3 border border-dashed border-pwc-border rounded-pwc">
        참석자를 추가하세요. 종료 시 일괄 입력 권장.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-pwc-border border border-pwc-border rounded-pwc bg-white">
      {attendees.map((a) => {
        const signed = !!a.signed;
        const hasCanvas = !!a.signature_data_url;
        return (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => onSign(a.id)}
              className={[
                "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition border",
                signed
                  ? "bg-pwc-orange text-white border-pwc-orange"
                  : "bg-white text-pwc-ink-soft border-pwc-border-strong hover:border-pwc-orange",
              ].join(" ")}
              aria-label={signed ? `${a.name} 서명 다시 받기` : `${a.name} 서명 받기`}
              title={signed ? "서명 다시 받기" : "서명 받기"}
            >
              {signed ? "✓" : "○"}
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-pwc-ink truncate">
                {a.name}
                {a.role && (
                  <span className="ml-2 text-[11px] text-pwc-ink-soft font-normal">
                    {a.role}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-pwc-ink-mute mt-0.5">
                {signed
                  ? hasCanvas
                    ? "서명 완료 (캔버스)"
                    : "본인 동의 확인"
                  : "미서명"}
                {signed && a.signed_at && (
                  <span className="ml-1.5">
                    · {new Date(a.signed_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
            {hasCanvas && (
              <img
                src={a.signature_data_url}
                alt={`${a.name} 서명`}
                className="shrink-0 h-9 w-auto max-w-[88px] border border-pwc-border bg-white rounded-pwc"
              />
            )}
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              className="shrink-0 px-2 py-1 text-[11px] uppercase tracking-wider text-pwc-ink-mute hover:text-pwc-orange-deep font-semibold transition"
              aria-label={`${a.name} 제거`}
            >
              제거
            </button>
          </li>
        );
      })}
    </ul>
  );
}

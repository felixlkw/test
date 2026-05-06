// AttendeeForm — PR D (Phase 2.0 MVP, c6 §3.VIII).
//
// 이름 + 역할 입력 → "추가" 버튼 → onAdd 콜백.
// crypto.randomUUID()로 id 생성, signed=false 시작.
// 자주 같이 일하는 동료 suggestion(localStorage `safemate.attendees.frequent`)는
// AttendeeList가 표시 — 이 form은 입력 자체에만 집중.

import { useState } from "react";
import type { Attendee } from "../services/sessionModel";

interface AttendeeFormProps {
  /** 추가 시 호출. parent가 setCurrentAttendees로 state 갱신. */
  onAdd: (attendee: Attendee) => void;
  /** 옵셔널 자동완성 — localStorage에서 frequent 목록을 읽어 suggestion으로 표시. */
  suggestions?: { name: string; role?: string }[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AttendeeForm({ onAdd, suggestions = [] }: AttendeeFormProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const trimmed = name.trim();
  const canAdd = trimmed.length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    const a: Attendee = {
      id: newId(),
      name: trimmed,
      role: role.trim() || undefined,
      signed: false,
    };
    onAdd(a);
    setName("");
    setRole("");
  };

  const handleSuggestionClick = (s: { name: string; role?: string }) => {
    setName(s.name);
    if (s.role) setRole(s.role);
  };

  return (
    <div className="border border-pwc-border rounded-pwc bg-white p-3 flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAdd) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="이름"
          aria-label="참석자 이름"
          className="flex-1 px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm focus:outline-none focus:border-pwc-orange"
        />
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAdd) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="역할 (선택)"
          aria-label="참석자 역할"
          className="flex-1 px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm focus:outline-none focus:border-pwc-orange"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="px-4 py-2 rounded-pwc bg-pwc-orange text-white text-sm font-semibold hover:bg-pwc-orange-deep disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          추가
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-pwc-ink-mute font-bold self-center">
            자주 함께
          </span>
          {suggestions.slice(0, 6).map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              onClick={() => handleSuggestionClick(s)}
              className="text-[11px] px-2 py-1 rounded-pwc border border-pwc-border bg-pwc-bg-card text-pwc-ink hover:border-pwc-orange hover:text-pwc-orange transition"
            >
              {s.name}
              {s.role ? ` · ${s.role}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

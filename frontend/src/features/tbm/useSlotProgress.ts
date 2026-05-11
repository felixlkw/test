// useSlotProgress — PR-feedback-3 (v0.2.3).
// 4 사전정보 슬롯(workLocation / workContentDetails / numberOfWorkers /
// equipmentDetails)의 충족도를 derive 한다. 영속 X (invariant #10).
//
// 단계 derive와는 분리 — 단계 점프해도 슬롯 채움은 단계 무관하게 계속.
// 매 턴 [Slot Status] system inject(VoiceShell)에서 본 결과를 사용.
import { useMemo } from "react";
import type { PriorInformation } from "./types";

export type SlotKey =
  | "workLocation"
  | "workContentDetails"
  | "numberOfWorkers"
  | "equipmentDetails";

export interface SlotState {
  /** 채워진 슬롯 키 */
  filled: SlotKey[];
  /** 비어있는 슬롯 키 */
  missing: SlotKey[];
  /** 항상 4 */
  total: number;
}

const ALL_SLOTS: SlotKey[] = [
  "workLocation",
  "workContentDetails",
  "numberOfWorkers",
  "equipmentDetails",
];

function isFilled(value: string | number | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return value.trim().length > 0;
}

export function useSlotProgress(priorInfo: PriorInformation): SlotState {
  return useMemo(() => {
    const filled: SlotKey[] = [];
    const missing: SlotKey[] = [];
    for (const key of ALL_SLOTS) {
      // numberOfWorkers는 number, 나머지는 string
      const v = priorInfo[key as keyof PriorInformation];
      if (isFilled(v as string | number | undefined)) {
        filled.push(key);
      } else {
        missing.push(key);
      }
    }
    return { filled, missing, total: ALL_SLOTS.length };
  }, [priorInfo]);
}

/**
 * [Slot Status] 메타 블록 합성 — backend prompt가 자연 슬롯 질문을 위해 활용.
 * 배열은 inject 사이즈 줄이기 위해 키만 포함.
 */
export function buildSlotStatusBlock(
  slotState: SlotState,
  priorInfo: PriorInformation,
): string {
  const lines: string[] = ["[Slot Status]"];
  lines.push(`location: ${priorInfo.workLocation ?? ""}`);
  lines.push(`content: ${priorInfo.workContentDetails ?? ""}`);
  lines.push(
    `workers: ${priorInfo.numberOfWorkers !== undefined ? String(priorInfo.numberOfWorkers) : ""}`,
  );
  lines.push(`equipment: ${priorInfo.equipmentDetails ?? ""}`);
  lines.push(`missing: ${slotState.missing.join(",")}`);
  return lines.join("\n");
}

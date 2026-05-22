// Phase 0.6 Wave 4 — Conversational TBM tool-call telemetry.
//
// Records every LLM tool invocation (name, ts, success) into localStorage so
// we can compute success-rate KPIs without a backend logging dependency.
// Persists across reloads; bounded to last 200 entries to keep storage tiny.
//
// Critic P0 acceptance #1: "LLM 도구 호출 실패율 측정 방법 없음" — this is it.
// Read via getToolCallStats() in Settings or an external dashboard.

const STORAGE_KEY = "safemate.telemetry.toolCalls.v1";
const MAX_ENTRIES = 200;

export type ToolCallStatus = "success" | "error";

export interface ToolCallEntry {
  ts: string;                  // ISO8601
  name: string;                // tool name (e.g. enter_tbm_mode)
  status: ToolCallStatus;
  durationMs?: number;
  errorMessage?: string;
}

function readAll(): ToolCallEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: ToolCallEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // localStorage quota / private mode — degrade silently.
  }
}

export function recordToolCall(entry: Omit<ToolCallEntry, "ts">): void {
  const all = readAll();
  all.push({ ts: new Date().toISOString(), ...entry });
  writeAll(all);
}

export interface ToolCallStats {
  total: number;
  byName: Record<string, { total: number; success: number; error: number; successRate: number }>;
  overallSuccessRate: number;
  recent: ToolCallEntry[]; // last 20
}

export function getToolCallStats(): ToolCallStats {
  const all = readAll();
  const byName: ToolCallStats["byName"] = {};
  let succ = 0;
  for (const e of all) {
    if (!byName[e.name]) byName[e.name] = { total: 0, success: 0, error: 0, successRate: 0 };
    byName[e.name].total += 1;
    if (e.status === "success") {
      byName[e.name].success += 1;
      succ += 1;
    } else {
      byName[e.name].error += 1;
    }
  }
  for (const stats of Object.values(byName)) {
    stats.successRate = stats.total > 0 ? stats.success / stats.total : 0;
  }
  return {
    total: all.length,
    byName,
    overallSuccessRate: all.length > 0 ? succ / all.length : 0,
    recent: all.slice(-20).reverse(),
  };
}

export function clearToolCallTelemetry(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

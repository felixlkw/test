// sttMetrics — PR B (c6 §3.III, 결정 13=A) STT 응답속도 측정 인프라.
//
// 흐름: input_audio_buffer.speech_stopped → recordSpeechStopped() →
//       response.audio_transcript.delta(첫 번째) → recordFirstToken() →
//       sliding window(20)에 push → p50/p95/mean/n 통계.
//
// 측정 인프라만 제공 — 실제 VAD 튜닝/지연 개선은 측정 후 별도 PR.
// dev 환경(`import.meta.env.DEV`)에선 console.debug로 실시간 출력.
// production은 메모리만 점유 — UI 노출 0(다음 PR에서 Settings KPI 패널 검토).
//
// invariant #10 view state 비영속: measurements는 메모리 only(window close 시 소실).
// IndexedDB 미사용. localStorage 미사용.

interface SttMeasurement {
  /** performance.now() at speech_stopped event */
  speechStoppedAt: number;
  /** performance.now() at first response token (text.delta or audio_transcript.delta) */
  firstTokenAt?: number;
  /** firstTokenAt - speechStoppedAt, milliseconds */
  durationMs?: number;
}

const WINDOW_SIZE = 20;
const measurements: SttMeasurement[] = [];
let pending: SttMeasurement | null = null;

/** Mark the moment user speech stopped (VAD detected end-of-utterance). */
export function recordSpeechStopped(): void {
  pending = { speechStoppedAt: performance.now() };
}

/** Mark the moment the assistant's first response token arrived.
 *  No-op if there is no pending speech_stopped (e.g. text-only message turn). */
export function recordFirstToken(): void {
  if (!pending) return;
  const firstTokenAt = performance.now();
  const durationMs = firstTokenAt - pending.speechStoppedAt;
  const m: SttMeasurement = {
    speechStoppedAt: pending.speechStoppedAt,
    firstTokenAt,
    durationMs,
  };
  measurements.push(m);
  if (measurements.length > WINDOW_SIZE) measurements.shift();
  pending = null;
  // dev 환경 콘솔 로깅. production 영향 0.
  if (import.meta.env.DEV) {
    const stats = computeStats();
    // eslint-disable-next-line no-console
    console.debug(
      `[STT KPI] last=${Math.round(durationMs)}ms p50=${stats.p50}ms p95=${stats.p95}ms mean=${stats.mean}ms n=${stats.n}`,
    );
  }
}

export interface SttKpiStats {
  p50: number;
  p95: number;
  mean: number;
  n: number;
}

/** Compute p50/p95/mean over the current sliding window. Returns zeros when empty. */
export function computeStats(): SttKpiStats {
  const valid = measurements.filter(
    (m): m is Required<SttMeasurement> => m.durationMs !== undefined,
  );
  const n = valid.length;
  if (n === 0) return { p50: 0, p95: 0, mean: 0, n: 0 };
  const durations = valid.map((m) => m.durationMs).sort((a, b) => a - b);
  const p50Idx = Math.floor(n * 0.5);
  const p95Idx = Math.floor(n * 0.95);
  const p50 = Math.round(durations[Math.min(p50Idx, n - 1)] ?? 0);
  const p95 = Math.round(durations[Math.min(p95Idx, n - 1)] ?? durations[n - 1]);
  const mean = Math.round(
    durations.reduce((s, x) => s + x, 0) / n,
  );
  return { p50, p95, mean, n };
}

/** Clear the sliding window. Used at session start/stop to avoid bleed-over. */
export function resetSttMetrics(): void {
  measurements.length = 0;
  pending = null;
}

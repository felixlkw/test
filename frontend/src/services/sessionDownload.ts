// sessionDownload — Phase 2.x PR-6.
//
// 클라이언트에서 Blob을 다운로드 트리거. iOS Safari 호환을 위해 createObjectURL
// + a 태그 + click + 지연 revoke 패턴.
//
// 주의:
//   - revoke를 즉시 하면 iOS Safari에서 다운로드 실패 사례 보고됨 → setTimeout 1000ms.
//   - WebView(앱 내장 브라우저) 일부는 a.download 무시 → 새 탭으로 열림. 이는
//     브라우저 한계, 본 모듈 책임 X.

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  // iOS Safari 일부 버전 — invisible body 부착이 안 되면 click 무시.
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    document.body.removeChild(a);
    // revoke 지연 — iOS Safari 다운로드 매니저가 url 해제 전에 fetch 완료 시간 확보.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // 일부 환경에서 revoke 실패 — 메모리 누수 위험 미미. 무시.
      }
    }, 1000);
  }
}

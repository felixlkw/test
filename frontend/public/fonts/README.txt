SafeMate — PDF 폰트 자산 (Phase 2.0 + PR-6b 다국어 확장)
============================================================

PDF 리포트(IX) 생성 시 사용자 언어에 따라 다른 정적 TrueType 폰트를 fetch.

사용 파일 (pdfGenerate.ts의 getPdfFontUrl 헬퍼가 언어별 선택):
  static/NotoSansKR-Regular.ttf      (~6.18 MB, ko/ja/zh — Korean full glyphs)
  static/NotoSansThai-Regular.ttf    (~21 KB,  th — Thai script glyphs only)
  static/NotoSans-Regular.ttf        (~431 KB, en/vi/id — Latin Extended-A/B
                                      + Vietnamese diacritic 커버)

폴더 구성:
  NotoSansKR-VariableFont_wght.ttf   (10 MB, 사용 안 함 — Variable Font는
                                      pdf-lib + fontkit 호환성 이슈로 글리프
                                      누락 발생, 2026-05-06 static로 전환)
  static/NotoSansKR-{Thin..Black}.ttf (9 weights, Regular만 PDF에 사용)
  static/NotoSansThai-Regular.ttf    (PR-6b 신규, Thai script-only)
  static/NotoSans-Regular.ttf        (PR-6b 신규, Latin Extended Additional)
  OFL.txt                            (SIL Open Font License — 3종 모두 동일)

폰트 동작:
  - 첫 PDF 생성 시 해당 언어 폰트 fetch 후 브라우저 캐시.
  - pdf-lib `embedFont(bytes, { subset: false })` 우선 시도 (글리프 손상 0).
    실패 시 `{ subset: true }`, 그래도 실패 시 Helvetica + sanitizeAscii fallback.
  - 출처:
    - NotoSansKR: https://fonts.google.com/noto/specimen/Noto+Sans+KR
    - NotoSansThai: https://github.com/notofonts/thai (v2.002 release)
    - NotoSans (Latin): https://github.com/notofonts/latin-greek-cyrillic (v2.015 release)

언어 ↔ 폰트 매핑 (pdfGenerate.ts:getPdfFontUrl):
  korean (default)         → NotoSansKR-Regular.ttf
  thai                     → NotoSansThai-Regular.ttf
  vietnamese / english /   → NotoSans-Regular.ttf
    indonesian             (Latin Extended-A/B + Vietnamese diacritic)

폴백:
  해당 언어 폰트가 없거나 fetch 실패 시 pdfGenerate.ts가 자동으로
  StandardFonts.Helvetica fallback. 비-라틴 글리프는 sanitizeAscii로 '?'/공란
  치환되며 표지에 [FONT WARNING] 노출. PDF 자체 생성은 성공.

  carry-over 케이스 (회귀 신호):
  - 카탈로그가 사용자 언어로 부분 채움된 상태 → ko 폴백 텍스트가 stored
    상태로 PDF에 도달 → 해당 언어 폰트(예: NotoSansThai)는 한글 글리프 미커버
    → '?' 치환. 사용자 언어를 ko로 바꿔 PDF를 다시 생성하면 정상 노출.

DEV 빌드 시 자산이 빠지면 콘솔 경고. Variable Font 잔재 파일은 두어도 무방
(사용 안 함). 향후 정리 PR에서 static/Regular 외 weight도 정리 가능.

라이선스 (3 폰트 모두):
  SIL Open Font License 1.1 — OFL.txt 참조.

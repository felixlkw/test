SafeMate — 한글 폰트 자산 (Phase 2.0 MVP)
=================================================

PDF 리포트(IX) 생성 시 한글 렌더링용 정적 TrueType 폰트.

사용 파일 (pdfGenerate.ts에서 fetch):
  static/NotoSansKR-Regular.ttf  (6.18 MB, 한국어 풀 글리프)

폴더 구성:
  NotoSansKR-VariableFont_wght.ttf   (10 MB, 사용 안 함 — Variable Font는
                                      pdf-lib + fontkit 호환성 이슈로 글리프
                                      누락 발생, 2026-05-06 static로 전환)
  static/NotoSansKR-{Thin..Black}.ttf (9 weights, Regular만 PDF에 사용)
  OFL.txt                            (라이선스)

폰트 동작:
  - 첫 PDF 생성 시 6.18 MB fetch 후 브라우저 캐시.
  - pdf-lib `embedFont(bytes, { subset: true })`로 사용 글리프만 PDF에 임베드.
    실제 결과 PDF 크기는 보통 30~150 KB.
  - 출처: https://fonts.google.com/noto/specimen/Noto+Sans+KR

폴백:
  static/NotoSansKR-Regular.ttf 가 없거나 fetch 실패 시 pdfGenerate.ts가 자동
  으로 StandardFonts.Helvetica fallback. 한글은 sanitizeAscii로 '?'/공란 치환
  되며 표지에 [FONT WARNING] 노출. PDF 자체 생성은 성공.

DEV 빌드 시 자산이 빠지면 콘솔 경고. Variable Font 잔재 파일은 두어도 무방
(사용 안 함). 향후 정리 PR에서 static/Regular 외 weight도 정리 가능.

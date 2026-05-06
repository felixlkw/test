// imageProcessing — PR C (Phase 2.0 MVP, c5 §7.4).
//
// canvas API + FileReader + Image만 사용 — 신규 라이브러리 0건.
// (face blur는 Phase 2 이관 — c5 결정 2.)
//
// 정책:
//   - resizeImage: 긴 변 max 1920px, JPEG quality 0.8 → 평균 100~300 KB.
//     5 MB 한도(c5 §9.3)에 안전 마진.
//   - stripExif: canvas 재인코딩이 EXIF를 자동 제거. 별도 lib 없음.
//     (resizeImage 내부에서 자동 적용 — 별도 함수 노출은 호출 옵션 분리용.)
//   - generateThumbnail: ~200x200 fit, JPEG q 0.7 → ~5~15 KB data URL.
//
// 회귀 가드:
//   - 입력이 image/* 아닐 때는 throw.
//   - canvas.toBlob 실패 시 reject (Safari 일부에서 타임아웃 0 시 발생).

const DEFAULT_MAX_DIM = 1920;
const DEFAULT_JPEG_QUALITY = 0.8;
const DEFAULT_THUMBNAIL_DIM = 200;
const DEFAULT_THUMBNAIL_QUALITY = 0.7;

/** 최대 차원/품질로 리사이즈 + JPEG 인코딩. EXIF 제거가 부수효과로 발생.
 *  반환 Blob은 항상 image/jpeg. */
export async function resizeImage(
  source: File | Blob,
  maxDim: number = DEFAULT_MAX_DIM,
  quality: number = DEFAULT_JPEG_QUALITY,
): Promise<Blob> {
  const img = await loadImage(source);
  const { canvas } = drawScaled(img, maxDim);
  return canvasToBlob(canvas, "image/jpeg", quality);
}

/** EXIF 제거 전용 — 차원 유지(원본 크기). resizeImage가 이미 자동 EXIF 제거를
 *  포함하므로 대부분의 경우 resizeImage가 충분. 개별 노출은 caller가 차원
 *  보존을 명시하고 싶을 때. */
export async function stripExif(source: File | Blob): Promise<Blob> {
  const img = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0);
  return canvasToBlob(canvas, "image/jpeg", DEFAULT_JPEG_QUALITY);
}

/** ~200x200 썸네일 data URL 생성. AttachmentPreview·HazardResultCard list view용. */
export async function generateThumbnail(
  source: File | Blob,
  dim: number = DEFAULT_THUMBNAIL_DIM,
  quality: number = DEFAULT_THUMBNAIL_QUALITY,
): Promise<string> {
  const img = await loadImage(source);
  const { canvas } = drawScaled(img, dim);
  return canvas.toDataURL("image/jpeg", quality);
}

// ── helpers ────────────────────────────────────────────────────────────────

function loadImage(source: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err instanceof Error ? err : new Error("이미지 로드 실패"));
    };
    img.src = url;
  });
}

function drawScaled(
  img: HTMLImageElement,
  maxDim: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  let w = w0;
  let h = h0;
  if (Math.max(w0, h0) > maxDim) {
    if (w0 >= h0) {
      w = maxDim;
      h = Math.round((h0 * maxDim) / w0);
    } else {
      h = maxDim;
      w = Math.round((w0 * maxDim) / h0);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob 실패 (브라우저 미지원)"));
      },
      mime,
      quality,
    );
  });
}

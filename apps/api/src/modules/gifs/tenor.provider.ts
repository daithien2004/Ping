import type { GifDto } from '@ping/shared';
import { GifProviderUnavailableError, type GifProvider } from './gif-provider.port.js';

const TENOR_BASE = 'https://tenor.googleapis.com/v2';
/**
 * `contentfilter=high` GHIM CỨNG phía server (ADR-0069 mục 3) — không bao giờ nhận từ client;
 * `media_filter=gif` chỉ xin biến thể GIF. Lấy biến thể `gif` (bản đủ lớn) làm URL gửi vào
 * tin — grid phía client tự co kích thước hiển thị.
 */
const CONTENT_FILTER = 'high';
const MEDIA_FILTER = 'gif';
const URL_VARIANT = 'gif';
const TIMEOUT_MS = 10_000;

interface TenorMedia {
  url?: string;
  /** Tenor trả `dims: [width, height]`. */
  dims?: number[];
}

interface TenorResult {
  id?: string;
  media_formats?: Record<string, TenorMedia>;
}

interface TenorResponse {
  results?: TenorResult[];
}

/**
 * Adapter Tenor API v2 (ADR-0069). Không có key thì mọi lời gọi ném
 * `GifProviderUnavailableError` ngay (không gọi mạng); lỗi mạng, HTTP lỗi hay JSON hỏng
 * đều quy về cùng lỗi — tầng service suy giảm thành 503, picker hiện empty state.
 */
export class TenorProvider implements GifProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = TIMEOUT_MS,
  ) {}

  async search(query: string, limit: number): Promise<GifDto[]> {
    const url =
      `${TENOR_BASE}/search?q=${encodeURIComponent(query)}&key=${this.apiKey ?? ''}` +
      `&limit=${limit}&contentfilter=${CONTENT_FILTER}&media_filter=${MEDIA_FILTER}`;
    return this.fetchResults(url);
  }

  async trending(limit: number): Promise<GifDto[]> {
    const url =
      `${TENOR_BASE}/featured?key=${this.apiKey ?? ''}` +
      `&limit=${limit}&contentfilter=${CONTENT_FILTER}&media_filter=${MEDIA_FILTER}`;
    return this.fetchResults(url);
  }

  private async fetchResults(url: string): Promise<GifDto[]> {
    if (!this.apiKey) {
      throw new GifProviderUnavailableError('Thiếu TENOR_API_KEY');
    }
    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      // Lỗi mạng/timeout: không đưa chi tiết lỗi vào message trả về client.
      throw new GifProviderUnavailableError('Tenor không phản hồi');
    }
    if (!response.ok) {
      // Không đưa body vào lỗi: body có thể chứa chi tiết khoá/đầu vào.
      throw new GifProviderUnavailableError(`Tenor trả về HTTP ${response.status}`);
    }
    let body: TenorResponse;
    try {
      body = (await response.json()) as TenorResponse;
    } catch {
      throw new GifProviderUnavailableError('Tenor trả về phản hồi không đọc được');
    }
    return (body.results ?? []).flatMap(toGifDto);
  }
}

/** Kết quả thiếu id/url/kích thước bị bỏ qua thay vì làm sập cả trang picker. */
function toGifDto(result: TenorResult): GifDto[] {
  const media = result.media_formats?.[URL_VARIANT];
  const width = media?.dims?.[0];
  const height = media?.dims?.[1];
  if (!result.id || !media?.url || width === undefined || height === undefined) return [];
  return [{ id: result.id, url: media.url, width, height, provider: 'tenor' }];
}

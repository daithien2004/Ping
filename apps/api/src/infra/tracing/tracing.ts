import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
  type Attributes,
  type Context,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { NextFunction, Request, Response } from 'express';

/**
 * Tracing phân tán (ADR-0100). Không đặt OTEL_EXPORTER_OTLP_ENDPOINT thì API OpenTelemetry là no-op: không span,
 * không header, không chi phí. Có thì mỗi tiến trình gửi span OTLP/HTTP tới Jaeger.
 * Ngữ cảnh đi theo W3C `traceparent`: HTTP → cột OutboxEvent.traceparent → header Kafka → consumer.
 */
export function initTracing(serviceName: string): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': serviceName }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
        { scheduledDelayMillis: 1_000 },
      ),
    ],
  });
  provider.register();
  const flush = () => void provider.shutdown().catch(() => undefined);
  process.once('SIGTERM', flush);
  process.once('beforeExit', flush);
}

const tracer = () => trace.getTracer('ping');

/** `traceparent` của span đang chạy; `undefined` khi không có tracing hoặc không trong span nào. */
export function currentTraceparent(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
}

export function contextFromTraceparent(traceparent: string | undefined | null): Context {
  return traceparent ? propagation.extract(ROOT_CONTEXT, { traceparent }) : context.active();
}

/** Chạy `fn` trong một span; ném lại lỗi sau khi ghi vào span. */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
  options: { parent?: Context; kind?: SpanKind } = {},
): Promise<T> {
  const parent = options.parent ?? context.active();
  const span = tracer().startSpan(
    name,
    { attributes, kind: options.kind ?? SpanKind.INTERNAL },
    parent,
  );
  try {
    return await context.with(trace.setSpan(parent, span), fn);
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    throw error;
  } finally {
    span.end();
  }
}

/** Span máy chủ cho mỗi request HTTP; tiếp nối trace nếu client gửi `traceparent`. */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const parent = propagation.extract(ROOT_CONTEXT, req.headers);
  const span = tracer().startSpan(
    req.method,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': req.method,
        'ping.request_id': (req as { id?: string }).id ?? '',
      },
    },
    parent,
  );
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    span.updateName(`${req.method} ${route}`);
    span.setAttribute('http.route', route);
    span.setAttribute('http.response.status_code', res.statusCode);
    if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  });
  context.with(trace.setSpan(parent, span), next);
}

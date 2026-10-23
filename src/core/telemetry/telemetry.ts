import * as Sentry from '@sentry/node';
import { config } from '../config';
import {
	ALLOWED_SPAN_ATTRIBUTES,
	SlothScribeSpanName,
	TelemetryInitOptions,
	TelemetrySpan,
} from './types';

let isInitialized = false;

export function initTelemetry(options?: TelemetryInitOptions): boolean {
	if (isTelemetryEnabled() && !options?.force && options?.dsn === undefined) {
		return true;
	}

	const dsn = options?.dsn !== undefined
		? options.dsn
		: (process.env.SENTRY_DSN || config.SENTRY_DSN || '');

	// Do not initialize if DSN is empty
	if (!dsn || dsn.trim().length === 0) {
		isInitialized = false;
		return false;
	}

	// Disable default integrations to prevent unintended auto-spans (e.g. fetch, http, child_process)
	// Only explicit sloth_scribe.* manual spans are captured.
	// dataCollection.genAI turns off generative AI input and output capture per official Sentry Node docs:
	// https://docs.sentry.io/platforms/javascript/guides/node/agent-tracing/
	Sentry.init({
		dsn,
		tracesSampleRate: 1.0,
		defaultIntegrations: false,
		dataCollection: {
			genAI: {
				inputs: false,
				outputs: false,
			},
		},
		beforeSendSpan: (span) => {
			if (!span.name || !span.name.startsWith('sloth_scribe.')) {
				return null as any;
			}
			if (options?.beforeSendSpan) {
				return options.beforeSendSpan(span) as any;
			}
			return span;
		},
		beforeSend: () => null,
		...(options?.transport ? { transport: options.transport as unknown as Sentry.NodeOptions['transport'] } : {}),
	});

	isInitialized = true;
	return true;
}

export function isTelemetryEnabled(): boolean {
	return isInitialized && Boolean(Sentry.getClient());
}

export async function flushTelemetry(timeoutMs = 2000): Promise<boolean> {
	if (!isTelemetryEnabled()) {
		return true;
	}
	return await Sentry.flush(timeoutMs);
}

export async function closeTelemetry(): Promise<void> {
	if (isTelemetryEnabled()) {
		await Sentry.close();
	}
	isInitialized = false;
}

function createTelemetrySpanWrapper(
	name: SlothScribeSpanName,
	sentrySpan?: Sentry.Span
): TelemetrySpan {
	return {
		name,
		setAttribute: (key: string, value: string | number | boolean) => {
			if (!sentrySpan) {
				return;
			}
			if (!ALLOWED_SPAN_ATTRIBUTES.has(key)) {
				return;
			}
			if (typeof value === 'string' && (value.includes('\n') || value.length > 80)) {
				return;
			}
			sentrySpan.setAttribute(key, value);
		},
		setStatus: (status: 'ok' | 'error') => {
			if (!sentrySpan) {
				return;
			}
			sentrySpan.setStatus(status === 'ok' ? { code: 1 } : { code: 2 });
		},
	};
}

export function withSpan<T>(
	name: SlothScribeSpanName,
	fn: (span: TelemetrySpan) => Promise<T>
): Promise<T>;
export function withSpan<T>(
	name: SlothScribeSpanName,
	fn: (span: TelemetrySpan) => T
): T;
export function withSpan<T>(
	name: SlothScribeSpanName,
	fn: (span: TelemetrySpan) => T | Promise<T>
): T | Promise<T> {
	if (!isTelemetryEnabled()) {
		const noopSpan = createTelemetrySpanWrapper(name);
		return fn(noopSpan);
	}

	return Sentry.startSpan({ name, op: name }, (sentrySpan) => {
		const wrapper = createTelemetrySpanWrapper(name, sentrySpan);
		try {
			const res = fn(wrapper);
			if (res instanceof Promise) {
				return res
					.then((val) => {
						wrapper.setStatus('ok');
						return val;
					})
					.catch((err) => {
						wrapper.setAttribute('error', true);
						wrapper.setStatus('error');
						throw err;
					});
			}
			wrapper.setStatus('ok');
			return res;
		} catch (err) {
			wrapper.setAttribute('error', true);
			wrapper.setStatus('error');
			throw err;
		}
	});
}

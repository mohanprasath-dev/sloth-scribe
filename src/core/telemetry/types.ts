export type SlothScribeSpanName =
	| 'sloth_scribe.scan'
	| 'sloth_scribe.ledger'
	| 'sloth_scribe.generate'
	| 'sloth_scribe.verify'
	| 'sloth_scribe.export';

export interface TelemetrySpan {
	readonly name: SlothScribeSpanName;
	setAttribute(key: string, value: string | number | boolean): void;
	setStatus(status: 'ok' | 'error'): void;
}

export interface TelemetryInitOptions {
	dsn?: string;
	transport?: (options: unknown) => {
		send: (envelope: unknown) => Promise<void>;
		flush: (timeout?: number) => Promise<boolean>;
	};
	beforeSendSpan?: (span: unknown) => unknown;
	force?: boolean;
}

export const ALLOWED_SPAN_ATTRIBUTES: ReadonlySet<string> = new Set([
	'model',
	'duration_ms',
	'error',
	'file_count',
	'commit_count',
	'fact_count',
	'claim_count',
	'char_count',
	'verified_count',
	'interpretation_count',
	'needs_input_count',
	'fallback_used',
	'prompt_eval_count',
	'eval_count',
]);

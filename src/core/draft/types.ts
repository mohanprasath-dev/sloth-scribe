import { z } from 'zod';
import { Fact } from '../ledger/types';
import {
	Claim,
	claimSchema,
	claimTypeSchema,
	VerifiedClaim,
} from '../verifier/types';

export const draftParagraphSchema = z.object({
	claims: z.array(claimSchema),
});

export type DraftParagraph = z.infer<typeof draftParagraphSchema>;

export const draftSchema = z.object({
	paragraphs: z.array(draftParagraphSchema),
});

export type Draft = z.infer<typeof draftSchema>;

export const DRAFT_JSON_SCHEMA = {
	type: 'object',
	properties: {
		paragraphs: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					claims: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								claim_id: { type: 'string' },
								text: { type: 'string' },
								type: {
									type: 'string',
									enum: [
										'count',
										'date',
										'feature',
										'dependency',
										'metric',
										'interpretation',
									],
								},
								fact_ids: {
									type: 'array',
									items: { type: 'string' },
								},
							},
							required: ['claim_id', 'text', 'type', 'fact_ids'],
						},
					},
				},
				required: ['claims'],
			},
		},
	},
	required: ['paragraphs'],
} as const;

export function extractClaimsFromDraft(draft: Draft): Claim[] {
	return draft.paragraphs.flatMap((paragraph) => paragraph.claims);
}

export type DraftErrorCode =
	| 'OLLAMA_TIMEOUT'
	| 'OLLAMA_HTTP_ERROR'
	| 'INVALID_JSON_RESPONSE'
	| 'MODEL_FALLBACK_FAILED'
	| 'DRAFT_GENERATION_FAILED';

export class DraftError extends Error {
	readonly code: DraftErrorCode;
	readonly model: string;
	readonly details?: unknown;

	constructor(
		code: DraftErrorCode,
		message: string,
		model: string,
		details?: unknown
	) {
		super(message);
		this.name = 'DraftError';
		this.code = code;
		this.model = model;
		this.details = details;
		Object.setPrototypeOf(this, DraftError.prototype);
	}
}

export interface OllamaMetrics {
	prompt_eval_count: number | null;
	eval_count: number | null;
	total_duration: number | null;
}

export interface StageTimings {
	scan: number;
	ledger: number;
	generate: number;
	verify: number;
	total: number;
}

export interface ClaimCounts {
	verified: number;
	interpretation: number;
	needs_input: number;
	total: number;
}

export interface RunRecord {
	timestamp: string;
	model: string;
	fallback_used: boolean;
	fallback_reason: string | null;
	timings: StageTimings;
	ollama: OllamaMetrics;
	claim_counts: ClaimCounts;
}

export interface GenerateDraftResult {
	draft: Draft;
	modelUsed: string;
	fallbackUsed: boolean;
	fallbackReason: string | null;
	ollamaMetrics: OllamaMetrics;
}

export interface PipelineResult {
	draft: Draft;
	claims: Claim[];
	verifiedClaims: VerifiedClaim[];
	ledger: Fact[];
	runRecord: RunRecord;
	recordPath: string;
}

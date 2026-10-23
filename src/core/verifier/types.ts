import { z } from 'zod';

export const claimTypeSchema = z.enum([
	'count',
	'date',
	'feature',
	'dependency',
	'metric',
	'interpretation',
]);

export type ClaimType = z.infer<typeof claimTypeSchema>;

export const claimSchema = z.object({
	claim_id: z.string().min(1),
	text: z.string().min(1),
	type: claimTypeSchema,
	fact_ids: z.array(z.string()),
});

export type Claim = z.infer<typeof claimSchema>;

export const verifiedStatusSchema = z.enum([
	'verified',
	'interpretation',
	'needs_input',
]);

export type VerifiedStatus = z.infer<typeof verifiedStatusSchema>;

export const evidenceItemSchema = z.object({
	fact_id: z.string(),
	location: z.string(),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const verifiedClaimSchema = z.object({
	claim_id: z.string(),
	text: z.string(),
	type: claimTypeSchema,
	fact_ids: z.array(z.string()),
	status: verifiedStatusSchema,
	reason: z.string(),
	evidence: z.array(evidenceItemSchema),
});

export type VerifiedClaim = z.infer<typeof verifiedClaimSchema>;

export interface RuleResult {
	pass: boolean;
	status?: VerifiedStatus;
	reason?: string;
	evidence?: EvidenceItem[];
}

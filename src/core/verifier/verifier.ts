import { Fact } from '../ledger/types';
import {
	isMetricClaim,
	ruleInterpretation,
	ruleR1NumericAndDateEquality,
	ruleR2CountSupport,
	ruleR3NamedFeatureOrPackage,
	ruleR4MetricRefusal,
	ruleR5NoCitationNoClaim,
} from './rules';
import { isCountClaim } from './rules/r2-count-support';
import {
	Claim,
	claimSchema,
	EvidenceItem,
	VerifiedClaim,
} from './types';

export function verifyClaim(rawClaim: unknown, ledger: Fact[]): VerifiedClaim {
	const parseResult = claimSchema.safeParse(rawClaim);
	if (!parseResult.success) {
		const rawObj =
			typeof rawClaim === 'object' && rawClaim !== null
				? (rawClaim as Record<string, unknown>)
				: {};
		const claimId = typeof rawObj.claim_id === 'string' ? rawObj.claim_id : 'unknown';
		const text = typeof rawObj.text === 'string' ? rawObj.text : '';

		return {
			claim_id: claimId,
			text,
			type: 'feature',
			fact_ids: [],
			status: 'needs_input',
			reason: `invalid claim schema: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
			evidence: [],
		};
	}

	const claim = parseResult.data;

	// Rule R5: No citation, no claim
	const r5Result = ruleR5NoCitationNoClaim(claim, ledger);
	if (!r5Result.pass) {
		return {
			claim_id: claim.claim_id,
			text: claim.text,
			type: claim.type,
			fact_ids: claim.fact_ids,
			status: r5Result.status ?? 'needs_input',
			reason: r5Result.reason ?? 'no citation: fact_ids is empty',
			evidence: [],
		};
	}

	// INTERPRETATION rule
	if (claim.type === 'interpretation') {
		const interpResult = ruleInterpretation(claim, ledger);
		return {
			claim_id: claim.claim_id,
			text: claim.text,
			type: claim.type,
			fact_ids: claim.fact_ids,
			status: interpResult.status ?? 'interpretation',
			reason:
				interpResult.reason ??
				'interpretation with no numerals, dates, paths, or identifiers',
			evidence: interpResult.evidence ?? [],
		};
	}

	// Rule R4: Metric refusal
	if (isMetricClaim(claim)) {
		const r4Result = ruleR4MetricRefusal(claim, ledger);
		if (!r4Result.pass) {
			return {
				claim_id: claim.claim_id,
				text: claim.text,
				type: claim.type,
				fact_ids: claim.fact_ids,
				status: r4Result.status ?? 'needs_input',
				reason: r4Result.reason ?? 'metric needs measured evidence',
				evidence: [],
			};
		}
		if (r4Result.status === 'verified') {
			return {
				claim_id: claim.claim_id,
				text: claim.text,
				type: claim.type,
				fact_ids: claim.fact_ids,
				status: 'verified',
				reason: r4Result.reason ?? 'metric verified by measurement',
				evidence: r4Result.evidence ?? [],
			};
		}
	}

	// Rule R2: Count support
	if (isCountClaim(claim)) {
		const r2Result = ruleR2CountSupport(claim, ledger);
		if (!r2Result.pass) {
			return {
				claim_id: claim.claim_id,
				text: claim.text,
				type: claim.type,
				fact_ids: claim.fact_ids,
				status: r2Result.status ?? 'needs_input',
				reason: r2Result.reason ?? 'count unverified',
				evidence: [],
			};
		}
		if (r2Result.status === 'verified') {
			return {
				claim_id: claim.claim_id,
				text: claim.text,
				type: claim.type,
				fact_ids: claim.fact_ids,
				status: 'verified',
				reason: r2Result.reason ?? 'verified count',
				evidence: r2Result.evidence ?? [],
			};
		}
	}

	// Rule R1: Numeric and date equality
	const r1Result = ruleR1NumericAndDateEquality(claim, ledger);
	if (!r1Result.pass) {
		return {
			claim_id: claim.claim_id,
			text: claim.text,
			type: claim.type,
			fact_ids: claim.fact_ids,
			status: r1Result.status ?? 'needs_input',
			reason: r1Result.reason ?? 'numeric or date mismatch',
			evidence: [],
		};
	}
	if (claim.type === 'date' && r1Result.status === 'verified') {
		return {
			claim_id: claim.claim_id,
			text: claim.text,
			type: claim.type,
			fact_ids: claim.fact_ids,
			status: 'verified',
			reason: r1Result.reason ?? 'verified date',
			evidence: r1Result.evidence ?? [],
		};
	}

	// Rule R3: Named feature or package
	if (claim.type === 'dependency' || claim.type === 'feature') {
		const r3Result = ruleR3NamedFeatureOrPackage(claim, ledger);
		if (!r3Result.pass) {
			return {
				claim_id: claim.claim_id,
				text: claim.text,
				type: claim.type,
				fact_ids: claim.fact_ids,
				status: r3Result.status ?? 'needs_input',
				reason: r3Result.reason ?? 'feature or dependency unproven',
				evidence: [],
			};
		}
		if (r3Result.status === 'verified') {
			return {
				claim_id: claim.claim_id,
				text: claim.text,
				type: claim.type,
				fact_ids: claim.fact_ids,
				status: 'verified',
				reason: r3Result.reason ?? 'verified feature or dependency',
				evidence: r3Result.evidence ?? [],
			};
		}
	}

	// Default fallback: collect cited evidence
	const evidence: EvidenceItem[] = [];
	for (const id of claim.fact_ids) {
		const fact = ledger.find((f) => f.id === id);
		if (fact) {
			evidence.push({
				fact_id: fact.id,
				location: fact.evidence_location,
			});
		}
	}

	return {
		claim_id: claim.claim_id,
		text: claim.text,
		type: claim.type,
		fact_ids: claim.fact_ids,
		status: 'verified',
		reason: 'verified against ledger facts',
		evidence,
	};
}

export function verifyClaims(claims: Claim[], ledger: Fact[]): VerifiedClaim[] {
	return claims.map((c) => verifyClaim(c, ledger));
}

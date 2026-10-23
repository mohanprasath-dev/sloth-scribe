import { Fact } from '../../ledger/types';
import { Claim, RuleResult } from '../types';

export function ruleR5NoCitationNoClaim(claim: Claim, ledger: Fact[]): RuleResult {
	if (claim.type === 'interpretation') {
		return { pass: true };
	}

	if (claim.fact_ids.length === 0) {
		return {
			pass: false,
			status: 'needs_input',
			reason: 'no citation: fact_ids is empty',
			evidence: [],
		};
	}

	const unknownIds = claim.fact_ids.filter(
		(id) => !ledger.some((f) => f.id === id)
	);

	if (unknownIds.length > 0) {
		return {
			pass: false,
			status: 'needs_input',
			reason: `unknown fact_id: ${unknownIds.join(', ')}`,
			evidence: [],
		};
	}

	return { pass: true };
}

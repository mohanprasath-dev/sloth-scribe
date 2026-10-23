import { Fact } from '../../ledger/types';
import { Claim, EvidenceItem, RuleResult } from '../types';

const NUMERAL_REGEX = /\d+/;
const DATE_REGEX = /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/;
const PATH_REGEX = /(?:^|[\s(])(?:[\w.-]+\/)+[\w.-]+|\b[\w.-]+\.(?:js|ts|json|md)\b/;
const IDENTIFIER_REGEX = /`[^`]+`/;

export function ruleInterpretation(claim: Claim, ledger: Fact[]): RuleResult {
	if (claim.type !== 'interpretation') {
		return { pass: true };
	}

	const hasNumeral = NUMERAL_REGEX.test(claim.text);
	const hasDate = DATE_REGEX.test(claim.text);
	const hasPath = PATH_REGEX.test(claim.text);
	const hasIdentifier = IDENTIFIER_REGEX.test(claim.text);

	if (hasNumeral || hasDate || hasPath || hasIdentifier) {
		return {
			pass: false,
			status: 'needs_input',
			reason: 'interpretation downgraded: contains numeral, date, path, or identifier',
			evidence: [],
		};
	}

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
		pass: true,
		status: 'interpretation',
		reason: 'interpretation with no numerals, dates, paths, or identifiers',
		evidence,
	};
}

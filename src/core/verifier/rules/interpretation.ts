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

	// 1. Check for dates first so date numerals are not treated as plain numbers
	const dateMatch = claim.text.match(DATE_REGEX);
	if (dateMatch) {
		return {
			pass: false,
			status: 'needs_input',
			reason: `contains date ${dateMatch[0]}`,
			evidence: [],
		};
	}

	// 2. Check for paths
	const pathMatch = claim.text.match(PATH_REGEX);
	if (pathMatch) {
		const rawToken = (pathMatch[1] ?? pathMatch[0]).trim();
		const token = rawToken.replace(/[.,;:!?]+$/, '');
		return {
			pass: false,
			status: 'needs_input',
			reason: `contains path ${token}`,
			evidence: [],
		};
	}

	// 3. Check for backticked identifiers
	const idMatch = claim.text.match(IDENTIFIER_REGEX);
	if (idMatch) {
		return {
			pass: false,
			status: 'needs_input',
			reason: `contains identifier ${idMatch[0]}`,
			evidence: [],
		};
	}

	// 4. Check for numerals
	const numMatch = claim.text.match(/\b\d+(?:\.\d+)?\b/);
	if (numMatch) {
		return {
			pass: false,
			status: 'needs_input',
			reason: `contains numeral ${numMatch[0]}`,
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

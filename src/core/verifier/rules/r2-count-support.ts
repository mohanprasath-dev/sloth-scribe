import { DiffstatValue, Fact, FileValue } from '../../ledger/types';
import { Claim, EvidenceItem, RuleResult } from '../types';

const COMMIT_COUNT_REGEX = /\b(?:contains|total of|has)?\s*(\d+)\s+commits?\b/i;
const CHANGED_FILES_REGEX = /\b(\d+)\s+files?\s+changed\b/i;
const LINE_COUNT_REGEX = /\b(\d+)\s+lines?(?:\s+of\s+code)?\b/i;

export function isCountClaim(claim: Claim): boolean {
	if (claim.type === 'count') {
		return true;
	}
	return (
		COMMIT_COUNT_REGEX.test(claim.text) ||
		CHANGED_FILES_REGEX.test(claim.text) ||
		LINE_COUNT_REGEX.test(claim.text)
	);
}

export function ruleR2CountSupport(claim: Claim, ledger: Fact[]): RuleResult {
	if (!isCountClaim(claim)) {
		return { pass: true };
	}

	const citedFacts = ledger.filter((f) => claim.fact_ids.includes(f.id));

	// Any count claim supported only by README is rejected
	const onlyReadme =
		citedFacts.length > 0 && citedFacts.every((f) => f.type === 'readme_line');
	if (onlyReadme) {
		return {
			pass: false,
			status: 'needs_input',
			reason: 'counts must equal ledger values computed from git, not README text',
			evidence: [],
		};
	}

	// 1. Commit counts
	const commitMatch = claim.text.match(COMMIT_COUNT_REGEX);
	if (commitMatch || claim.type === 'count') {
		const claimedNum = commitMatch
			? parseInt(commitMatch[1], 10)
			: parseInt(claim.text.match(/\b\d+\b/)?.[0] ?? '0', 10);

		// Find commit_total fact in cited facts or in ledger
		const commitTotalFact =
			citedFacts.find((f) => f.type === 'commit_total') ??
			ledger.find((f) => f.type === 'commit_total');

		if (commitTotalFact) {
			const actualCount = Number(commitTotalFact.value);
			if (claimedNum !== actualCount) {
				return {
					pass: false,
					status: 'needs_input',
					reason: `contradicted by ${commitTotalFact.id} (value ${actualCount})`,
					evidence: [],
				};
			}

			// If it cites commit_total fact, verify
			if (claim.fact_ids.includes(commitTotalFact.id)) {
				return {
					pass: true,
					status: 'verified',
					reason: `verified commit count of ${actualCount}`,
					evidence: [
						{
							fact_id: commitTotalFact.id,
							location: commitTotalFact.evidence_location,
						},
					],
				};
			}
		}
	}

	// 2. Changed-file counts
	const changedMatch = claim.text.match(CHANGED_FILES_REGEX);
	if (changedMatch) {
		const claimedFiles = parseInt(changedMatch[1], 10);
		const diffstatFact = citedFacts.find((f) => f.type === 'diffstat');
		if (diffstatFact) {
			const stat = diffstatFact.value as DiffstatValue;
			if (claimedFiles !== stat.files_changed) {
				return {
					pass: false,
					status: 'needs_input',
					reason: `contradicted by ${diffstatFact.id} (value ${stat.files_changed})`,
					evidence: [],
				};
			}
			return {
				pass: true,
				status: 'verified',
				reason: `verified changed files count of ${stat.files_changed}`,
				evidence: [
					{
						fact_id: diffstatFact.id,
						location: diffstatFact.evidence_location,
					},
				],
			};
		}
	}

	// 3. Line counts
	const lineMatch = claim.text.match(LINE_COUNT_REGEX);
	if (lineMatch) {
		const claimedLines = parseInt(lineMatch[1], 10);
		const fileFact = citedFacts.find((f) => f.type === 'file');
		if (fileFact) {
			const fileVal = fileFact.value as FileValue;
			if (claimedLines !== fileVal.line_count) {
				return {
					pass: false,
					status: 'needs_input',
					reason: `contradicted by ${fileFact.id} (value ${fileVal.line_count})`,
					evidence: [],
				};
			}
			return {
				pass: true,
				status: 'verified',
				reason: `verified line count of ${fileVal.line_count}`,
				evidence: [
					{
						fact_id: fileFact.id,
						location: fileFact.evidence_location,
					},
				],
			};
		}
	}

	return { pass: true };
}

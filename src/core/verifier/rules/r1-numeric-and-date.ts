import {
	CommitValue,
	DependencyValue,
	DiffstatValue,
	Fact,
	FileValue,
	ReadmeLineValue,
} from '../../ledger/types';
import { Claim, EvidenceItem, RuleResult } from '../types';

export function normalizeDate(raw: string): string {
	const parts = raw.split(/[-/.]/);
	if (parts.length === 3) {
		const year = parts[0].padStart(4, '0');
		const month = parts[1].padStart(2, '0');
		const day = parts[2].padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
	return raw;
}

export function extractDates(text: string): string[] {
	const matches = text.match(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g);
	if (!matches) {
		return [];
	}
	return matches.map(normalizeDate);
}

export function normalizeVersion(raw: string): string {
	return raw.trim().replace(/^[\^~]/, '').replace(/^v/i, '');
}

export function extractVersions(text: string): string[] {
	const matches = text.match(
		/(?:version\s+)?`?([~^vV]?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)`?(?=$|[\s`"')\].,;])/gi
	);
	if (!matches) {
		return [];
	}
	const results: string[] = [];
	for (const m of matches) {
		const cleaned = m.replace(/^version\s+/i, '').replace(/`/g, '').trim();
		if (
			cleaned &&
			!cleaned.endsWith('ms') &&
			!cleaned.endsWith('s') &&
			!cleaned.endsWith('%') &&
			!cleaned.endsWith('x')
		) {
			results.push(cleaned);
		}
	}
	return results;
}

function extractNumerals(
	text: string,
	dates: string[],
	versions: string[]
): number[] {
	let cleanText = text;
	for (const d of dates) {
		cleanText = cleanText.split(d).join(' ');
	}
	for (const v of versions) {
		cleanText = cleanText.split(v).join(' ');
	}
	const matches = cleanText.match(/\b\d+(?:\.\d+)?\b/g);
	if (!matches) {
		return [];
	}
	return matches.map((m) => Number(m));
}

function getFactDate(fact: Fact): string | null {
	if (fact.type === 'first_commit_date' || fact.type === 'last_commit_date') {
		return typeof fact.value === 'string' ? normalizeDate(fact.value) : null;
	}
	if (fact.type === 'commit') {
		const commit = fact.value as CommitValue;
		return commit.date ? normalizeDate(commit.date) : null;
	}
	return null;
}

function factContainsNumber(fact: Fact, target: number): boolean {
	if (fact.type === 'commit_total') {
		return Number(fact.value) === target;
	}
	if (fact.type === 'file') {
		const f = fact.value as FileValue;
		return f.line_count === target;
	}
	if (fact.type === 'diffstat') {
		const d = fact.value as DiffstatValue;
		return (
			d.files_changed === target ||
			d.insertions === target ||
			d.deletions === target
		);
	}
	if (fact.type === 'readme_line') {
		const r = fact.value as ReadmeLineValue;
		return r.line === target;
	}
	if (fact.type === 'measurement' && typeof fact.value === 'object' && fact.value !== null) {
		const json = JSON.stringify(fact.value);
		return json.includes(String(target));
	}
	return false;
}

export function ruleR1NumericAndDateEquality(
	claim: Claim,
	ledger: Fact[]
): RuleResult {
	const dates = extractDates(claim.text);
	let cleanForVersions = claim.text;
	for (const d of dates) {
		cleanForVersions = cleanForVersions.split(d).join(' ');
	}
	const versions = extractVersions(cleanForVersions);
	const numerals = extractNumerals(claim.text, dates, versions);

	const citedFacts = ledger.filter((f) => claim.fact_ids.includes(f.id));

	// 1. Check dependency versions if any
	const citedDepFacts = citedFacts.filter((f) => f.type === 'dependency');
	if (versions.length > 0 && citedDepFacts.length > 0) {
		for (const ver of versions) {
			const normVer = normalizeVersion(ver);
			const matchingDep = citedDepFacts.find(
				(df) =>
					normalizeVersion((df.value as DependencyValue).version) === normVer
			);
			if (!matchingDep) {
				const conflictingFact = citedDepFacts[0];
				const factVer = (conflictingFact.value as DependencyValue).version;
				return {
					pass: false,
					status: 'needs_input',
					reason: `version ${ver} differs from ${factVer}`,
					evidence: [],
				};
			}
		}
	}

	// If no dates and no numerals, R1 passes
	if (dates.length === 0 && numerals.length === 0) {
		return { pass: true };
	}

	// 2. Check dates
	for (const d of dates) {
		const matchingFact = citedFacts.find((f) => getFactDate(f) === d);
		if (!matchingFact) {
			// Find a cited fact that has a date to give "contradicted by Fxxx (value N)"
			const conflictingFact = citedFacts.find((f) => getFactDate(f) !== null);
			if (conflictingFact) {
				const conflictingVal = getFactDate(conflictingFact);
				return {
					pass: false,
					status: 'needs_input',
					reason: `contradicted by ${conflictingFact.id} (value ${conflictingVal})`,
					evidence: [],
				};
			}
			return {
				pass: false,
				status: 'needs_input',
				reason: 'date not in cited facts',
				evidence: [],
			};
		}
	}

	// 2. Check numerals
	for (const num of numerals) {
		const hasNum = citedFacts.some((f) => factContainsNumber(f, num));
		if (!hasNum) {
			// Find a numeric fact that contradicts
			const conflictingCount = citedFacts.find(
				(f) => f.type === 'commit_total' && Number(f.value) !== num
			);
			if (conflictingCount) {
				return {
					pass: false,
					status: 'needs_input',
					reason: `contradicted by ${conflictingCount.id} (value ${conflictingCount.value})`,
					evidence: [],
				};
			}

			const conflictingFile = citedFacts.find(
				(f) => f.type === 'file' && (f.value as FileValue).line_count !== num
			);
			if (conflictingFile) {
				return {
					pass: false,
					status: 'needs_input',
					reason: `contradicted by ${conflictingFile.id} (value ${(conflictingFile.value as FileValue).line_count})`,
					evidence: [],
				};
			}

			const conflictingDiffstat = citedFacts.find(
				(f) =>
					f.type === 'diffstat' &&
					(f.value as DiffstatValue).files_changed !== num
			);
			if (conflictingDiffstat) {
				return {
					pass: false,
					status: 'needs_input',
					reason: `contradicted by ${conflictingDiffstat.id} (value ${(conflictingDiffstat.value as DiffstatValue).files_changed})`,
					evidence: [],
				};
			}

			return {
				pass: false,
				status: 'needs_input',
				reason: 'number not in cited facts',
				evidence: [],
			};
		}
	}

	// If claim.type === 'date' and all dates matched, return verified status with evidence
	if (claim.type === 'date') {
		const evidence: EvidenceItem[] = citedFacts
			.filter((f) => getFactDate(f) !== null)
			.map((f) => ({
				fact_id: f.id,
				location: f.evidence_location,
			}));
		return {
			pass: true,
			status: 'verified',
			reason: `verified commit dates ${dates.join(' to ')}`,
			evidence,
		};
	}

	return { pass: true };
}

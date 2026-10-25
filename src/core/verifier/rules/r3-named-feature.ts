import {
	CommitValue,
	DependencyValue,
	Fact,
	FileValue,
	ScriptValue,
} from '../../ledger/types';
import { Claim, EvidenceItem, RuleResult } from '../types';

function extractBackticked(text: string): string[] {
	const matches = text.match(/`([^`]+)`/g);
	if (!matches) {
		return [];
	}
	return matches.map((m) => m.slice(1, -1));
}

function extractQuotedStrings(text: string): string[] {
	const results: string[] = [];
	const regex = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;
	let match;
	while ((match = regex.exec(text)) !== null) {
		const val = match[1] ?? match[2] ?? match[3];
		if (val && !results.includes(val)) {
			results.push(val);
		}
	}
	return results;
}

function extractPackageName(claim: Claim, ledger?: Fact[]): string | null {
	if (claim.subject && claim.subject.trim().length > 0) {
		return claim.subject.trim();
	}
	const backticked = extractBackticked(claim.text);
	if (backticked.length > 0) {
		return backticked[0];
	}
	const match = claim.text.match(
		/(?:uses|depends on|relies on|dependency)\s+([a-zA-Z0-9@/._-]+)/i
	);
	if (match) {
		return match[1];
	}
	const match2 = claim.text.match(
		/(?:includes|including|with)\s+([a-zA-Z0-9@/._-]+)\s+(?:as\s+a\s+dependency|dependency)/i
	);
	if (match2) {
		return match2[1];
	}
	if (ledger) {
		const deps = ledger.filter((f) => f.type === 'dependency');
		for (const d of deps) {
			const depName = (d.value as DependencyValue).name;
			const regex = new RegExp(`\\b${depName}\\b`, 'i');
			if (regex.test(claim.text)) {
				return depName;
			}
		}
	}
	return null;
}

const STOPWORDS = new Set([
	'a',
	'an',
	'the',
	'for',
	'in',
	'of',
	'to',
	'with',
	'and',
	'or',
	'on',
	'at',
	'by',
	'is',
	'it',
	'as',
	'from',
	'into',
]);

function extractSubjectWords(claim: Claim): string[] {
	if (claim.subject && claim.subject.trim().length > 0) {
		return claim.subject
			.toLowerCase()
			.split(/[\s_-]+/)
			.filter((w) => w.length > 0 && !STOPWORDS.has(w));
	}

	const backticked = extractBackticked(claim.text);
	if (backticked.length > 0) {
		return backticked[0]
			.toLowerCase()
			.split(/[\s_/.-]+/)
			.filter((w) => w.length > 0 && !STOPWORDS.has(w));
	}

	if (/csv\s+export/i.test(claim.text)) {
		return ['csv', 'export'];
	}
	if (/dark\s+mode/i.test(claim.text)) {
		return ['dark', 'mode'];
	}

	return claim.text
		.toLowerCase()
		.replace(/[^a-z0-9\s_-]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function searchLedgerForSubject(
	ledger: Fact[],
	subjectWords: string[]
): Fact[] {
	if (subjectWords.length === 0) {
		return [];
	}

	const matchingFacts: Fact[] = [];

	// 1. Commit subjects
	const commits = ledger.filter((f) => f.type === 'commit');
	for (const f of commits) {
		const sub = (f.value as CommitValue).subject.toLowerCase();
		if (subjectWords.every((w) => sub.includes(w))) {
			matchingFacts.push(f);
		}
	}

	// 2. File paths
	const files = ledger.filter((f) => f.type === 'file');
	for (const f of files) {
		const path = (f.value as FileValue).path.toLowerCase();
		if (subjectWords.every((w) => path.includes(w))) {
			matchingFacts.push(f);
		} else if (
			matchingFacts.length > 0 &&
			subjectWords.length > 1 &&
			subjectWords.some((w) => w.length >= 4 && path.includes(w))
		) {
			matchingFacts.push(f);
		}
	}

	// 3. Dependency names
	const deps = ledger.filter((f) => f.type === 'dependency');
	for (const f of deps) {
		const name = (f.value as DependencyValue).name.toLowerCase();
		if (subjectWords.every((w) => name.includes(w))) {
			matchingFacts.push(f);
		}
	}

	// 4. Script names
	const scripts = ledger.filter((f) => f.type === 'script');
	for (const f of scripts) {
		const name = (f.value as ScriptValue).name.toLowerCase();
		if (subjectWords.every((w) => name.includes(w))) {
			matchingFacts.push(f);
		}
	}

	return matchingFacts;
}

export function ruleR3NamedFeatureOrPackage(
	claim: Claim,
	ledger: Fact[]
): RuleResult {
	if (
		claim.type !== 'dependency' &&
		claim.type !== 'feature' &&
		claim.type !== 'script'
	) {
		const backticked = extractBackticked(claim.text);
		if (backticked.length === 0) {
			return { pass: true };
		}
	}

	const citedFacts = ledger.filter((f) => claim.fact_ids.includes(f.id));

	// 1. Dependency claims
	if (claim.type === 'dependency') {
		const pkgName = extractPackageName(claim, ledger);
		if (!pkgName) {
			return {
				pass: false,
				status: 'needs_input',
				reason: 'dependency name could not be identified',
				evidence: [],
			};
		}

		const depFact = ledger.find(
			(f) =>
				f.type === 'dependency' &&
				(f.value as DependencyValue).name === pkgName
		);

		if (!depFact) {
			return {
				pass: false,
				status: 'needs_input',
				reason: `dependency '${pkgName}' not found in package.json`,
				evidence: [],
			};
		}

		if (!claim.fact_ids.includes(depFact.id)) {
			return {
				pass: false,
				status: 'needs_input',
				reason: `dependency '${pkgName}' cited fact mismatch`,
				evidence: [],
			};
		}

		return {
			pass: true,
			status: 'verified',
			reason: `verified dependency '${pkgName}' in package.json`,
			evidence: [
				{
					fact_id: depFact.id,
					location: depFact.evidence_location,
				},
			],
		};
	}

	// 2. Script claims
	if (claim.type === 'script') {
		const quotes = extractQuotedStrings(claim.text);

		// Find cited script fact or look in ledger
		const citedScript = citedFacts.find((f) => f.type === 'script');
		const scriptFact =
			citedScript ??
			ledger.find((f) => {
				if (f.type !== 'script') {
					return false;
				}
				const sVal = f.value as ScriptValue;
				return (
					(claim.subject && sVal.name === claim.subject) ||
					quotes.includes(sVal.name) ||
					quotes.includes(sVal.command)
				);
			});

		if (!scriptFact) {
			return {
				pass: false,
				status: 'needs_input',
				reason: 'script not found in package.json',
				evidence: [],
			};
		}

		const scriptVal = scriptFact.value as ScriptValue;
		// Verify the quoted command equals the script fact value exactly
		const hasExactCommand = quotes.includes(scriptVal.command);

		if (hasExactCommand) {
			return {
				pass: true,
				status: 'verified',
				reason: `verified script '${scriptVal.name}' command '${scriptVal.command}'`,
				evidence: [
					{
						fact_id: scriptFact.id,
						location: scriptFact.evidence_location,
					},
				],
			};
		}

		// On mismatch: find the quoted command that differed
		const quotedCmd =
			quotes.find((q) => q !== scriptVal.name) ?? quotes[0];
		if (quotedCmd) {
			return {
				pass: false,
				status: 'needs_input',
				reason: `script '${scriptVal.name}' command '${quotedCmd}' differs from '${scriptVal.command}'`,
				evidence: [],
			};
		}

		return {
			pass: false,
			status: 'needs_input',
			reason: `script '${scriptVal.name}' quoted command could not be identified`,
			evidence: [],
		};
	}

	// 3. Feature claims
	if (claim.type === 'feature') {
		const commits = ledger.filter((f) => f.type === 'commit');
		const files = ledger.filter((f) => f.type === 'file');
		const deps = ledger.filter((f) => f.type === 'dependency');
		const scripts = ledger.filter((f) => f.type === 'script');

		// Check if any backticked token is unproven in the entire repo
		const backticked = extractBackticked(claim.text);
		for (const token of backticked) {
			const inFiles = files.some(
				(f) => (f.value as FileValue).path === token
			);
			const inCommits = commits.some((f) =>
				(f.value as CommitValue).subject
					.toLowerCase()
					.includes(token.toLowerCase())
			);
			const inDeps = deps.some(
				(f) => (f.value as DependencyValue).name === token
			);
			const inScripts = scripts.some(
				(f) => (f.value as ScriptValue).name === token
			);

			if (!inFiles && !inCommits && !inDeps && !inScripts) {
				return {
					pass: false,
					status: 'needs_input',
					reason: `unproven identifier '${token}' not found in repo`,
					evidence: [],
				};
			}
		}

		// Dark mode check: README text alone does not prove dark mode
		if (
			/dark\s+mode/i.test(claim.text) ||
			(claim.subject && /dark\s+mode/i.test(claim.subject))
		) {
			const inCommits = commits.some((f) =>
				/dark\s+mode/i.test((f.value as CommitValue).subject)
			);
			const inFiles = files.some((f) =>
				/dark\s*mode/i.test((f.value as FileValue).path)
			);

			if (!inCommits && !inFiles) {
				return {
					pass: false,
					status: 'needs_input',
					reason:
						"feature 'dark mode' unproven: README text alone does not prove a feature",
					evidence: [],
				};
			}
		}

		// Search whole ledger for subject words deterministically
		const subjectWords = extractSubjectWords(claim);
		const foundFacts = searchLedgerForSubject(ledger, subjectWords);

		// If found in commit subjects, file paths, dependency names, or script names
		if (foundFacts.length > 0) {
			const evidence: EvidenceItem[] = [];
			const seenIds = new Set<string>();

			// Add cited facts that are valid evidence (commit or file)
			for (const f of citedFacts) {
				if (f.type === 'commit' || f.type === 'file') {
					if (!seenIds.has(f.id)) {
						seenIds.add(f.id);
						evidence.push({
							fact_id: f.id,
							location: f.evidence_location,
						});
					}
				}
			}

			// Add found facts
			for (const f of foundFacts) {
				if (!seenIds.has(f.id)) {
					seenIds.add(f.id);
					evidence.push({
						fact_id: f.id,
						location: f.evidence_location,
					});
				}
			}

			const commitEv = evidence.find((e) => e.location.startsWith('commit:'));
			const fileEv = evidence.find((e) => e.location.startsWith('file:'));

			const reasonParts: string[] = [];
			if (commitEv) {
				const cFact = ledger.find((f) => f.id === commitEv.fact_id);
				if (cFact && cFact.type === 'commit') {
					reasonParts.push(`commit ${(cFact.value as CommitValue).hash}`);
				}
			}
			if (fileEv) {
				const fFact = ledger.find((f) => f.id === fileEv.fact_id);
				if (fFact && fFact.type === 'file') {
					reasonParts.push(`file ${(fFact.value as FileValue).path}`);
				}
			}

			const reasonSuffix =
				reasonParts.length > 0 ? ` by ${reasonParts.join(' and ')}` : '';

			return {
				pass: true,
				status: 'verified',
				reason: `feature verified${reasonSuffix}`,
				evidence,
			};
		}

		// If only readme was cited or feature unproven
		const onlyReadme =
			citedFacts.length > 0 &&
			citedFacts.every((f) => f.type === 'readme_line');
		if (onlyReadme) {
			return {
				pass: false,
				status: 'needs_input',
				reason: 'unproven feature: README text alone does not prove a feature',
				evidence: [],
			};
		}

		return {
			pass: false,
			status: 'needs_input',
			reason: 'feature unproven: no supporting commit or file evidence cited',
			evidence: [],
		};
	}

	return { pass: true };
}

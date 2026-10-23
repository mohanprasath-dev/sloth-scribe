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

function extractPackageName(claim: Claim): string | null {
	const backticked = extractBackticked(claim.text);
	if (backticked.length > 0) {
		return backticked[0];
	}
	const match = claim.text.match(
		/(?:uses|depends on|relies on|dependency)\s+([a-zA-Z0-9@/._-]+)/i
	);
	return match ? match[1] : null;
}

export function ruleR3NamedFeatureOrPackage(
	claim: Claim,
	ledger: Fact[]
): RuleResult {
	if (claim.type !== 'dependency' && claim.type !== 'feature') {
		const backticked = extractBackticked(claim.text);
		if (backticked.length === 0) {
			return { pass: true };
		}
	}

	const citedFacts = ledger.filter((f) => claim.fact_ids.includes(f.id));

	// 1. Dependency claims
	if (claim.type === 'dependency') {
		const pkgName = extractPackageName(claim);
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

	// 2. Feature claims
	if (claim.type === 'feature') {
		// README text alone does not prove a feature
		const onlyReadme =
			citedFacts.length > 0 &&
			citedFacts.every((f) => f.type === 'readme_line');

		const commits = ledger.filter((f) => f.type === 'commit');
		const files = ledger.filter((f) => f.type === 'file');
		const deps = ledger.filter((f) => f.type === 'dependency');
		const scripts = ledger.filter((f) => f.type === 'script');

		// Check for specific known phrases or backticked identifiers
		const backticked = extractBackticked(claim.text);

		// Check if any backticked token is unproven in the entire repo
		for (const token of backticked) {
			const inFiles = files.some((f) => (f.value as FileValue).path === token);
			const inCommits = commits.some((f) =>
				(f.value as CommitValue).subject.toLowerCase().includes(token.toLowerCase())
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
		if (/dark\s+mode/i.test(claim.text)) {
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

		if (onlyReadme) {
			return {
				pass: false,
				status: 'needs_input',
				reason: 'unproven feature: README text alone does not prove a feature',
				evidence: [],
			};
		}

		// Check CSV export or general feature support
		const supportingEvidence: EvidenceItem[] = [];

		for (const fact of citedFacts) {
			if (fact.type === 'commit') {
				const subject = (fact.value as CommitValue).subject.toLowerCase();
				if (
					(/csv\s+export/i.test(claim.text) && subject.includes('csv export')) ||
					backticked.some((t) => subject.includes(t.toLowerCase()))
				) {
					supportingEvidence.push({
						fact_id: fact.id,
						location: fact.evidence_location,
					});
				}
			} else if (fact.type === 'file') {
				const filePath = (fact.value as FileValue).path;
				if (
					(/csv\s+export/i.test(claim.text) && filePath.includes('export')) ||
					backticked.includes(filePath)
				) {
					supportingEvidence.push({
						fact_id: fact.id,
						location: fact.evidence_location,
					});
				}
			}
		}

		if (supportingEvidence.length > 0) {
			const commitFact = citedFacts.find((f) => f.type === 'commit');
			const fileFact = citedFacts.find((f) => f.type === 'file');
			const reasonParts: string[] = [];
			if (commitFact) {
				reasonParts.push(`commit ${(commitFact.value as CommitValue).hash}`);
			}
			if (fileFact) {
				reasonParts.push(`file ${(fileFact.value as FileValue).path}`);
			}
			const reasonSuffix =
				reasonParts.length > 0 ? ` by ${reasonParts.join(' and ')}` : '';

			return {
				pass: true,
				status: 'verified',
				reason: `feature verified${reasonSuffix}`,
				evidence: supportingEvidence,
			};
		}

		// If no supporting evidence from commits or files
		return {
			pass: false,
			status: 'needs_input',
			reason: 'feature unproven: no supporting commit or file evidence cited',
			evidence: [],
		};
	}

	return { pass: true };
}

import { Fact } from '../../ledger/types';
import { Claim, EvidenceItem, RuleResult } from '../types';

const PERCENTAGE_REGEX = /%|\b\d+\s*percent\b/i;
const FASTER_REGEX = /\b\d+(?:\.\d+)?x\s+faster\b/i;
const LATENCY_REGEX = /\b(?:latency|\d+\s*ms|\d+\s*milliseconds)\b/i;
const BUILD_TIME_REGEX = /\b(?:build[\s-]time|run[\s-]time)\b/i;

export function isMetricClaim(claim: Claim): boolean {
	if (claim.type === 'metric') {
		return true;
	}
	return (
		PERCENTAGE_REGEX.test(claim.text) ||
		FASTER_REGEX.test(claim.text) ||
		LATENCY_REGEX.test(claim.text) ||
		BUILD_TIME_REGEX.test(claim.text)
	);
}

export function ruleR4MetricRefusal(claim: Claim, ledger: Fact[]): RuleResult {
	if (!isMetricClaim(claim)) {
		return { pass: true };
	}

	const citedFacts = ledger.filter((f) => claim.fact_ids.includes(f.id));
	const measurementFacts = citedFacts.filter((f) => f.type === 'measurement');

	if (measurementFacts.length === 0) {
		return {
			pass: false,
			status: 'needs_input',
			reason: 'metric needs measured evidence',
			evidence: [],
		};
	}

	const evidence: EvidenceItem[] = measurementFacts.map((f) => ({
		fact_id: f.id,
		location: f.evidence_location,
	}));

	return {
		pass: true,
		status: 'verified',
		reason: 'metric verified by benchmark measurement',
		evidence,
	};
}

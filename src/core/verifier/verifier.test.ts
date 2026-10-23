import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildLedger } from '../ledger/ledger';
import { scanRepo } from '../ledger/scan';
import { Fact } from '../ledger/types';
import { Claim, VerifiedClaim } from './types';
import { verifyClaim, verifyClaims } from './verifier';

describe('Verifier Pipeline', () => {
	let demoLedger: Fact[];
	let handwrittenClaims: Claim[];
	let expectedVerdicts: Record<string, string>;

	beforeAll(() => {
		const repoPath = path.resolve('fixtures/demo-repo');
		const scan = scanRepo(repoPath);
		demoLedger = buildLedger(scan);

		const handwrittenPath = path.resolve('fixtures/drafts/handwritten.json');
		const handwrittenRaw = fs.readFileSync(handwrittenPath, 'utf8');
		handwrittenClaims = JSON.parse(handwrittenRaw) as Claim[];

		const expectedPath = path.resolve(
			'fixtures/drafts/handwritten.expected.json'
		);
		const expectedRaw = fs.readFileSync(expectedPath, 'utf8');
		expectedVerdicts = JSON.parse(expectedRaw) as Record<string, string>;
	});

	it('verifies all handwritten claims matching expected verdicts exactly', () => {
		const verifiedList = verifyClaims(handwrittenClaims, demoLedger);

		expect(verifiedList).toHaveLength(handwrittenClaims.length);

		for (const verified of verifiedList) {
			const expectedStatus = expectedVerdicts[verified.claim_id];
			expect(
				verified.status,
				`Claim ${verified.claim_id} status mismatch: expected ${expectedStatus}, got ${verified.status}`
			).toBe(expectedStatus);
		}
	});

	it('produces identical output on two consecutive runs (determinism)', () => {
		const run1 = verifyClaims(handwrittenClaims, demoLedger);
		const run2 = verifyClaims(handwrittenClaims, demoLedger);

		expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
	});

	it('blocks seeded 60% build-time metric as NEEDS_INPUT with measured evidence reason', () => {
		const metricClaim = handwrittenClaims.find((c) => c.claim_id === 'c08')!;
		const verified = verifyClaim(metricClaim, demoLedger);

		expect(verified.status).toBe('needs_input');
		expect(verified.reason).toBe('metric needs measured evidence');
		expect(verified.evidence).toHaveLength(0);
	});

	it('blocks seeded dark mode feature as NEEDS_INPUT without code evidence', () => {
		const darkModeClaim = handwrittenClaims.find((c) => c.claim_id === 'c07')!;
		const verified = verifyClaim(darkModeClaim, demoLedger);

		expect(verified.status).toBe('needs_input');
		expect(verified.reason).toContain('README text alone does not prove a feature');
		expect(verified.evidence).toHaveLength(0);
	});

	it('verifies CSV export with commit hash and file evidence', () => {
		const csvClaim = handwrittenClaims.find((c) => c.claim_id === 'c06')!;
		const verified = verifyClaim(csvClaim, demoLedger);

		expect(verified.status).toBe('verified');
		expect(verified.evidence.some((e) => e.location.startsWith('commit:'))).toBe(
			true
		);
		expect(verified.evidence.some((e) => e.location.includes('export.js'))).toBe(
			true
		);
	});

	it('verifies correct commit count 14 with git:log evidence', () => {
		const countClaim = handwrittenClaims.find((c) => c.claim_id === 'c01')!;
		const verified = verifyClaim(countClaim, demoLedger);

		expect(verified.status).toBe('verified');
		expect(verified.evidence[0].location).toBe('git:log');
	});

	it('contradicts wrong commit count 13 with F002 value 14', () => {
		const countClaim = handwrittenClaims.find((c) => c.claim_id === 'c02')!;
		const verified = verifyClaim(countClaim, demoLedger);

		expect(verified.status).toBe('needs_input');
		expect(verified.reason).toBe('contradicted by F002 (value 14)');
	});
});

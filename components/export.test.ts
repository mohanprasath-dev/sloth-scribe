import { describe, expect, it } from 'vitest';
import { Draft } from '../src/core/draft/types';
import { VerifiedClaim } from '../src/core/verifier/types';
import { exportDraftToMarkdown } from './export';

describe('Export Markdown Function', () => {
	it('exports verified and interpretation sentences as text, and needs_input as [NEEDS INPUT: reason]', () => {
		const draft: Draft = {
			paragraphs: [
				{
					claims: [
						{
							claim_id: 'c1',
							text: 'There were 14 commits made.',
							type: 'count',
							fact_ids: ['F002'],
						},
						{
							claim_id: 'c2',
							text: 'The architecture displays clean modular design.',
							type: 'interpretation',
							fact_ids: [],
						},
						{
							claim_id: 'c3',
							text: 'Cuts build time by 60% compared to the old pipeline.',
							type: 'metric',
							fact_ids: ['F048'],
						},
					],
				},
			],
		};

		const verifiedClaims: VerifiedClaim[] = [
			{
				claim_id: 'c1',
				text: 'There were 14 commits made.',
				type: 'count',
				fact_ids: ['F002'],
				status: 'verified',
				reason: 'verified commit count of 14',
				evidence: [{ fact_id: 'F002', location: 'git:log' }],
			},
			{
				claim_id: 'c2',
				text: 'The architecture displays clean modular design.',
				type: 'interpretation',
				fact_ids: [],
				status: 'interpretation',
				reason: 'valid qualitative observation without numbers or paths',
				evidence: [],
			},
			{
				claim_id: 'c3',
				text: 'Cuts build time by 60% compared to the old pipeline.',
				type: 'metric',
				fact_ids: ['F048'],
				status: 'needs_input',
				reason: 'metric needs measured evidence',
				evidence: [],
			},
		];

		const markdown = exportDraftToMarkdown(draft, verifiedClaims);

		// Verified text preserved
		expect(markdown).toContain('There were 14 commits made.');

		// Interpretation text preserved
		expect(markdown).toContain(
			'The architecture displays clean modular design.'
		);

		// Needs input replaced by placeholder
		expect(markdown).toContain('[NEEDS INPUT: metric needs measured evidence]');

		// CRITICAL: The original text of the needs_input claim MUST NEVER appear
		expect(markdown).not.toContain(
			'Cuts build time by 60% compared to the old pipeline.'
		);
		expect(markdown).not.toContain('60%');
	});

	it('preserves multiple paragraphs separated by blank lines', () => {
		const draft: Draft = {
			paragraphs: [
				{
					claims: [
						{
							claim_id: 'c1',
							text: 'First paragraph first claim.',
							type: 'count',
							fact_ids: ['F002'],
						},
					],
				},
				{
					claims: [
						{
							claim_id: 'c2',
							text: 'Second paragraph phantom feature.',
							type: 'feature',
							fact_ids: ['F052'],
						},
					],
				},
			],
		};

		const verifiedClaims: VerifiedClaim[] = [
			{
				claim_id: 'c1',
				text: 'First paragraph first claim.',
				type: 'count',
				fact_ids: ['F002'],
				status: 'verified',
				reason: 'verified',
				evidence: [],
			},
			{
				claim_id: 'c2',
				text: 'Second paragraph phantom feature.',
				type: 'feature',
				fact_ids: ['F052'],
				status: 'needs_input',
				reason: 'feature dark mode unproven',
				evidence: [],
			},
		];

		const markdown = exportDraftToMarkdown(draft, verifiedClaims);

		expect(markdown).toBe(
			'First paragraph first claim.\n\n[NEEDS INPUT: feature dark mode unproven]'
		);
		expect(markdown).not.toContain('Second paragraph phantom feature');
	});
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerifiedClaim } from '../src/core/verifier/types';
import { SentenceChip } from './sentence-chip';

describe('SentenceChip Component', () => {
	it('renders VERIFIED status label and text for verified claims', () => {
		const claim: VerifiedClaim = {
			claim_id: 'c1',
			text: 'There were 14 commits made.',
			type: 'count',
			fact_ids: ['F002'],
			status: 'verified',
			reason: 'verified commit count of 14',
			evidence: [{ fact_id: 'F002', location: 'git:log' }],
		};

		const html = renderToStaticMarkup(
			<SentenceChip claim={claim} isSelected={false} onSelect={() => {}} />
		);

		expect(html).toContain('VERIFIED');
		expect(html).toContain('There were 14 commits made.');
		expect(html).toContain('border-solid');
		expect(html).toContain('role="button"');
		expect(html).toContain('tabindex="0"');
		expect(html).toContain('data-status="verified"');
	});

	it('renders INTERPRETATION status label and distinct style for interpretation claims', () => {
		const claim: VerifiedClaim = {
			claim_id: 'c2',
			text: 'The code reflects deliberate design choices.',
			type: 'interpretation',
			fact_ids: [],
			status: 'interpretation',
			reason: 'qualitative statement without numbers',
			evidence: [],
		};

		const html = renderToStaticMarkup(
			<SentenceChip claim={claim} isSelected={false} onSelect={() => {}} />
		);

		expect(html).toContain('INTERPRETATION');
		expect(html).toContain('The code reflects deliberate design choices.');
		expect(html).toContain('border-dotted');
		expect(html).toContain('data-status="interpretation"');
	});

	it('renders NEEDS INPUT status label and distinct dashed style for unverified claims', () => {
		const claim: VerifiedClaim = {
			claim_id: 'c3',
			text: 'Cuts build time by 60% compared to the old pipeline.',
			type: 'metric',
			fact_ids: ['F048'],
			status: 'needs_input',
			reason: 'metric needs measured evidence',
			evidence: [],
		};

		const html = renderToStaticMarkup(
			<SentenceChip claim={claim} isSelected={true} onSelect={() => {}} />
		);

		expect(html).toContain('NEEDS INPUT');
		expect(html).toContain(
			'Cuts build time by 60% compared to the old pipeline.'
		);
		expect(html).toContain('border-dashed');
		expect(html).toContain('data-status="needs_input"');
		expect(html).toContain('aria-pressed="true"');
	});
});

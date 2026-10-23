import { describe, expect, it } from 'vitest';
import { Fact } from '../ledger/types';
import {
	ruleInterpretation,
	ruleR1NumericAndDateEquality,
	ruleR2CountSupport,
	ruleR3NamedFeatureOrPackage,
	ruleR4MetricRefusal,
	ruleR5NoCitationNoClaim,
} from './rules';
import { Claim } from './types';

const sampleLedger: Fact[] = [
	{
		id: 'F001',
		type: 'repo_name',
		value: 'tinytasks',
		source: 'package.json',
		evidence_location: 'file:package.json:2-2',
	},
	{
		id: 'F002',
		type: 'commit_total',
		value: 14,
		source: 'git log',
		evidence_location: 'git:log',
	},
	{
		id: 'F003',
		type: 'first_commit_date',
		value: '2026-03-02',
		source: 'git log',
		evidence_location: 'commit:ee29103',
	},
	{
		id: 'F004',
		type: 'last_commit_date',
		value: '2026-03-13',
		source: 'git log',
		evidence_location: 'commit:6bf5ff8',
	},
	{
		id: 'F013',
		type: 'commit',
		value: {
			hash: 'cc4f592',
			subject: 'implement CSV export for task lists',
			date: '2026-03-10',
		},
		source: 'git log',
		evidence_location: 'commit:cc4f592',
	},
	{
		id: 'F036',
		type: 'file',
		value: {
			path: 'src/export.js',
			line_count: 5,
		},
		source: 'git ls-files',
		evidence_location: 'file:src/export.js:1-5',
	},
	{
		id: 'F041',
		type: 'dependency',
		value: {
			name: 'commander',
			version: '^12.0.0',
			location: 'dependencies',
		},
		source: 'package.json',
		evidence_location: 'file:package.json:10-10',
	},
	{
		id: 'F048',
		type: 'readme_line',
		value: {
			text: 'Cuts build time by 60% compared to the old pipeline.',
			line: 8,
		},
		source: 'README.md',
		evidence_location: 'readme:8',
	},
	{
		id: 'F052',
		type: 'readme_line',
		value: {
			text: '- Built-in dark mode support',
			line: 14,
		},
		source: 'README.md',
		evidence_location: 'readme:14',
	},
	{
		id: 'F060',
		type: 'measurement',
		value: {
			build_time_ms: 120,
			reduction_percent: 60,
		},
		source: 'bench/results.json',
		evidence_location: 'file:bench/results.json:1-1',
	},
];

describe('Verifier Rules', () => {
	describe('R1: Numeric and Date Equality', () => {
		it('passes when numerals and dates match cited facts', () => {
			const claim: Claim = {
				claim_id: 'c1',
				text: 'Development ran from 2026-03-02 to 2026-03-13.',
				type: 'date',
				fact_ids: ['F003', 'F004'],
			};
			const res = ruleR1NumericAndDateEquality(claim, sampleLedger);
			expect(res.pass).toBe(true);
			expect(res.status).toBe('verified');
		});

		it('fails when date is contradicted by cited fact', () => {
			const claim: Claim = {
				claim_id: 'c2',
				text: 'Initial commit occurred on 2026-03-01.',
				type: 'date',
				fact_ids: ['F003'],
			};
			const res = ruleR1NumericAndDateEquality(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe('contradicted by F003 (value 2026-03-02)');
		});

		it('fails when numeral is contradicted by cited fact', () => {
			const claim: Claim = {
				claim_id: 'c3',
				text: 'Contains 13 commits in total.',
				type: 'count',
				fact_ids: ['F002'],
			};
			const res = ruleR1NumericAndDateEquality(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe('contradicted by F002 (value 14)');
		});

		it('fails when numeral is not found in cited facts', () => {
			const claim: Claim = {
				claim_id: 'c4',
				text: 'Project has 99 modules.',
				type: 'count',
				fact_ids: ['F001'],
			};
			const res = ruleR1NumericAndDateEquality(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe('number not in cited facts');
		});
	});

	describe('R2: Count Support', () => {
		it('passes when commit count matches git ledger value', () => {
			const claim: Claim = {
				claim_id: 'c5',
				text: 'The repository contains a total of 14 commits.',
				type: 'count',
				fact_ids: ['F002'],
			};
			const res = ruleR2CountSupport(claim, sampleLedger);
			expect(res.pass).toBe(true);
			expect(res.status).toBe('verified');
			expect(res.evidence?.[0].location).toBe('git:log');
		});

		it('fails when count is contradicted', () => {
			const claim: Claim = {
				claim_id: 'c6',
				text: 'The repository contains a total of 13 commits.',
				type: 'count',
				fact_ids: ['F002'],
			};
			const res = ruleR2CountSupport(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe('contradicted by F002 (value 14)');
		});

		it('fails when count relies only on README text', () => {
			const claim: Claim = {
				claim_id: 'c7',
				text: 'Contains 14 commits.',
				type: 'count',
				fact_ids: ['F048'],
			};
			const res = ruleR2CountSupport(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toContain('computed from git, not README text');
		});
	});

	describe('R3: Named Feature or Package', () => {
		it('passes when dependency exists in package.json', () => {
			const claim: Claim = {
				claim_id: 'c8',
				text: 'The project uses `commander` for CLI arguments.',
				type: 'dependency',
				fact_ids: ['F041'],
			};
			const res = ruleR3NamedFeatureOrPackage(claim, sampleLedger);
			expect(res.pass).toBe(true);
			expect(res.status).toBe('verified');
			expect(res.evidence?.[0].fact_id).toBe('F041');
		});

		it('fails when dependency does not exist', () => {
			const claim: Claim = {
				claim_id: 'c9',
				text: 'The project uses `express` as server.',
				type: 'dependency',
				fact_ids: ['F041'],
			};
			const res = ruleR3NamedFeatureOrPackage(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toContain("dependency 'express' not found");
		});

		it('passes for CSV export with commit and file evidence', () => {
			const claim: Claim = {
				claim_id: 'c10',
				text: 'Implemented CSV export for task lists in `src/export.js`.',
				type: 'feature',
				fact_ids: ['F013', 'F036'],
			};
			const res = ruleR3NamedFeatureOrPackage(claim, sampleLedger);
			expect(res.pass).toBe(true);
			expect(res.status).toBe('verified');
			expect(res.evidence).toHaveLength(2);
		});

		it('fails for dark mode when only mentioned in README', () => {
			const claim: Claim = {
				claim_id: 'c11',
				text: 'The application features built-in dark mode support.',
				type: 'feature',
				fact_ids: ['F052'],
			};
			const res = ruleR3NamedFeatureOrPackage(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toContain('README text alone does not prove a feature');
		});
	});

	describe('R4: Metric Refusal', () => {
		it('passes when measurement fact exists from results file', () => {
			const claim: Claim = {
				claim_id: 'c12',
				text: 'Build time reduced by 60% in benchmark tests.',
				type: 'metric',
				fact_ids: ['F060'],
			};
			const res = ruleR4MetricRefusal(claim, sampleLedger);
			expect(res.pass).toBe(true);
			expect(res.status).toBe('verified');
		});

		it('fails when metric has no measured evidence', () => {
			const claim: Claim = {
				claim_id: 'c13',
				text: 'Cuts build time by 60% compared to the old pipeline.',
				type: 'metric',
				fact_ids: ['F048'],
			};
			const res = ruleR4MetricRefusal(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe('metric needs measured evidence');
		});
	});

	describe('R5: No Citation, No Claim', () => {
		it('passes when non-interpretation claim has valid citations', () => {
			const claim: Claim = {
				claim_id: 'c14',
				text: 'Project named tinytasks.',
				type: 'feature',
				fact_ids: ['F001'],
			};
			const res = ruleR5NoCitationNoClaim(claim, sampleLedger);
			expect(res.pass).toBe(true);
		});

		it('fails when fact_ids is empty', () => {
			const claim: Claim = {
				claim_id: 'c15',
				text: 'Task storage supports atomic operations.',
				type: 'feature',
				fact_ids: [],
			};
			const res = ruleR5NoCitationNoClaim(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe('no citation: fact_ids is empty');
		});

		it('fails when fact_ids contains unknown fact', () => {
			const claim: Claim = {
				claim_id: 'c16',
				text: 'Task storage supports atomic operations.',
				type: 'feature',
				fact_ids: ['F999'],
			};
			const res = ruleR5NoCitationNoClaim(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe('unknown fact_id: F999');
		});
	});

	describe('INTERPRETATION Rule', () => {
		it('passes when text contains no numerals, dates, paths, or identifiers', () => {
			const claim: Claim = {
				claim_id: 'c17',
				text: 'The codebase demonstrates clean modular separation and strong test hygiene.',
				type: 'interpretation',
				fact_ids: [],
			};
			const res = ruleInterpretation(claim, sampleLedger);
			expect(res.pass).toBe(true);
			expect(res.status).toBe('interpretation');
		});

		it('fails when interpretation text contains a numeral', () => {
			const claim: Claim = {
				claim_id: 'c18',
				text: 'The team completed 14 sprints successfully.',
				type: 'interpretation',
				fact_ids: [],
			};
			const res = ruleInterpretation(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
			expect(res.reason).toBe(
				'interpretation downgraded: contains numeral, date, path, or identifier'
			);
		});

		it('fails when interpretation text contains a date', () => {
			const claim: Claim = {
				claim_id: 'c19',
				text: 'The project reached its turning point on 2026-03-05.',
				type: 'interpretation',
				fact_ids: [],
			};
			const res = ruleInterpretation(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
		});

		it('fails when interpretation text contains a path', () => {
			const claim: Claim = {
				claim_id: 'c20',
				text: 'The architecture isolates logic nicely within src/store.js.',
				type: 'interpretation',
				fact_ids: [],
			};
			const res = ruleInterpretation(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
		});

		it('fails when interpretation text contains a backticked identifier', () => {
			const claim: Claim = {
				claim_id: 'c21',
				text: 'The codebase relies heavily on `zod` for robustness.',
				type: 'interpretation',
				fact_ids: [],
			};
			const res = ruleInterpretation(claim, sampleLedger);
			expect(res.pass).toBe(false);
			expect(res.status).toBe('needs_input');
		});
	});
});

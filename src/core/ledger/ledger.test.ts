import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildLedger, ledgerForPrompt } from './ledger';
import { scanRepo } from './scan';
import {
	CommitValue,
	DependencyValue,
	DiffstatValue,
	Fact,
	FileValue,
	ReadmeLineValue,
	ScanError,
} from './types';

describe('Fact Ledger', () => {
	const fixturePath = path.resolve('fixtures/demo-repo');
	const expectedJsonPath = path.resolve('fixtures/expected.json');

	it('matches fixtures/expected.json ground truth', () => {
		const expectedRaw = fs.readFileSync(expectedJsonPath, 'utf8');
		const expected = JSON.parse(expectedRaw);

		const scan = scanRepo(fixturePath);
		const ledger = buildLedger(scan);

		const commitTotalFact = ledger.find((f) => f.type === 'commit_total');
		expect(commitTotalFact).toBeDefined();
		expect(commitTotalFact?.value).toBe(expected.commit_total);
		expect(commitTotalFact?.evidence_location).toBe('git:log');

		const firstDateFact = ledger.find((f) => f.type === 'first_commit_date');
		expect(firstDateFact).toBeDefined();
		expect(firstDateFact?.value).toBe(expected.first_commit_date);

		const lastDateFact = ledger.find((f) => f.type === 'last_commit_date');
		expect(lastDateFact).toBeDefined();
		expect(lastDateFact?.value).toBe(expected.last_commit_date);

		const fileFacts = ledger.filter((f) => f.type === 'file');
		const filePaths = fileFacts.map((f) => (f.value as FileValue).path).sort();
		const expectedFiles = [...expected.files].sort();
		expect(filePaths).toEqual(expectedFiles);

		const depFacts = ledger.filter((f) => f.type === 'dependency');
		const depNames = depFacts.map((f) => (f.value as DependencyValue).name).sort();
		const expectedDeps = [...expected.dependencies].sort();
		expect(depNames).toEqual(expectedDeps);

		const readmeFacts = ledger.filter((f) => f.type === 'readme_line');
		for (const expectedLine of expected.readme_lines) {
			const matching = readmeFacts.find(
				(f) =>
					(f.value as ReadmeLineValue).line === expectedLine.line &&
					(f.value as ReadmeLineValue).text === expectedLine.text
			);
			expect(matching).toBeDefined();
			expect(matching?.evidence_location).toBe(`readme:${expectedLine.line}`);
		}

		const measurementFacts = ledger.filter((f) => f.type === 'measurement');
		expect(measurementFacts).toHaveLength(0);
	});

	it('produces identical JSON on two separate runs', () => {
		const scan1 = scanRepo(fixturePath);
		const ledger1 = buildLedger(scan1);

		const scan2 = scanRepo(fixturePath);
		const ledger2 = buildLedger(scan2);

		const json1 = JSON.stringify(ledger1);
		const json2 = JSON.stringify(ledger2);

		expect(json1).toBe(json2);
	});

	it('assigns strictly sequential Fxxx ids', () => {
		const scan = scanRepo(fixturePath);
		const ledger = buildLedger(scan);

		expect(ledger.length).toBeGreaterThan(0);
		for (let i = 0; i < ledger.length; i++) {
			const expectedId = 'F' + String(i + 1).padStart(3, '0');
			expect(ledger[i].id).toBe(expectedId);
		}
	});

	it('includes commit and diffstat facts for all commits', () => {
		const scan = scanRepo(fixturePath);
		const ledger = buildLedger(scan);

		const commitFacts = ledger.filter((f) => f.type === 'commit');
		expect(commitFacts).toHaveLength(14);

		const diffstatFacts = ledger.filter((f) => f.type === 'diffstat');
		expect(diffstatFacts).toHaveLength(14);

		for (const cf of commitFacts) {
			const val = cf.value as CommitValue;
			expect(val.hash).toBeTruthy();
			expect(val.date).toBeTruthy();
			expect(val.subject).toBeTruthy();
			expect(cf.evidence_location).toBe(`commit:${val.hash}`);
		}

		for (const df of diffstatFacts) {
			const val = df.value as DiffstatValue;
			expect(val.commit).toBeTruthy();
			expect(val.files_changed).toBeGreaterThan(0);
			expect(df.evidence_location).toBe(`commit:${val.commit}`);
		}
	});

	it('formats prompt ledger and reports truncation correctly', () => {
		const scan = scanRepo(fixturePath);
		const ledger = buildLedger(scan);

		const fullPrompt = ledgerForPrompt(ledger, 12000);
		expect(fullPrompt.truncated).toBe(false);
		expect(fullPrompt.includedFacts).toBe(ledger.length);
		expect(fullPrompt.text.length).toBeLessThanOrEqual(12000);
		expect(fullPrompt.text).toContain('commit_total: 14');
		expect(fullPrompt.text).toContain('first_commit_date: 2026-03-02');
		expect(fullPrompt.text).toContain('dependency: commander');

		const truncatedPrompt = ledgerForPrompt(ledger, 300);
		expect(truncatedPrompt.truncated).toBe(true);
		expect(truncatedPrompt.includedFacts).toBeLessThan(ledger.length);
		expect(truncatedPrompt.text.length).toBeLessThanOrEqual(300);
		expect(truncatedPrompt.text).toContain('commit_total: 14');
	});

	it('includes measurement fact when bench/results.json exists and parses', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-bench-'));
		try {
			execFileSync('git', ['init'], { cwd: tempDir });
			execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd: tempDir });
			execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });

			fs.writeFileSync(path.join(tempDir, 'README.md'), '# test\nline 2\n');
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'bench-repo', scripts: {}, dependencies: {} }, null, 2)
			);
			fs.mkdirSync(path.join(tempDir, 'bench'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, 'bench', 'results.json'),
				JSON.stringify({ runtimeMs: 142, throughput: 9500 })
			);

			execFileSync('git', ['add', '.'], { cwd: tempDir });
			execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tempDir });

			const scan = scanRepo(tempDir);
			const ledger = buildLedger(scan);

			const measurementFact = ledger.find((f) => f.type === 'measurement');
			expect(measurementFact).toBeDefined();
			expect(measurementFact?.value).toEqual({ runtimeMs: 142, throughput: 9500 });
			expect(measurementFact?.source).toBe('bench/results.json');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('Error handling', () => {
		it('returns typed error when path does not exist', () => {
			try {
				scanRepo('/tmp/does-not-exist');
				expect.unreachable('Should have thrown ScanError');
			} catch (err: unknown) {
				expect(err).toBeInstanceOf(ScanError);
				const scanErr = err as ScanError;
				expect(scanErr.code).toBe('REPO_NOT_FOUND');
			}
		});

		it('returns typed error when path is not a git repo', () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-not-git-'));
			try {
				scanRepo(tempDir);
				expect.unreachable('Should have thrown ScanError');
			} catch (err: unknown) {
				expect(err).toBeInstanceOf(ScanError);
				const scanErr = err as ScanError;
				expect(scanErr.code).toBe('NOT_A_GIT_REPO');
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('returns typed error when git repo is empty', () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-empty-'));
			try {
				execFileSync('git', ['init'], { cwd: tempDir });
				scanRepo(tempDir);
				expect.unreachable('Should have thrown ScanError');
			} catch (err: unknown) {
				expect(err).toBeInstanceOf(ScanError);
				const scanErr = err as ScanError;
				expect(scanErr.code).toBe('EMPTY_REPO');
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('returns typed error when README is missing', () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-no-readme-'));
			try {
				execFileSync('git', ['init'], { cwd: tempDir });
				execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd: tempDir });
				execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
				fs.writeFileSync(
					path.join(tempDir, 'package.json'),
					JSON.stringify({ name: 'no-readme' })
				);
				execFileSync('git', ['add', '.'], { cwd: tempDir });
				execFileSync('git', ['commit', '-m', 'add package.json'], { cwd: tempDir });

				scanRepo(tempDir);
				expect.unreachable('Should have thrown ScanError');
			} catch (err: unknown) {
				expect(err).toBeInstanceOf(ScanError);
				const scanErr = err as ScanError;
				expect(scanErr.code).toBe('MISSING_README');
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('returns typed error when package.json is missing', () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-no-pkg-'));
			try {
				execFileSync('git', ['init'], { cwd: tempDir });
				execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd: tempDir });
				execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
				fs.writeFileSync(path.join(tempDir, 'README.md'), '# No Package');
				execFileSync('git', ['add', '.'], { cwd: tempDir });
				execFileSync('git', ['commit', '-m', 'add readme'], { cwd: tempDir });

				scanRepo(tempDir);
				expect.unreachable('Should have thrown ScanError');
			} catch (err: unknown) {
				expect(err).toBeInstanceOf(ScanError);
				const scanErr = err as ScanError;
				expect(scanErr.code).toBe('MISSING_PACKAGE_JSON');
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('handles binary files without crashing and sets line_count to 0', () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-binary-'));
			try {
				execFileSync('git', ['init'], { cwd: tempDir });
				execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd: tempDir });
				execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
				fs.writeFileSync(path.join(tempDir, 'README.md'), '# Has Binary');
				fs.writeFileSync(
					path.join(tempDir, 'package.json'),
					JSON.stringify({ name: 'has-binary' })
				);
				// Create binary file with null bytes
				const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
				fs.writeFileSync(path.join(tempDir, 'sample.bin'), binaryBuffer);

				execFileSync('git', ['add', '.'], { cwd: tempDir });
				execFileSync('git', ['commit', '-m', 'add binary file'], { cwd: tempDir });

				const scan = scanRepo(tempDir);
				expect(scan).toBeDefined();

				const binFile = scan.files.find((f) => f.path === 'sample.bin');
				expect(binFile).toBeDefined();
				expect(binFile?.is_binary).toBe(true);
				expect(binFile?.line_count).toBe(0);

				const ledger = buildLedger(scan);
				const binFact = ledger.find(
					(f) => f.type === 'file' && (f.value as FileValue).path === 'sample.bin'
				);
				expect(binFact).toBeDefined();
				expect((binFact?.value as FileValue).line_count).toBe(0);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
});

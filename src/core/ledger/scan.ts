import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	CommitValue,
	DiffstatValue,
	FileData,
	PackageJsonData,
	ReadmeData,
	RepoScan,
	ScanError,
	ScanOptions,
} from './types';

export function isBinaryBuffer(buf: Buffer): boolean {
	const checkLen = Math.min(buf.length, 8000);
	for (let i = 0; i < checkLen; i++) {
		if (buf[i] === 0) {
			return true;
		}
	}
	return false;
}

export function countLines(content: string): number {
	if (content.length === 0) {
		return 0;
	}
	const normalized = content.replace(/\r\n/g, '\n');
	const lines = normalized.endsWith('\n')
		? normalized.slice(0, -1).split('\n')
		: normalized.split('\n');
	return lines.length;
}

function buildJsonLineMap(content: string): Record<string, { start: number; end: number }> {
	const lines = content.replace(/\r\n/g, '\n').split('\n');
	const map: Record<string, { start: number; end: number }> = {};
	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1;
		const line = lines[i];
		const match = line.match(/"([^"]+)"\s*:/);
		if (match) {
			const key = match[1];
			if (!map[key]) {
				map[key] = { start: lineNum, end: lineNum };
			}
		}
	}
	return map;
}

export function scanFile(
	repoPath: string,
	filePath: string
): { isBinary: boolean; lineCount: number } {
	const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath);
	if (!fs.existsSync(fullPath)) {
		throw new ScanError('REPO_NOT_FOUND', `File not found: ${filePath}`, repoPath);
	}
	const buffer = fs.readFileSync(fullPath);
	if (isBinaryBuffer(buffer)) {
		return { isBinary: true, lineCount: 0 };
	}
	const content = buffer.toString('utf8');
	return { isBinary: false, lineCount: countLines(content) };
}

export function scanRepo(repoPath: string, options?: ScanOptions): RepoScan {
	const resolvedPath = path.resolve(repoPath);

	if (!fs.existsSync(resolvedPath)) {
		throw new ScanError(
			'REPO_NOT_FOUND',
			`Repository path does not exist: ${repoPath}`,
			repoPath
		);
	}

	let stat: fs.Stats;
	try {
		stat = fs.statSync(resolvedPath);
	} catch (err: unknown) {
		throw new ScanError(
			'REPO_NOT_FOUND',
			`Failed to inspect repository path: ${String(err)}`,
			repoPath
		);
	}

	if (!stat.isDirectory()) {
		throw new ScanError(
			'NOT_A_DIRECTORY',
			`Repository path is not a directory: ${repoPath}`,
			repoPath
		);
	}

	const gitEntry = path.join(resolvedPath, '.git');
	if (!fs.existsSync(gitEntry)) {
		throw new ScanError(
			'NOT_A_GIT_REPO',
			`Path is not a git repository: ${repoPath}`,
			repoPath
		);
	}

	try {
		execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
			cwd: resolvedPath,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} catch {
		throw new ScanError(
			'NOT_A_GIT_REPO',
			`Path is not a git repository: ${repoPath}`,
			repoPath
		);
	}

	let logOutput = '';
	try {
		logOutput = execFileSync(
			'git',
			['log', '--numstat', '--format=COMMIT:%h%x09%ad%x09%s', '--reverse', '--date=short'],
			{
				cwd: resolvedPath,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
			}
		);
	} catch (err: unknown) {
		const msg = String(err);
		if (
			msg.includes('does not have any commits') ||
			msg.includes('unknown revision') ||
			msg.includes('fatal: your current branch')
		) {
			throw new ScanError(
				'EMPTY_REPO',
				`Git repository has no commits: ${repoPath}`,
				repoPath
			);
		}
		throw new ScanError(
			'GIT_COMMAND_FAILED',
			`Failed to read git log: ${msg}`,
			repoPath
		);
	}

	if (!logOutput.trim()) {
		throw new ScanError(
			'EMPTY_REPO',
			`Git repository has no commits: ${repoPath}`,
			repoPath
		);
	}

	const commits: CommitValue[] = [];
	const diffstats: DiffstatValue[] = [];

	const logLines = logOutput.split(/\r?\n/);
	let currentCommit: CommitValue | null = null;
	let filesChanged = 0;
	let insertions = 0;
	let deletions = 0;

	const flushDiffstat = (): void => {
		if (currentCommit) {
			diffstats.push({
				commit: currentCommit.hash,
				files_changed: filesChanged,
				insertions,
				deletions,
			});
		}
		filesChanged = 0;
		insertions = 0;
		deletions = 0;
	};

	for (const line of logLines) {
		if (line.startsWith('COMMIT:')) {
			flushDiffstat();
			const parts = line.slice('COMMIT:'.length).split('\t');
			const hash = parts[0] || '';
			const date = parts[1] || '';
			const subject = parts.slice(2).join('\t') || '';
			currentCommit = { hash, date, subject };
			commits.push(currentCommit);
		} else if (line.trim().length > 0 && currentCommit) {
			const statParts = line.split('\t');
			if (statParts.length >= 3) {
				filesChanged++;
				const add = statParts[0];
				const del = statParts[1];
				if (add !== '-') {
					insertions += parseInt(add, 10) || 0;
				}
				if (del !== '-') {
					deletions += parseInt(del, 10) || 0;
				}
			}
		}
	}
	flushDiffstat();

	let lsOutput = '';
	try {
		lsOutput = execFileSync('git', ['ls-files'], {
			cwd: resolvedPath,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} catch (err: unknown) {
		throw new ScanError(
			'GIT_COMMAND_FAILED',
			`Failed to list tracked files: ${String(err)}`,
			repoPath
		);
	}

	const trackedFiles = lsOutput
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	const files: FileData[] = [];
	for (const relPath of trackedFiles) {
		const fullFilePath = path.join(resolvedPath, relPath);
		if (!fs.existsSync(fullFilePath)) {
			continue;
		}
		let fStat: fs.Stats;
		try {
			fStat = fs.statSync(fullFilePath);
		} catch {
			continue;
		}
		if (fStat.isDirectory()) {
			continue;
		}

		let buffer: Buffer;
		try {
			buffer = fs.readFileSync(fullFilePath);
		} catch {
			continue;
		}

		const isBinary = isBinaryBuffer(buffer);
		if (isBinary) {
			files.push({
				path: relPath.replace(/\\/g, '/'),
				line_count: 0,
				is_binary: true,
			});
		} else {
			const content = buffer.toString('utf8');
			files.push({
				path: relPath.replace(/\\/g, '/'),
				line_count: countLines(content),
				is_binary: false,
			});
		}
	}

	const packageJsonPath = path.join(resolvedPath, 'package.json');
	let packageJsonData: PackageJsonData | null = null;
	if (!fs.existsSync(packageJsonPath)) {
		if (!options?.allowMissingPackageJson) {
			throw new ScanError(
				'MISSING_PACKAGE_JSON',
				`package.json not found in repository: ${repoPath}`,
				repoPath
			);
		}
	} else {
		const pkgBuffer = fs.readFileSync(packageJsonPath);
		if (isBinaryBuffer(pkgBuffer)) {
			throw new ScanError(
				'BINARY_FILE',
				`package.json is a binary file: ${packageJsonPath}`,
				repoPath
			);
		}
		const pkgContent = pkgBuffer.toString('utf8');
		try {
			const parsed = JSON.parse(pkgContent);
			packageJsonData = {
				name: typeof parsed.name === 'string' ? parsed.name : undefined,
				scripts:
					parsed.scripts && typeof parsed.scripts === 'object'
						? parsed.scripts
						: undefined,
				dependencies:
					parsed.dependencies && typeof parsed.dependencies === 'object'
						? parsed.dependencies
						: undefined,
				devDependencies:
					parsed.devDependencies && typeof parsed.devDependencies === 'object'
						? parsed.devDependencies
						: undefined,
				lineMap: buildJsonLineMap(pkgContent),
			};
		} catch (err: unknown) {
			throw new ScanError(
				'GIT_COMMAND_FAILED',
				`Failed to parse package.json: ${String(err)}`,
				repoPath
			);
		}
	}

	const readmeCandidates = ['README.md', 'README', 'readme.md', 'Readme.md'];
	let readmePath: string | null = null;
	for (const candidate of readmeCandidates) {
		const full = path.join(resolvedPath, candidate);
		if (fs.existsSync(full)) {
			readmePath = full;
			break;
		}
	}

	let readmeData: ReadmeData | null = null;
	if (!readmePath) {
		if (!options?.allowMissingReadme) {
			throw new ScanError(
				'MISSING_README',
				`README.md not found in repository: ${repoPath}`,
				repoPath
			);
		}
	} else {
		const rBuffer = fs.readFileSync(readmePath);
		if (isBinaryBuffer(rBuffer)) {
			throw new ScanError(
				'BINARY_FILE',
				`README file is binary: ${readmePath}`,
				repoPath
			);
		}
		const rContent = rBuffer.toString('utf8');
		const rawLines = rContent.replace(/\r\n/g, '\n').split('\n');
		const parsedLines: { text: string; line: number }[] = [];
		for (let i = 0; i < rawLines.length; i++) {
			const lineNum = i + 1;
			const trimmed = rawLines[i].trim();
			if (trimmed.length > 0) {
				parsedLines.push({ text: trimmed, line: lineNum });
			}
		}
		readmeData = {
			filePath: path.basename(readmePath),
			lines: parsedLines,
			totalLines: rawLines.length,
		};
	}

	const benchPath = path.join(resolvedPath, 'bench', 'results.json');
	let measurements: Record<string, unknown> | null = null;
	if (fs.existsSync(benchPath)) {
		try {
			const benchBuffer = fs.readFileSync(benchPath);
			if (!isBinaryBuffer(benchBuffer)) {
				const benchContent = benchBuffer.toString('utf8');
				const parsed = JSON.parse(benchContent);
				if (parsed && typeof parsed === 'object') {
					measurements = parsed as Record<string, unknown>;
				}
			}
		} catch {
			measurements = null;
		}
	}

	const repoName = packageJsonData?.name || path.basename(resolvedPath);

	return {
		repoPath: resolvedPath,
		repoName,
		commits,
		diffstats,
		files,
		packageJson: packageJsonData,
		readme: readmeData,
		measurements,
	};
}

export function safeScanRepo(
	repoPath: string,
	options?: ScanOptions
): { ok: true; scan: RepoScan } | { ok: false; error: ScanError } {
	try {
		const scan = scanRepo(repoPath, options);
		return { ok: true, scan };
	} catch (err: unknown) {
		if (err instanceof ScanError) {
			return { ok: false, error: err };
		}
		return {
			ok: false,
			error: new ScanError('GIT_COMMAND_FAILED', String(err), repoPath),
		};
	}
}

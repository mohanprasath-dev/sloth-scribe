import { z } from 'zod';

export type FactType =
	| 'repo_name'
	| 'commit_total'
	| 'first_commit_date'
	| 'last_commit_date'
	| 'commit'
	| 'diffstat'
	| 'file'
	| 'dependency'
	| 'script'
	| 'readme_line'
	| 'measurement';

export interface CommitValue {
	hash: string;
	subject: string;
	date: string;
}

export interface DiffstatValue {
	commit: string;
	files_changed: number;
	insertions: number;
	deletions: number;
}

export interface FileValue {
	path: string;
	line_count: number;
}

export interface DependencyValue {
	name: string;
	version: string;
	location: string;
}

export interface ScriptValue {
	name: string;
	command: string;
}

export interface ReadmeLineValue {
	text: string;
	line: number;
}

export interface Fact<T = unknown> {
	id: string;
	type: FactType;
	value: T;
	source: string;
	evidence_location: string;
}

export const factSchema = z.object({
	id: z.string().regex(/^F\d{3,}$/),
	type: z.enum([
		'repo_name',
		'commit_total',
		'first_commit_date',
		'last_commit_date',
		'commit',
		'diffstat',
		'file',
		'dependency',
		'script',
		'readme_line',
		'measurement',
	]),
	value: z.unknown(),
	source: z.string(),
	evidence_location: z.string(),
});

export type ScanErrorCode =
	| 'REPO_NOT_FOUND'
	| 'NOT_A_DIRECTORY'
	| 'NOT_A_GIT_REPO'
	| 'EMPTY_REPO'
	| 'MISSING_README'
	| 'MISSING_PACKAGE_JSON'
	| 'BINARY_FILE'
	| 'GIT_COMMAND_FAILED';

export class ScanError extends Error {
	readonly code: ScanErrorCode;
	readonly repoPath: string;

	constructor(code: ScanErrorCode, message: string, repoPath: string) {
		super(message);
		this.name = 'ScanError';
		this.code = code;
		this.repoPath = repoPath;
		Object.setPrototypeOf(this, ScanError.prototype);
	}
}

export interface PackageJsonData {
	name?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	lineMap?: Record<string, { start: number; end: number }>;
}

export interface ReadmeData {
	filePath: string;
	lines: { text: string; line: number }[];
	totalLines: number;
}

export interface FileData {
	path: string;
	line_count: number;
	is_binary: boolean;
}

export interface RepoScan {
	repoPath: string;
	repoName: string;
	commits: CommitValue[];
	diffstats: DiffstatValue[];
	files: FileData[];
	packageJson: PackageJsonData | null;
	readme: ReadmeData | null;
	measurements: Record<string, unknown> | null;
}

export interface PromptLedger {
	text: string;
	truncated: boolean;
	totalFacts: number;
	includedFacts: number;
	toString(): string;
}

export interface ScanOptions {
	allowMissingReadme?: boolean;
	allowMissingPackageJson?: boolean;
}

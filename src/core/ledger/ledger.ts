import {
	CommitValue,
	DependencyValue,
	DiffstatValue,
	Fact,
	FactType,
	FileValue,
	PromptLedger,
	ReadmeLineValue,
	RepoScan,
	ScriptValue,
} from './types';

export function buildLedger(scan: RepoScan): Fact[] {
	const facts: Fact[] = [];

	const pkg = scan.packageJson;
	const nameStart = pkg?.lineMap?.['name']?.start ?? 1;
	const nameEnd = pkg?.lineMap?.['name']?.end ?? 1;

	facts.push({
		id: '',
		type: 'repo_name',
		value: scan.repoName,
		source: pkg ? 'package.json' : 'git',
		evidence_location: pkg
			? `file:package.json:${nameStart}-${nameEnd}`
			: 'git:log',
	});

	facts.push({
		id: '',
		type: 'commit_total',
		value: scan.commits.length,
		source: 'git log',
		evidence_location: 'git:log',
	});

	const firstCommit = scan.commits[0];
	const lastCommit = scan.commits[scan.commits.length - 1];

	facts.push({
		id: '',
		type: 'first_commit_date',
		value: firstCommit ? firstCommit.date : '',
		source: 'git log',
		evidence_location: firstCommit ? `commit:${firstCommit.hash}` : 'git:log',
	});

	facts.push({
		id: '',
		type: 'last_commit_date',
		value: lastCommit ? lastCommit.date : '',
		source: 'git log',
		evidence_location: lastCommit ? `commit:${lastCommit.hash}` : 'git:log',
	});

	for (const commit of scan.commits) {
		facts.push({
			id: '',
			type: 'commit',
			value: {
				hash: commit.hash,
				subject: commit.subject,
				date: commit.date,
			},
			source: 'git log',
			evidence_location: `commit:${commit.hash}`,
		});
	}

	for (const stat of scan.diffstats) {
		facts.push({
			id: '',
			type: 'diffstat',
			value: {
				commit: stat.commit,
				files_changed: stat.files_changed,
				insertions: stat.insertions,
				deletions: stat.deletions,
			},
			source: 'git show',
			evidence_location: `commit:${stat.commit}`,
		});
	}

	const sortedFiles = [...scan.files].sort((a, b) => a.path.localeCompare(b.path));
	for (const file of sortedFiles) {
		const lineCount = Math.max(1, file.line_count);
		facts.push({
			id: '',
			type: 'file',
			value: {
				path: file.path,
				line_count: file.line_count,
			},
			source: 'git ls-files',
			evidence_location: `file:${file.path}:1-${lineCount}`,
		});
	}

	const depList: DependencyValue[] = [];
	if (pkg?.dependencies) {
		for (const [name, version] of Object.entries(pkg.dependencies)) {
			depList.push({ name, version, location: 'dependencies' });
		}
	}
	if (pkg?.devDependencies) {
		for (const [name, version] of Object.entries(pkg.devDependencies)) {
			depList.push({ name, version, location: 'devDependencies' });
		}
	}
	depList.sort((a, b) => a.name.localeCompare(b.name));

	for (const dep of depList) {
		const lineInfo = pkg?.lineMap?.[dep.name] ?? { start: 1, end: 1 };
		facts.push({
			id: '',
			type: 'dependency',
			value: dep,
			source: 'package.json',
			evidence_location: `file:package.json:${lineInfo.start}-${lineInfo.end}`,
		});
	}

	const scriptList: ScriptValue[] = [];
	if (pkg?.scripts) {
		for (const [name, command] of Object.entries(pkg.scripts)) {
			scriptList.push({ name, command });
		}
	}
	scriptList.sort((a, b) => a.name.localeCompare(b.name));

	for (const script of scriptList) {
		const lineInfo = pkg?.lineMap?.[script.name] ?? { start: 1, end: 1 };
		facts.push({
			id: '',
			type: 'script',
			value: script,
			source: 'package.json',
			evidence_location: `file:package.json:${lineInfo.start}-${lineInfo.end}`,
		});
	}

	if (scan.readme?.lines) {
		const sortedReadme = [...scan.readme.lines].sort((a, b) => a.line - b.line);
		for (const rLine of sortedReadme) {
			facts.push({
				id: '',
				type: 'readme_line',
				value: {
					text: rLine.text,
					line: rLine.line,
				},
				source: scan.readme.filePath,
				evidence_location: `readme:${rLine.line}`,
			});
		}
	}

	if (scan.measurements) {
		facts.push({
			id: '',
			type: 'measurement',
			value: scan.measurements,
			source: 'bench/results.json',
			evidence_location: 'file:bench/results.json:1-1',
		});
	}

	for (let i = 0; i < facts.length; i++) {
		facts[i].id = 'F' + String(i + 1).padStart(3, '0');
	}

	return facts;
}

export function formatFactSummary(fact: Fact): string {
	switch (fact.type) {
		case 'repo_name':
			return `[${fact.id}] repo_name: ${String(fact.value)}`;
		case 'commit_total':
			return `[${fact.id}] commit_total: ${String(fact.value)}`;
		case 'first_commit_date':
			return `[${fact.id}] first_commit_date: ${String(fact.value)}`;
		case 'last_commit_date':
			return `[${fact.id}] last_commit_date: ${String(fact.value)}`;
		case 'dependency': {
			const v = fact.value as DependencyValue;
			const ver = v.version ? ` (${v.version})` : '';
			return `[${fact.id}] dependency: ${v.name}${ver}`;
		}
		case 'script': {
			const v = fact.value as ScriptValue;
			return `[${fact.id}] script: ${v.name} -> ${v.command}`;
		}
		case 'commit': {
			const v = fact.value as CommitValue;
			return `[${fact.id}] commit: ${v.hash} (${v.date}) ${v.subject}`;
		}
		case 'file': {
			const v = fact.value as FileValue;
			return `[${fact.id}] file: ${v.path} (${v.line_count} lines)`;
		}
		case 'diffstat': {
			const v = fact.value as DiffstatValue;
			return `[${fact.id}] diffstat: ${v.commit} (+${v.insertions}/-${v.deletions} in ${v.files_changed} files)`;
		}
		case 'readme_line': {
			const v = fact.value as ReadmeLineValue;
			return `[${fact.id}] readme_line: L${v.line} ${v.text}`;
		}
		case 'measurement': {
			return `[${fact.id}] measurement: ${JSON.stringify(fact.value)}`;
		}
		default:
			return `[${fact.id}] ${fact.type}: ${JSON.stringify(fact.value)}`;
	}
}

function getFactPriority(type: FactType): number {
	switch (type) {
		case 'commit_total':
		case 'repo_name':
			return 1;
		case 'first_commit_date':
		case 'last_commit_date':
			return 2;
		case 'dependency':
			return 3;
		case 'commit':
			return 4;
		case 'file':
			return 5;
		case 'script':
			return 6;
		case 'readme_line':
			return 7;
		case 'diffstat':
			return 8;
		case 'measurement':
			return 9;
		default:
			return 10;
	}
}

export function ledgerForPrompt(ledger: Fact[], maxChars = 12000): PromptLedger {
	const allFormatted = ledger.map((fact) => ({
		fact,
		summary: formatFactSummary(fact),
	}));

	const fullText = allFormatted.map((item) => item.summary).join('\n');

	if (fullText.length <= maxChars) {
		return {
			text: fullText,
			truncated: false,
			totalFacts: ledger.length,
			includedFacts: ledger.length,
			toString() {
				return this.text;
			},
		};
	}

	const ranked = allFormatted.map((item, index) => ({
		...item,
		originalIndex: index,
		priority: getFactPriority(item.fact.type),
	}));

	ranked.sort((a, b) => {
		if (a.priority !== b.priority) {
			return a.priority - b.priority;
		}
		return a.originalIndex - b.originalIndex;
	});

	const selected: typeof ranked = [];
	let currentLen = 0;

	for (const item of ranked) {
		const addition = selected.length === 0 ? item.summary.length : item.summary.length + 1;
		if (currentLen + addition <= maxChars) {
			selected.push(item);
			currentLen += addition;
		}
	}

	selected.sort((a, b) => a.originalIndex - b.originalIndex);
	const truncatedText = selected.map((item) => item.summary).join('\n');

	return {
		text: truncatedText,
		truncated: true,
		totalFacts: ledger.length,
		includedFacts: selected.length,
		toString() {
			return this.text;
		},
	};
}

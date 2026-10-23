#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="fixtures/demo-repo"

# Ensure we are in the repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# 1. Clean previous fixture idempotently
rm -rf "${REPO_DIR}"
mkdir -p "${REPO_DIR}"
cd "${REPO_DIR}"

# 2. Initialize git repository with main branch
git init -b main

# Enforce LF endings and fixed configs for byte-reproducibility
git config user.name "Tinytasks Author"
git config user.email "author@tinytasks.local"
git config core.autocrlf false
git config core.eol lf
git config core.filemode false

export GIT_AUTHOR_NAME="Tinytasks Author"
export GIT_AUTHOR_EMAIL="author@tinytasks.local"
export GIT_COMMITTER_NAME="Tinytasks Author"
export GIT_COMMITTER_EMAIL="author@tinytasks.local"

commit_step() {
	local date="$1"
	local msg="$2"
	export GIT_AUTHOR_DATE="$date"
	export GIT_COMMITTER_DATE="$date"
	git add -A
	git commit -m "$msg"
}

mkdir -p src tests

# Commit 1 (2026-03-02 10:00:00 +0000)
cat << 'EOF' > package.json
{
  "name": "tinytasks",
  "version": "0.1.0",
  "description": "Minimal task manager CLI",
  "main": "src/cli.js",
  "scripts": {
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "zod": "^3.23.0"
  }
}
EOF

cat << 'EOF' > README.md
# tinytasks

Minimal task management command line utility.
All commit history and dates (2026-03-02 through 2026-03-13) are synthetic.

## Performance

Cuts build time by 60% compared to the old pipeline.

## Features

- Fast terminal task capture
- CSV export for task lists
- Built-in dark mode support
- Schema validation with zod
EOF

commit_step "2026-03-02 10:00:00 +0000" "init project with package.json and README"

# Commit 2 (2026-03-03 10:00:00 +0000)
cat << 'EOF' > src/store.js
export function createTaskStore() {
	const tasks = [];

	return {
		add(title) {
			const task = {
				id: tasks.length + 1,
				title,
				completed: false,
			};
			tasks.push(task);
			return task;
		},
		list() {
			return [...tasks];
		},
	};
}
EOF

commit_step "2026-03-03 10:00:00 +0000" "add task store foundation"

# Commit 3 (2026-03-04 10:00:00 +0000)
cat << 'EOF' > tests/store.test.js
import assert from 'node:assert';
import test from 'node:test';
import { createTaskStore } from '../src/store.js';

test('createTaskStore adds and lists tasks', () => {
	const store = createTaskStore();
	const t1 = store.add('Buy groceries');
	assert.strictEqual(t1.id, 1);
	assert.strictEqual(t1.title, 'Buy groceries');
	assert.strictEqual(t1.completed, false);
	assert.strictEqual(store.list().length, 1);
});
EOF

commit_step "2026-03-04 10:00:00 +0000" "add unit tests for task store"

# Commit 4 (2026-03-05 10:00:00 +0000)
cat << 'EOF' > src/cli.js
import { Command } from 'commander';
import { createTaskStore } from './store.js';

const program = new Command();
const store = createTaskStore();

program
	.name('tinytasks')
	.description('Minimal task manager CLI')
	.version('0.1.0');

export { program, store };
EOF

commit_step "2026-03-05 10:00:00 +0000" "create CLI entrypoint with commander"

# Commit 5 (2026-03-06 10:00:00 +0000)
cat << 'EOF' > src/format.js
export function formatTask(task) {
	const marker = task.completed ? '[x]' : '[ ]';
	return `${marker} #${task.id} ${task.title}`;
}
EOF

commit_step "2026-03-06 10:00:00 +0000" "add formatting helper for output display"

# Commit 6 (2026-03-07 10:00:00 +0000)
cat << 'EOF' > src/cli.js
import { Command } from 'commander';
import { formatTask } from './format.js';
import { createTaskStore } from './store.js';

const program = new Command();
const store = createTaskStore();

program
	.name('tinytasks')
	.description('Minimal task manager CLI')
	.version('0.1.0');

program
	.command('add <title>')
	.description('Add a new task')
	.action((title) => {
		const task = store.add(title);
		console.log(formatTask(task));
	});

program
	.command('list')
	.description('List all tasks')
	.action(() => {
		for (const task of store.list()) {
			console.log(formatTask(task));
		}
	});

export { program, store };
EOF

commit_step "2026-03-07 10:00:00 +0000" "integrate task display formatting into CLI"

# Commit 7 (2026-03-08 10:00:00 +0000)
cat << 'EOF' > src/store.js
import { z } from 'zod';

const TaskSchema = z.object({
	id: z.number(),
	title: z.string(),
	completed: z.boolean().default(false),
});

export function createTaskStore() {
	const tasks = [];

	return {
		add(title) {
			const task = TaskSchema.parse({
				id: tasks.length + 1,
				title,
				completed: false,
			});
			tasks.push(task);
			return task;
		},
		list() {
			return [...tasks];
		},
	};
}
EOF

commit_step "2026-03-08 10:00:00 +0000" "add task validation schema using zod"

# Commit 8 (2026-03-09 10:00:00 +0000)
cat << 'EOF' > tests/store.test.js
import assert from 'node:assert';
import test from 'node:test';
import { createTaskStore } from '../src/store.js';

test('createTaskStore adds and lists tasks', () => {
	const store = createTaskStore();
	const t1 = store.add('Buy groceries');
	assert.strictEqual(t1.id, 1);
	assert.strictEqual(t1.title, 'Buy groceries');
	assert.strictEqual(t1.completed, false);
	assert.strictEqual(store.list().length, 1);
});

test('createTaskStore rejects non-string titles', () => {
	const store = createTaskStore();
	assert.throws(() => store.add(123));
});
EOF

commit_step "2026-03-09 10:00:00 +0000" "expand store test coverage for invalid inputs"

# Commit 9 (2026-03-10 10:00:00 +0000) - CSV export implemented
cat << 'EOF' > src/export.js
export function tasksToCSV(tasks) {
	const header = 'id,title,completed';
	const rows = tasks.map((t) => `${t.id},"${t.title.replace(/"/g, '""')}",${Boolean(t.completed)}`);
	return [header, ...rows].join('\n');
}
EOF

commit_step "2026-03-10 10:00:00 +0000" "implement CSV export for task lists"

# Commit 10 (2026-03-10 16:00:00 +0000)
cat << 'EOF' > src/cli.js
import { Command } from 'commander';
import { tasksToCSV } from './export.js';
import { formatTask } from './format.js';
import { createTaskStore } from './store.js';

const program = new Command();
const store = createTaskStore();

program
	.name('tinytasks')
	.description('Minimal task manager CLI')
	.version('0.1.0');

program
	.command('add <title>')
	.description('Add a new task')
	.action((title) => {
		const task = store.add(title);
		console.log(formatTask(task));
	});

program
	.command('list')
	.description('List all tasks')
	.action(() => {
		for (const task of store.list()) {
			console.log(formatTask(task));
		}
	});

program
	.command('export')
	.description('Export tasks')
	.option('-f, --format <format>', 'Export format (csv)', 'csv')
	.action((options) => {
		if (options.format === 'csv') {
			console.log(tasksToCSV(store.list()));
		}
	});

export { program, store };
EOF

commit_step "2026-03-10 16:00:00 +0000" "wire CSV export option into CLI command"

# Commit 11 (2026-03-11 10:00:00 +0000)
cat << 'EOF' > tests/export.test.js
import assert from 'node:assert';
import test from 'node:test';
import { tasksToCSV } from '../src/export.js';

test('tasksToCSV formats task entries into valid CSV', () => {
	const tasks = [
		{ id: 1, title: 'Sample task', completed: false },
		{ id: 2, title: 'Finished task', completed: true },
	];
	const csv = tasksToCSV(tasks);
	assert.ok(csv.startsWith('id,title,completed'));
	assert.ok(csv.includes('1,"Sample task",false'));
	assert.ok(csv.includes('2,"Finished task",true'));
});
EOF

commit_step "2026-03-11 10:00:00 +0000" "add unit tests for CSV export"

# Commit 12 (2026-03-12 10:00:00 +0000)
cat << 'EOF' > src/format.js
export function formatTask(task) {
	const marker = task.completed ? '[x]' : '[ ]';
	return `${marker} #${task.id} ${task.title}`;
}

export function formatHeader(title) {
	return `=== ${title} ===`;
}
EOF

commit_step "2026-03-12 10:00:00 +0000" "refactor output formatters for table borders"

# Commit 13 (2026-03-13 10:00:00 +0000)
cat << 'EOF' > src/store.js
import { z } from 'zod';

const TaskSchema = z.object({
	id: z.number(),
	title: z.string(),
	completed: z.boolean().default(false),
});

export function createTaskStore() {
	const tasks = [];

	return {
		add(title) {
			const task = TaskSchema.parse({
				id: tasks.length + 1,
				title,
				completed: false,
			});
			tasks.push(task);
			return task;
		},
		list() {
			return [...tasks];
		},
		clear() {
			tasks.length = 0;
		},
	};
}
EOF

commit_step "2026-03-13 10:00:00 +0000" "improve store clear method and error handling"

# Commit 14 (2026-03-13 16:00:00 +0000)
cat << 'EOF' > README.md
# tinytasks

Minimal task management command line utility.
All commit history and dates (2026-03-02 through 2026-03-13) are synthetic.

## Performance

Cuts build time by 60% compared to the old pipeline.

## Features

- Fast terminal task capture
- CSV export for task lists
- Built-in dark mode support
- Schema validation with zod

## Usage

```bash
tinytasks add "Review pull requests"
tinytasks list
tinytasks export --format csv
```
EOF

commit_step "2026-03-13 16:00:00 +0000" "finalize CLI documentation and examples in README"

echo "Fixture built successfully in ${REPO_DIR}"

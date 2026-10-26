import { NextRequest, NextResponse } from 'next/server';
import * as path from 'node:path';
import { config } from '../../../src/core/config';
import { runPipeline } from '../../../src/core/draft/pipeline';
import { DraftError } from '../../../src/core/draft/types';
import { ScanError } from '../../../src/core/ledger/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
	let body: { repoPath?: unknown; model?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json(
			{
				error: 'Invalid JSON request body',
				code: 'INVALID_REQUEST',
			},
			{ status: 400 }
		);
	}

	const repoPath = typeof body.repoPath === 'string' ? body.repoPath.trim() : '';
	if (!repoPath) {
		return NextResponse.json(
			{
				error: 'Repository path is required.',
				code: 'REPO_NOT_FOUND',
				name: 'ScanError',
				repoPath: '',
			},
			{ status: 400 }
		);
	}

	const resolvedRepoPath = path.isAbsolute(repoPath)
		? repoPath
		: path.resolve(process.cwd(), repoPath);

	const modelRaw = typeof body.model === 'string' ? body.model.trim() : 'primary';
	const modelOverride =
		modelRaw === 'fallback'
			? config.MODEL_FALLBACK
			: modelRaw === 'hosted' || modelRaw === 'gemini'
				? config.GEMINI_MODEL
				: modelRaw === 'primary' || !modelRaw
					? (config.GEMINI_API_KEY ? config.GEMINI_MODEL : config.MODEL_PRIMARY)
					: modelRaw;

	try {
		const result = await runPipeline(resolvedRepoPath, modelOverride);
		return NextResponse.json(result);
	} catch (err: unknown) {
		if (err instanceof ScanError) {
			return NextResponse.json(
				{
					error: err.message,
					code: err.code,
					name: err.name,
					repoPath: err.repoPath,
				},
				{ status: 400 }
			);
		}
		if (err instanceof DraftError) {
			return NextResponse.json(
				{
					error: err.message,
					code: err.code,
					name: err.name,
					model: err.model,
				},
				{ status: 500 }
			);
		}
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json(
			{
				error: message,
				code: 'PIPELINE_ERROR',
			},
			{ status: 500 }
		);
	}
}

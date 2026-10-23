'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { RunViewer } from '../../components/run-viewer';
import { PipelineResult } from '../../src/core/draft/types';
import { VerifiedClaim } from '../../src/core/verifier/types';

export default function ReplayPage() {
	const [data, setData] = useState<PipelineResult | null>(null);
	const [selectedClaim, setSelectedClaim] = useState<VerifiedClaim | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadReplay() {
			try {
				const res = await fetch('/demo-run.json');
				if (!res.ok) {
					throw new Error(
						`Failed to load demo-run.json: HTTP ${res.status}`
					);
				}
				const json = (await res.json()) as PipelineResult;
				setData(json);
				if (json.verifiedClaims && json.verifiedClaims.length > 0) {
					setSelectedClaim(json.verifiedClaims[0]);
				}
			} catch (err: unknown) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setIsLoading(false);
			}
		}

		loadReplay();
	}, []);

	return (
		<main className="min-h-screen bg-gray-100 text-gray-900 p-4 md:p-8 space-y-6">
			{/* Permanent Replay Banner per PRD */}
			<div
				data-testid="replay-banner"
				role="status"
				className="p-3 bg-amber-100 border border-amber-300 rounded text-amber-900 font-bold text-center text-sm uppercase tracking-wide shadow-sm"
			>
				Recorded run, not live
			</div>

			{/* Top Header */}
			<header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-300 pb-4">
				<div>
					<h1 className="text-2xl font-black tracking-tight text-gray-950 font-sans">
						Sloth Scribe - Replay
					</h1>
					<p className="text-xs text-gray-600 font-mono mt-0.5">
						Recorded run inspection mode
					</p>
				</div>
				<nav className="flex items-center gap-3 text-xs font-semibold">
					<Link
						href="/"
						className="px-2 py-1 text-gray-700 hover:text-black hover:underline"
					>
						&lt;- Back to Live Compiler
					</Link>
					<span className="px-2 py-1 bg-amber-200 text-amber-900 border border-amber-400 rounded">
						Replay Active
					</span>
				</nav>
			</header>

			{/* Loading / Error / Content */}
			{isLoading ? (
				<div className="p-12 text-center text-gray-600 font-mono text-sm">
					Loading recorded run from public/demo-run.json...
				</div>
			) : error ? (
				<div
					role="alert"
					className="p-4 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-mono space-y-2"
				>
					<div className="font-bold">Failed to load replay</div>
					<div>{error}</div>
					<div className="text-[11px] text-gray-600">
						Make sure public/demo-run.json exists. Run: npm run save-replay
					</div>
				</div>
			) : data ? (
				<RunViewer
					data={data}
					selectedClaim={selectedClaim}
					onSelectClaim={(claim) => setSelectedClaim(claim)}
					isReplay={true}
				/>
			) : null}
		</main>
	);
}

'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { RunForm } from '../components/run-form';
import { RunViewer } from '../components/run-viewer';
import { SaveReplayModal } from '../components/save-replay-modal';
import { PipelineResult } from '../src/core/draft/types';
import { VerifiedClaim } from '../src/core/verifier/types';

export default function HomePage() {
	const [data, setData] = useState<PipelineResult | null>(null);
	const [selectedClaim, setSelectedClaim] = useState<VerifiedClaim | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<{ message: string; code?: string } | null>(
		null
	);
	const [isReplayModalOpen, setIsReplayModalOpen] = useState(false);

	const handleRun = async (repoPath: string, model: string) => {
		setIsLoading(true);
		setError(null);
		setSelectedClaim(null);

		try {
			const res = await fetch('/api/run', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ repoPath, model }),
			});

			const json = await res.json();

			if (!res.ok) {
				setError({
					message: json.error || 'Failed to run pipeline',
					code: json.code,
				});
				setIsLoading(false);
				return;
			}

			setData(json as PipelineResult);
			if (json.verifiedClaims && json.verifiedClaims.length > 0) {
				setSelectedClaim(json.verifiedClaims[0]);
			}
		} catch (err: unknown) {
			setError({
				message: err instanceof Error ? err.message : String(err),
				code: 'NETWORK_ERROR',
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="min-h-screen bg-gray-100 text-gray-900 p-4 md:p-8 space-y-6">
			{/* Top Header */}
			<header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-300 pb-4">
				<div>
					<h1 className="text-2xl font-black tracking-tight text-gray-950 font-sans">
						Sloth Scribe
					</h1>
					<p className="text-xs text-gray-600 font-mono mt-0.5">
						Local evidence-constrained write-up compiler
					</p>
				</div>
				<nav className="flex items-center gap-3 text-xs font-semibold">
					<span className="px-2 py-1 bg-black text-white rounded">
						Live Compiler
					</span>
					<Link
						href="/replay"
						data-testid="link-replay"
						className="px-2 py-1 text-gray-700 hover:text-black hover:underline"
					>
						View Recorded Replay -&gt;
					</Link>
				</nav>
			</header>

			{/* Form */}
			<RunForm onSubmit={handleRun} isLoading={isLoading} error={error} />

			{/* Content Area */}
			{data ? (
				<RunViewer
					data={data}
					selectedClaim={selectedClaim}
					onSelectClaim={(claim) => setSelectedClaim(claim)}
					onSaveReplayClick={() => setIsReplayModalOpen(true)}
				/>
			) : (
				!isLoading &&
				!error && (
					<section
						aria-label="Empty State"
						className="border border-dashed border-gray-300 rounded p-12 text-center bg-white space-y-3"
					>
						<h2 className="text-base font-bold text-gray-800">
							No Run Executed Yet
						</h2>
						<p className="text-xs text-gray-500 max-w-md mx-auto">
							Enter a git repository path above (default: fixtures/demo-repo) and
							click &quot;Run Pipeline&quot; to scan git history, build the deterministic
							ledger, draft with local Gemma, and verify claims.
						</p>
						<div className="pt-2">
							<Link
								href="/replay"
								className="text-xs font-mono font-semibold text-black underline hover:text-gray-700"
							>
								Or view the recorded demo replay (/replay)
							</Link>
						</div>
					</section>
				)
			)}

			{/* Save Replay dev-only instruction modal */}
			<SaveReplayModal
				isOpen={isReplayModalOpen}
				onClose={() => setIsReplayModalOpen(false)}
			/>
		</main>
	);
}

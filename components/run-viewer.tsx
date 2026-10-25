import React from 'react';
import { PipelineResult } from '../src/core/draft/types';
import { VerifiedClaim } from '../src/core/verifier/types';
import { downloadMarkdownFile, exportDraftToMarkdown } from './export';
import { EvidencePanel } from './evidence-panel';
import { SentenceChip } from './sentence-chip';
import { SummaryBar } from './summary-bar';

export interface RunViewerProps {
	data: PipelineResult;
	selectedClaim: VerifiedClaim | null;
	onSelectClaim: (claim: VerifiedClaim) => void;
	onSaveReplayClick?: () => void;
	isReplay?: boolean;
}

export function RunViewer({
	data,
	selectedClaim,
	onSelectClaim,
	onSaveReplayClick,
	isReplay = false,
}: RunViewerProps) {
	const verifiedMap = new Map<string, VerifiedClaim>();
	for (const v of data.verifiedClaims) {
		verifiedMap.set(v.claim_id, v);
	}

	const handleExport = () => {
		const markdown = exportDraftToMarkdown(data.draft, data.verifiedClaims);
		downloadMarkdownFile('sloth-scribe-draft.md', markdown);
	};

	return (
		<div className="space-y-4">
			{/* Summary Bar */}
			<SummaryBar runRecord={data.runRecord} />

			{/* Actions row: Export Markdown + Save Replay */}
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleExport}
						data-testid="export-markdown-btn"
						className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
					>
						Export Markdown
					</button>
					{!isReplay && onSaveReplayClick && (
						<button
							type="button"
							onClick={onSaveReplayClick}
							data-testid="save-replay-btn"
							className="px-3 py-1.5 bg-white border border-gray-300 text-gray-800 text-xs font-semibold rounded hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
						>
							Save Run to Replay (dev-only)
						</button>
					)}
				</div>
				<div className="text-xs text-gray-500">
					Click or keyboard-select any sentence chip to inspect evidence.
				</div>
			</div>

			{/* Main Grid: Left Draft, Right Evidence */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{/* Draft Left Column */}
				<section
					aria-label="Compiled Draft"
					className="border border-gray-300 rounded p-4 bg-white shadow-sm"
				>
					<h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">
						Compiled Draft
					</h2>

					<div className="space-y-4 text-justify">
						{data.draft.paragraphs.map((paragraph, pIdx) => (
							<p key={`p-${pIdx}`} className="leading-relaxed">
								{paragraph.claims.map((claim) => {
									const verified = verifiedMap.get(claim.claim_id);
									if (!verified) {
										return null;
									}
									const isSelected =
										selectedClaim?.claim_id === verified.claim_id;
									return (
										<React.Fragment key={verified.claim_id}>
											<SentenceChip
												claim={verified}
												isSelected={isSelected}
												onSelect={onSelectClaim}
											/>{' '}
										</React.Fragment>
									);
								})}
							</p>
						))}
					</div>
				</section>

				{/* Evidence Panel Right Column */}
				<EvidencePanel
					selectedClaim={selectedClaim}
					ledger={data.ledger}
				/>
			</div>
		</div>
	);
}

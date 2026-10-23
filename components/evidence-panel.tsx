import React from 'react';
import { Fact } from '../src/core/ledger/types';
import { VerifiedClaim } from '../src/core/verifier/types';

export interface EvidencePanelProps {
	selectedClaim: VerifiedClaim | null;
	ledger: Fact[];
}

export function EvidencePanel({ selectedClaim, ledger }: EvidencePanelProps) {
	if (!selectedClaim) {
		return (
			<section
				aria-label="Evidence Panel"
				className="border border-gray-300 rounded p-4 bg-gray-50 h-full min-h-[300px]"
			>
				<h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">
					Evidence Panel
				</h2>
				<p className="mt-4 text-sm text-gray-600">
					Select a sentence from the draft on the left to inspect its cited facts,
					evidence locations, and verification reasons.
				</p>
			</section>
		);
	}

	const factMap = new Map<string, Fact>();
	for (const fact of ledger) {
		factMap.set(fact.id, fact);
	}

	let statusBadgeClass =
		'bg-emerald-100 text-emerald-900 border border-emerald-700';
	let statusText = 'VERIFIED';

	if (selectedClaim.status === 'interpretation') {
		statusBadgeClass = 'bg-sky-100 text-sky-900 border border-sky-700';
		statusText = 'INTERPRETATION';
	} else if (selectedClaim.status === 'needs_input') {
		statusBadgeClass = 'bg-amber-100 text-amber-900 border border-amber-700';
		statusText = 'NEEDS INPUT';
	}

	return (
		<section
			aria-label="Evidence Panel"
			className="border border-gray-300 rounded p-4 bg-white h-full shadow-sm"
		>
			<h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">
				Evidence Details
			</h2>

			<div className="mt-3 space-y-3">
				<div>
					<span className="text-xs font-mono uppercase text-gray-500">
						Claim ID
					</span>
					<div className="text-sm font-mono font-semibold text-gray-900">
						{selectedClaim.claim_id}
					</div>
				</div>

				<div>
					<span className="text-xs font-mono uppercase text-gray-500">
						Status
					</span>
					<div className="mt-0.5">
						<span
							className={`inline-block text-xs font-mono font-bold px-2 py-0.5 rounded ${statusBadgeClass}`}
						>
							{statusText}
						</span>
					</div>
				</div>

				<div>
					<span className="text-xs font-mono uppercase text-gray-500">
						Sentence Text
					</span>
					<p className="text-sm text-gray-900 mt-0.5 italic">
						"{selectedClaim.text}"
					</p>
				</div>

				<div>
					<span className="text-xs font-mono uppercase text-gray-500">
						Verification Reason
					</span>
					<div
						data-testid="verification-reason"
						className="text-sm font-mono text-gray-800 bg-gray-50 p-2 border border-gray-200 rounded mt-0.5"
					>
						{selectedClaim.reason}
					</div>
				</div>

				<div>
					<span className="text-xs font-mono uppercase text-gray-500">
						Evidence Locations
					</span>
					{selectedClaim.evidence.length === 0 ? (
						<div className="text-xs text-gray-500 italic mt-0.5">
							No verified evidence locations.
						</div>
					) : (
						<ul className="mt-1 space-y-1">
							{selectedClaim.evidence.map((ev, idx) => (
								<li
									key={`${ev.fact_id}-${idx}`}
									className="text-xs font-mono bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-1 rounded"
								>
									<span className="font-semibold">{ev.fact_id}:</span> {ev.location}
								</li>
							))}
						</ul>
					)}
				</div>

				<div>
					<span className="text-xs font-mono uppercase text-gray-500">
						Cited Ledger Facts ({selectedClaim.fact_ids.length})
					</span>
					{selectedClaim.fact_ids.length === 0 ? (
						<div className="text-xs text-gray-500 italic mt-0.5">
							No ledger facts cited.
						</div>
					) : (
						<div className="mt-1 space-y-2">
							{selectedClaim.fact_ids.map((fid) => {
								const fact = factMap.get(fid);
								if (!fact) {
									return (
										<div
											key={fid}
											className="border border-red-200 bg-red-50 p-2 rounded text-xs"
										>
											<span className="font-mono font-bold text-red-900">
												{fid}
											</span>{' '}
											- Fact not found in ledger
										</div>
									);
								}
								return (
									<div
										key={fid}
										data-testid={`fact-item-${fid}`}
										className="border border-gray-200 bg-gray-50 p-2.5 rounded text-xs space-y-1 font-mono"
									>
										<div className="flex justify-between items-baseline">
											<span className="font-bold text-gray-900">{fact.id}</span>
											<span className="text-gray-500 text-[10px] uppercase">
												{fact.type}
											</span>
										</div>
										<div className="text-gray-700">
											<span className="text-gray-500">Location:</span>{' '}
											{fact.evidence_location}
										</div>
										<div className="text-gray-700">
											<span className="text-gray-500">Source:</span> {fact.source}
										</div>
										<div className="text-gray-900 bg-white p-1.5 border border-gray-200 rounded break-all overflow-x-auto">
											<span className="text-gray-500">Value:</span>{' '}
											{typeof fact.value === 'object'
												? JSON.stringify(fact.value)
												: String(fact.value)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

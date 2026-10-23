import React, { useState } from 'react';

export interface SaveReplayModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function SaveReplayModal({ isOpen, onClose }: SaveReplayModalProps) {
	const [copied, setCopied] = useState(false);

	if (!isOpen) {
		return null;
	}

	const commandText = 'npm run save-replay';

	const handleCopy = async () => {
		try {
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(commandText);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}
		} catch {
			// fallback ignored
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="save-replay-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		>
			<div className="bg-white rounded border border-gray-300 max-w-md w-full p-6 shadow-lg space-y-4 font-sans text-gray-900">
				<h3 id="save-replay-title" className="text-lg font-bold">
					Save Run to Replay
				</h3>
				<p className="text-sm text-gray-600">
					Direct browser saving to public/demo-run.json is disabled. To record
					and save runs deterministically, run the dev script from your
					terminal:
				</p>
				<div className="bg-gray-100 p-3 rounded font-mono text-xs border border-gray-200 flex justify-between items-center">
					<span>{commandText}</span>
					<button
						type="button"
						onClick={handleCopy}
						className="px-2 py-1 text-[11px] bg-white border border-gray-300 rounded hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-black"
					>
						{copied ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<p className="text-xs text-gray-500">
					This script records the run and saves it to public/demo-run.json for
					the /replay page.
				</p>
				<div className="flex justify-end pt-2">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}

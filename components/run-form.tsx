import React, { useEffect, useState } from 'react';

export interface RunFormProps {
	onSubmit: (repoPath: string, model: string) => void;
	isLoading: boolean;
	error: { message: string; code?: string } | null;
}

export function RunForm({ onSubmit, isLoading, error }: RunFormProps) {
	const [repoPath, setRepoPath] = useState('fixtures/demo-repo');
	const [model, setModel] = useState('primary');
	const [isSlowModel, setIsSlowModel] = useState(false);

	useEffect(() => {
		let timer: NodeJS.Timeout | null = null;
		if (isLoading) {
			setIsSlowModel(false);
			timer = setTimeout(() => {
				setIsSlowModel(true);
			}, 3000);
		} else {
			setIsSlowModel(false);
		}
		return () => {
			if (timer) {
				clearTimeout(timer);
			}
		};
	}, [isLoading]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!repoPath.trim() || isLoading) {
			return;
		}
		onSubmit(repoPath.trim(), model);
	};

	return (
		<form
			onSubmit={handleSubmit}
			aria-label="Pipeline Run Configuration"
			className="border border-gray-300 rounded p-4 bg-white shadow-sm space-y-4"
		>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div className="md:col-span-2 space-y-1">
					<label
						htmlFor="repo-path-input"
						className="block text-xs font-semibold uppercase text-gray-700 tracking-wide"
					>
						Repository Path
					</label>
					<input
						id="repo-path-input"
						type="text"
						value={repoPath}
						onChange={(e) => setRepoPath(e.target.value)}
						disabled={isLoading}
						placeholder="fixtures/demo-repo"
						className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
					/>
					<p className="text-[11px] text-gray-500">
						Local git repo path. Default: fixtures/demo-repo
					</p>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="model-select"
						className="block text-xs font-semibold uppercase text-gray-700 tracking-wide"
					>
						Model Selection
					</label>
					<select
						id="model-select"
						value={model}
						onChange={(e) => setModel(e.target.value)}
						disabled={isLoading}
						className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
					>
						<option value="primary">Primary (4B it)</option>
						<option value="fallback">Fallback (1B)</option>
						<option value="hosted">Hosted (Gemma 4 via Gemini API)</option>
					</select>
					<p className="text-[11px] text-gray-500">
						Gemma local or hosted variant
					</p>
				</div>
			</div>

			<div className="flex items-center justify-between pt-1">
				<button
					type="submit"
					disabled={isLoading || !repoPath.trim()}
					data-testid="run-button"
					className="px-5 py-2 bg-black text-white text-sm font-bold rounded hover:bg-gray-800 disabled:bg-gray-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
				>
					{isLoading ? 'Running Pipeline...' : 'Run Pipeline'}
				</button>

				{isLoading && (
					<div className="flex items-center gap-2 text-xs font-mono text-gray-700">
						<span className="animate-spin inline-block w-3 h-3 border-2 border-black border-t-transparent rounded-full" />
						<span>Executing scan -&gt; ledger -&gt; generate -&gt; verify...</span>
					</div>
				)}
			</div>

			{/* Slow model indicator */}
			{isSlowModel && isLoading && (
				<div
					data-testid="slow-model-state"
					className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 flex items-start gap-2 font-mono"
				>
					<span className="font-bold">[Slow Model State]:</span>
					<span>
						Local Ollama model evaluation in progress. Primary 4B model may take
						15-30 seconds depending on hardware. Please wait...
					</span>
				</div>
			)}

			{/* Error banner */}
			{error && (
				<div
					role="alert"
					data-testid="pipeline-error"
					className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-900 space-y-1 font-mono"
				>
					<div className="font-bold text-red-950">
						Pipeline Error {error.code ? `[${error.code}]` : ''}
					</div>
					<div>{error.message}</div>
				</div>
			)}
		</form>
	);
}

import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
	it('loads default values matching .env.example when env is empty', () => {
		const cfg = loadConfig({});
		expect(cfg.OLLAMA_HOST).toBe('http://localhost:11434');
		expect(cfg.MODEL_PRIMARY).toBe('gemma3:4b-it-q4_K_M');
		expect(cfg.MODEL_FALLBACK).toBe('gemma3:1b');
		expect(cfg.SENTRY_DSN).toBe('');
	});

	it('overrides defaults with provided values', () => {
		const cfg = loadConfig({
			OLLAMA_HOST: 'http://remote:11434',
			MODEL_PRIMARY: 'custom:primary',
			MODEL_FALLBACK: 'custom:fallback',
			SENTRY_DSN: 'https://key@sentry.io/123',
		});
		expect(cfg.OLLAMA_HOST).toBe('http://remote:11434');
		expect(cfg.MODEL_PRIMARY).toBe('custom:primary');
		expect(cfg.MODEL_FALLBACK).toBe('custom:fallback');
		expect(cfg.SENTRY_DSN).toBe('https://key@sentry.io/123');
	});
});

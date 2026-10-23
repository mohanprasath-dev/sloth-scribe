import { z } from 'zod';

export const configSchema = z.object({
	OLLAMA_HOST: z.string().default('http://localhost:11434'),
	MODEL_PRIMARY: z.string().default('gemma3:4b-it-q4_K_M'),
	MODEL_FALLBACK: z.string().default('gemma3:1b'),
	SENTRY_DSN: z.string().default(''),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
	return configSchema.parse({
		OLLAMA_HOST: env.OLLAMA_HOST || undefined,
		MODEL_PRIMARY: env.MODEL_PRIMARY || undefined,
		MODEL_FALLBACK: env.MODEL_FALLBACK || undefined,
		SENTRY_DSN: env.SENTRY_DSN !== undefined ? env.SENTRY_DSN : '',
	});
}

export const config: Config = loadConfig();

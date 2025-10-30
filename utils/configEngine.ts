import prisma from './database';

// 🧠 Persistent in-memory cache
const configCache = new Map<string, unknown>();

/**
 * Get a config value for a given workspace and key.
 * Uses cache first, falls back to Prisma.
 */
export async function getConfig<T = unknown>(
	key: string,
	groupId: number
): Promise<T | null> {
	const cacheKey = `${groupId}_${key}`;
	if (configCache.has(cacheKey)) {
		return configCache.get(cacheKey) as T;
	}

	const config = await prisma.config.findFirst({
		where: { workspaceGroupId: groupId, key },
	});

	if (!config) return null;

	configCache.set(cacheKey, config.value);
	return config.value as T;
}

/**
 * Fetch workspace data by Roblox group ID.
 */
export async function fetchWorkspace(groupId: number) {
	return prisma.workspace.findFirst({
		where: { groupId },
	});
}

/**
 * Create or update a config value.
 * Automatically updates cache.
 */
export async function setConfig(
	key: string,
	value: unknown,
	groupId: number
): Promise<void> {
	const existing = await prisma.config.findFirst({
		where: { workspaceGroupId: groupId, key },
		select: { id: true },
	});

	if (existing) {
		await prisma.config.update({
			where: { id: existing.id },
			data: { value },
		});
	} else {
		await prisma.config.create({
			data: { key, value, workspaceGroupId: groupId },
		});
	}

	configCache.set(`${groupId}_${key}`, value);
}

/**
 * Remove a specific key from cache so next getConfig() reloads it.
 */
export function refreshConfig(key: string, groupId: number): void {
	configCache.delete(`${groupId}_${key}`);
}
import prisma from "./database";
import type { NextApiRequest, NextApiResponse, NextApiHandler, GetServerSidePropsContext } from "next";
import { withSessionRoute, withSessionSsr } from "@/lib/withSession";
import * as noblox from "noblox.js";
import { getConfig } from "./configEngine";
import { getThumbnail } from "./userinfoEngine";
import pLimit from "p-limit";

/* -----------------------------------------------
   🔐 PERMISSION MIDDLEWARE (unchanged behavior)
------------------------------------------------ */
export function withPermissionCheck(handler: NextApiHandler, permission?: string) {
	return withSessionRoute(async (req: NextApiRequest, res: NextApiResponse) => {
		const uid = req.session.userid;
		if (!uid) return res.status(401).json({ success: false, error: "Unauthorized" });
		if (!req.query.id) return res.status(400).json({ success: false, error: "Missing required fields" });

		const workspaceId = parseInt(req.query.id as string);
		const user = await prisma.user.findFirst({
			where: { userid: BigInt(uid) },
			include: { roles: true },
		});

		if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });
		const userrole = user.roles.find((role) => role.workspaceGroupId === workspaceId);
		if (!userrole) return res.status(401).json({ success: false, error: "Unauthorized" });
		if (userrole.isOwnerRole) return handler(req, res);
		if (!permission) return handler(req, res);
		if (userrole.permissions.includes(permission)) return handler(req, res);

		return res.status(401).json({ success: false, error: "Unauthorized" });
	});
}

export function withPermissionCheckSsr(
	handler: (context: GetServerSidePropsContext) => Promise<any>,
	permission?: string
) {
	return withSessionSsr(async (context) => {
		const { req, query } = context;
		const uid = req.session.userid;
		if (!uid) return { redirect: { destination: "/" } };
		if (!query.id) return { redirect: { destination: "/" } };

		const workspaceId = parseInt(query.id as string);
		const user = await prisma.user.findFirst({
			where: { userid: BigInt(uid) },
			include: { roles: true },
		});

		if (!user) return { redirect: { destination: "/" } };
		const userrole = user.roles.find((role) => role.workspaceGroupId === workspaceId);
		if (!userrole) return { redirect: { destination: "/" } };
		if (userrole.isOwnerRole) return handler(context);
		if (!permission) return handler(context);
		if (userrole.permissions.includes(permission)) return handler(context);

		return { redirect: { destination: "/" } };
	});
}

/* -----------------------------------------------
   ⚙️ GROUP ROLE SYNCHRONIZATION (optimized)
------------------------------------------------ */

export async function checkGroupRoles(groupID: number) {
	const [rss, existingRoles, config] = await Promise.all([
		noblox.getRoles(groupID).catch(() => []),
		prisma.role.findMany({ where: { workspaceGroupId: groupID } }),
		getConfig("activity", groupID),
	]);

	if (!rss?.length) return;

	const minTrackedRole = config?.role || 0;
	const filteredRanks = rss.filter((r) => r.rank >= minTrackedRole);
	if (!filteredRanks.length) return;

	// Fetch all users in this workspace once
	const allUsers = await prisma.user.findMany({
		include: {
			roles: { where: { workspaceGroupId: groupID } },
			ranks: { where: { workspaceGroupId: groupID } },
		},
	});

	const limit = pLimit(3); // Concurrency limiter for Roblox API calls

	await Promise.all(
		filteredRanks.map((rank) =>
			limit(async () => {
				const members = await noblox.getPlayers(groupID, rank.id).catch(() => []);
				if (!members.length) return;

				const memberIds = new Set(members.map((m) => m.userId));
				const role = existingRoles.find((r) => r.groupRoles?.includes(rank.id));

				// Batch update ranks
				const rankOps = members.map((m) =>
					prisma.rank.upsert({
						where: {
							userId_workspaceGroupId: {
								userId: BigInt(m.userId),
								workspaceGroupId: groupID,
							},
						},
						update: { rankId: BigInt(rank.rank) },
						create: {
							userId: BigInt(m.userId),
							workspaceGroupId: groupID,
							rankId: BigInt(rank.rank),
						},
					})
				);
				await prisma.$transaction(rankOps);

				if (!role) return;

				// Handle role membership syncing
				const updates: any[] = [];

				for (const user of allUsers) {
					const isMember = memberIds.has(Number(user.userid));
					const hasRole = user.roles.some((r) => r.id === role.id);

					if (isMember && !hasRole) {
						// Add role
						updates.push(
							prisma.user.update({
								where: { userid: user.userid },
								data: {
									roles: { connect: { id: role.id } },
									username: members.find((m) => m.userId === Number(user.userid))?.username,
									picture: user.picture || (await getThumbnail(Number(user.userid))),
								},
							})
						);
					} else if (!isMember && hasRole) {
						// Remove role
						updates.push(
							prisma.user.update({
								where: { userid: user.userid },
								data: { roles: { disconnect: { id: role.id } } },
							})
						);
					}
				}

				if (updates.length) await prisma.$transaction(updates);
			})
		)
	);
}

/* -----------------------------------------------
   👤 SINGLE USER SYNC (optimized)
------------------------------------------------ */

export async function checkSpecificUser(userID: number) {
	const workspaces = await prisma.workspace.findMany();

	for (const ws of workspaces) {
		const rankId = await noblox.getRankInGroup(ws.groupId, userID).catch(() => null);
		await prisma.rank.upsert({
			where: {
				userId_workspaceGroupId: {
					userId: BigInt(userID),
					workspaceGroupId: ws.groupId,
				},
			},
			update: { rankId: BigInt(rankId || 0) },
			create: {
				userId: BigInt(userID),
				workspaceGroupId: ws.groupId,
				rankId: BigInt(rankId || 0),
			},
		});

		if (!rankId) continue;
		const rankInfo = await noblox.getRole(ws.groupId, rankId).catch(() => null);
		if (!rankInfo) continue;

		const matchedRole = await prisma.role.findFirst({
			where: {
				workspaceGroupId: ws.groupId,
				groupRoles: { hasSome: [rankInfo.id] },
			},
		});
		if (!matchedRole) continue;

		const user = await prisma.user.findFirst({
			where: { userid: BigInt(userID) },
			include: { roles: { where: { workspaceGroupId: ws.groupId } } },
		});
		if (!user) continue;

		await prisma.$transaction(async (tx) => {
			// Remove outdated workspace role
			if (user.roles.length && user.roles[0].id !== matchedRole.id) {
				await tx.user.update({
					where: { userid: BigInt(userID) },
					data: { roles: { disconnect: { id: user.roles[0].id } } },
				});
			}

			// Assign correct role
			await tx.user.update({
				where: { userid: BigInt(userID) },
				data: { roles: { connect: { id: matchedRole.id } } },
			});
		});
	}
}
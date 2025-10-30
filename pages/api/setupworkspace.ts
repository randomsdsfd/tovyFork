// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { getUsername, getThumbnail, getDisplayName } from '@/utils/userinfoEngine';
import { User } from '@/types/index.d';
import prisma from '@/utils/database';
import * as bcrypt from 'bcrypt';
import { withSessionRoute } from '@/lib/withSession';
import { setRegistry } from '@/utils/registryManager';
import { getRobloxUserId } from '@/utils/roblox';

type Data = {
  success: boolean;
  error?: string;
  user?: User;
};

type RequestBody = {
  groupid: number;
  username: string;
  password: string;
  color?: string;
};

export default withSessionRoute(handler);

export async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = req.body as Partial<RequestBody>;

  if (!body.username || !body.groupid || !body.password)
    return res.status(400).json({ success: false, error: 'Missing required fields' });

  // 🧠 Get Roblox user ID
  const userid = await getRobloxUserId(body.username, req.headers.origin).catch(() => null);
  if (!userid)
    return res.status(404).json({ success: false, error: 'Username not found' });

  // 🧱 Ensure only one workspace exists
  const workspaceCount = await prisma.workspace.count();
  if (workspaceCount > 0)
    return res.status(403).json({ success: false, error: 'Workspace already exists' });

  // 🧩 Use transaction for safety (atomic)
  const groupId = parseInt(String(body.groupid));

  const [workspace, role, user] = await prisma.$transaction([
    prisma.workspace.create({ data: { groupId } }),
    prisma.role.create({
      data: {
        workspaceGroupId: groupId,
        name: 'Admin',
        isOwnerRole: true,
        permissions: ['admin', 'view_staff_config'],
      },
    }),
    prisma.user.create({
      data: {
        userid,
        info: {
          create: {
            passwordhash: await bcrypt.hash(body.password, 10),
          },
        },
        isOwner: true,
      },
    }),
  ]);

  // Connect role to user
  await prisma.user.update({
    where: { userid },
    data: {
      roles: { connect: { id: role.id } },
    },
  });

  // Create default customization config
  await prisma.config.create({
    data: {
      key: 'customization',
      workspaceGroupId: groupId,
      value: { color: body.color ?? '#4b9cff' },
    },
  });

  // 💾 Save session
  req.session.userid = userid;
  await req.session.save();

  // 🧍 Return user data for client
  const resultUser: User = {
    userId: userid,
    username: await getUsername(userid),
    displayname: await getDisplayName(userid),
    thumbnail: await getThumbnail(userid),
  };

  await setRegistry(req.headers.host as string);

  res.status(200).json({ success: true, user: resultUser });
}
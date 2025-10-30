import { WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import prisma, { Session, SessionType } from '@/utils/database';
import { getThumbnail, getUsername } from './userinfoEngine';

async function formatMessage(session: Session & { sessionType: SessionType }, text: string) {
  const replacements = {
    "%TYPE%": session.sessionType.name,
    "%HOST%": await getUsername(session.ownerId!)
  };
  return text.replace(/%\w+%/g, (m) => replacements[m] ?? m);
}

function buildEmbed(session: Session & { sessionType: SessionType }, opts: { ended?: boolean; hostName: string; hostThumb: string; }) {
  const embed = new EmbedBuilder()
    .setTitle(opts.ended
      ? `${session.sessionType.name} Session Ended`
      : `New ${session.sessionType.name} Session`)
    .setColor(opts.ended ? "Red" : "Green")
    .setTimestamp()
    .setAuthor({ name: opts.hostName, iconURL: opts.hostThumb, url: `https://www.roblox.com/users/${session.ownerId}/profile` })
    .setFooter({ text: "Tovy Sessions" });

  return embed;
}

export async function sendWebhook(session: Session & { sessionType: SessionType }) {
  if (!session.sessionType.webhookEnabled || !session.sessionType.webhookUrl) return;

  const webhook = new WebhookClient({ url: session.sessionType.webhookUrl });
  const hostName = await getUsername(session.ownerId!);
  const hostThumb = await getThumbnail(session.ownerId!);

  const embed = buildEmbed(session, { hostName, hostThumb })
    .setDescription(await formatMessage(session,
      session.sessionType.webhookBody ||
      `A %TYPE% is now being hosted by %HOST%! Join below to attend.`));

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (session.sessionType.gameId) {
    const url = `https://www.roblox.com/games/${session.sessionType.gameId}/-`;
    embed.addFields({ name: "Game Link", value: url, inline: true });
    row.addComponents(new ButtonBuilder().setURL(url).setLabel("Join Game").setStyle(ButtonStyle.Link));
  }

  try {
    const msg = await webhook.send({
      embeds: [embed],
      components: row.components.length ? [row] : undefined,
      content: session.sessionType.webhookPing ?? null
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { messageId: msg.id }
    });
  } catch (err) {
    console.error("Failed to send session webhook:", err);
  }
}

export async function deleteWebhook(session: Session & { sessionType: SessionType }) {
  if (!session.sessionType.webhookEnabled || !session.sessionType.webhookUrl || !session.messageId) return;

  const webhook = new WebhookClient({ url: session.sessionType.webhookUrl });
  const hostName = await getUsername(session.ownerId!);
  const hostThumb = await getThumbnail(session.ownerId!);

  const embed = buildEmbed(session, { ended: true, hostName, hostThumb })
    .setDescription(await formatMessage(session, `The %TYPE% session hosted by %HOST% has ended.`));

  try {
    await webhook.editMessage(session.messageId, {
      embeds: [embed],
      components: [],
      content: null
    });
  } catch (err) {
    console.error("Failed to delete session webhook:", err);
  }
}

module.exports = {
    name: 'groupinfo',
    aliases: ['ginfo', 'group', 'info'],
    description: 'Show group information',
    
    async execute(sock, m) {
        try {
            // Check if it's a group
            if (!m.isGroup) {
                await m.react('❌');
                return await m.reply('❌ This command only works in groups!');
            }
            
            await m.react('📊');
            
            const groupMetadata = await sock.groupMetadata(m.from);
            
            // Get group settings
            const isAnnouncement = groupMetadata.announce;
            const isLocked = groupMetadata.restrict;
            
            // Count participants
            const totalMembers = groupMetadata.participants.length;
            const admins = groupMetadata.participants.filter(p => p.admin).length;
            const members = totalMembers - admins;
            
            // Get creation date
            const creationDate = new Date(groupMetadata.creation * 1000);
            
            // Get group description
            const description = groupMetadata.desc || 'No description';
            
            // Format group info
            const groupInfo = 
`*┏───〘 👥 GROUP INFO 〙───⊷*
*┃* *Group Name:* ${groupMetadata.subject}
*┃* *Group ID:* ${groupMetadata.id}
*┃* *Total Members:* ${totalMembers}
*┃* *Admins:* ${admins}
*┃* *Members:* ${members}
*┃* *Created:* ${creationDate.toLocaleDateString()}
*┃* *Status:* ${isAnnouncement ? 'Announcement Only 🔒' : 'Open 🔓'}
*┃* *Participants:* ${isLocked ? 'Locked 🔒' : 'Open 🔓'}
*┗──────────────⊷*

*📝 Description:*
${description}

*👑 Group Admins:*
${groupMetadata.participants
    .filter(p => p.admin)
    .slice(0, 10)
    .map(p => `• ${p.notify || p.id.split('@')[0]}`)
    .join('\n')}
${admins > 10 ? `... and ${admins - 10} more admins` : ''}

📅 *Last Updated:* ${new Date().toLocaleString()}`;

            await m.reply(groupInfo);
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Groupinfo error:', err);
            await m.react('❌');
            await m.reply('❌ Failed to get group information.');
        }
    }
};

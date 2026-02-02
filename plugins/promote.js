module.exports = {
    name: 'promote',
    aliases: ['admin', 'makeadmin'],
    description: 'Promote a user to group admin (Admin only)',
    
    async execute(sock, m, args) {
        try {
            // Check if it's a group
            if (!m.isGroup) {
                await m.react('❌');
                return await m.reply('❌ This command only works in groups!');
            }
            
            // Check if sender is admin
            const groupMetadata = await sock.groupMetadata(m.from);
            const participant = m.isGroup ? m.sender : m.from;
            const senderAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
            
            if (!senderAdmin) {
                await m.react('⛔');
                return await m.reply('⛔ You need to be a group admin to use this command!');
            }
            
            // Check if bot is admin
            const botId = sock.user.id;
            const botAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;
            
            if (!botAdmin) {
                await m.react('🤖');
                return await m.reply('🤖 I need to be a group admin to promote users!');
            }
            
            // Get target user
            let targetUser;
            
            if (m.quoted) {
                // If replied to a message
                targetUser = m.quoted.sender;
            } else if (args.length > 0) {
                // Check if it's a mention
                if (m.mentionedJid && m.mentionedJid.length > 0) {
                    targetUser = m.mentionedJid[0];
                } else {
                    // Check if it's a phone number
                    let phoneNumber = args[0];
                    phoneNumber = phoneNumber.replace(/\D/g, '');
                    
                    if (phoneNumber.length >= 10) {
                        targetUser = phoneNumber + '@s.whatsapp.net';
                    } else {
                        await m.react('❓');
                        return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .promote @user');
                    }
                }
            } else {
                await m.react('❓');
                return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .promote @user');
            }
            
            // Check if user is in group
            const targetInGroup = groupMetadata.participants.find(p => p.id === targetUser);
            if (!targetInGroup) {
                await m.react('👤');
                return await m.reply('👤 This user is not in the group!');
            }
            
            // Check if already admin
            if (targetInGroup.admin) {
                await m.react('👑');
                return await m.reply('👑 This user is already a group admin!');
            }
            
            // Send reaction
            await m.react('⬆️');
            
            // Promote user
            await sock.groupParticipantsUpdate(m.from, [targetUser], 'promote');
            
            // Get user info
            const userPushName = targetInGroup.notify || targetUser.split('@')[0];
            
            await m.reply(`✅ *User Promoted to Admin!*\n\n👤 *User:* ${userPushName}\n🎯 *Role:* Group Administrator\n👑 *Promoted by:* ${m.pushName}\n📅 *Time:* ${new Date().toLocaleTimeString()}`);
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Promote command error:', err);
            await m.react('❌');
            await m.reply('❌ Failed to promote user. Please try again.');
        }
    }
};

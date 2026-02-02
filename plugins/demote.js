module.exports = {
    name: 'demote',
    aliases: ['removeadmin', 'unadmin'],
    description: 'Demote a user from admin (Admin only)',
    
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
                return await m.reply('🤖 I need to be a group admin to demote users!');
            }
            
            // Get target user
            let targetUser;
            
            if (m.quoted) {
                targetUser = m.quoted.sender;
            } else if (args.length > 0) {
                if (m.mentionedJid && m.mentionedJid.length > 0) {
                    targetUser = m.mentionedJid[0];
                } else {
                    let phoneNumber = args[0];
                    phoneNumber = phoneNumber.replace(/\D/g, '');
                    
                    if (phoneNumber.length >= 10) {
                        targetUser = phoneNumber + '@s.whatsapp.net';
                    } else {
                        await m.react('❓');
                        return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .demote @user');
                    }
                }
            } else {
                await m.react('❓');
                return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .demote @user');
            }
            
            // Check if user is in group
            const targetInGroup = groupMetadata.participants.find(p => p.id === targetUser);
            if (!targetInGroup) {
                await m.react('👤');
                return await m.reply('👤 This user is not in the group!');
            }
            
            // Check if not admin
            if (!targetInGroup.admin) {
                await m.react('👤');
                return await m.reply('👤 This user is not a group admin!');
            }
            
            // Check if trying to demote self
            if (targetUser === m.sender) {
                await m.react('😅');
                return await m.reply('😅 You cannot demote yourself!');
            }
            
            // Send reaction
            await m.react('⬇️');
            
            // Demote user
            await sock.groupParticipantsUpdate(m.from, [targetUser], 'demote');
            
            const userPushName = targetInGroup.notify || targetUser.split('@')[0];
            
            await m.reply(`✅ *User Demoted from Admin!*\n\n👤 *User:* ${userPushName}\n🎯 *Role:* Member\n👑 *Demoted by:* ${m.pushName}\n📅 *Time:* ${new Date().toLocaleTimeString()}`);
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Demote command error:', err);
            await m.react('❌');
            await m.reply('❌ Failed to demote user. Please try again.');
        }
    }
};

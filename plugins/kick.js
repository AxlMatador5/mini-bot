module.exports = {
    name: 'kick',
    aliases: ['remove', 'kickout', 'ban'],
    description: 'Remove a user from the group (Admin only)',
    
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
                return await m.reply('🤖 I need to be a group admin to kick users!');
            }
            
            // Check if user mentioned someone or replied to a message
            let targetUser;
            
            if (m.quoted) {
                // If replied to a message, kick the quoted user
                targetUser = m.quoted.sender;
            } else if (args.length > 0) {
                // Check if it's a mention/tag
                if (m.mentionedJid && m.mentionedJid.length > 0) {
                    targetUser = m.mentionedJid[0];
                } else {
                    // Check if it's a phone number
                    let phoneNumber = args[0];
                    phoneNumber = phoneNumber.replace(/\D/g, '');
                    
                    if (phoneNumber.length >= 10) {
                        // Convert to WhatsApp JID format
                        targetUser = phoneNumber + '@s.whatsapp.net';
                    } else {
                        await m.react('❓');
                        return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .kick @user\nOr reply to a message with .kick');
                    }
                }
            } else {
                await m.react('❓');
                return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .kick @user\nOr reply to a message with .kick');
            }
            
            // Check if trying to kick self
            if (targetUser === m.sender) {
                await m.react('😅');
                return await m.reply('😅 You cannot kick yourself!');
            }
            
            // Check if trying to kick bot
            if (targetUser === sock.user.id) {
                await m.react('🤖');
                return await m.reply('🤖 I cannot kick myself!');
            }
            
            // Check if target user is in the group
            const targetInGroup = groupMetadata.participants.find(p => p.id === targetUser);
            if (!targetInGroup) {
                await m.react('👤');
                return await m.reply('👤 This user is not in the group!');
            }
            
            // Check if target is admin (can't kick admins)
            const targetAdmin = targetInGroup.admin;
            if (targetAdmin) {
                await m.react('⚠️');
                return await m.reply('⚠️ Cannot kick group admins! Use .demote first.');
            }
            
            // Send reaction and confirmation
            await m.react('👢');
            
            // Kick the user
            await sock.groupParticipantsUpdate(m.from, [targetUser], 'remove');
            
            // Get user info for confirmation
            const userPushName = targetInGroup.notify || targetUser.split('@')[0];
            
            await m.reply(`✅ *User Kicked Successfully!*\n\n👤 *User:* ${userPushName}\n🎯 *Action:* Removed from group\n👑 *By:* ${m.pushName}\n📅 *Time:* ${new Date().toLocaleTimeString()}`);
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Kick command error:', err);
            await m.react('❌');
            await m.reply('❌ Failed to kick user. Please try again.');
        }
    }
};

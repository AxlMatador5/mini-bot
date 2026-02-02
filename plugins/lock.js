module.exports = {
    name: 'lock',
    aliases: ['close', 'restrict'],
    description: 'Lock group settings (Admin only)',
    
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
                return await m.reply('🤖 I need to be a group admin to lock the group!');
            }
            
            // Send reaction
            await m.react('🔒');
            
            // Determine what to lock
            const lockType = args[0]?.toLowerCase() || 'all';
            
            let settingsUpdated = [];
            
            // Lock group based on type
            switch(lockType) {
                case 'all':
                    // Lock everything
                    await sock.groupSettingUpdate(m.from, 'announcement');
                    await sock.groupSettingUpdate(m.from, 'locked');
                    settingsUpdated.push('Group set to announcement only');
                    settingsUpdated.push('Group locked (admins only can send messages)');
                    break;
                    
                case 'announcement':
                    // Announcement mode - only admins can send messages
                    await sock.groupSettingUpdate(m.from, 'announcement');
                    settingsUpdated.push('Group set to announcement only (admins can send messages)');
                    break;
                    
                case 'locked':
                    // Lock group - no new participants
                    await sock.groupSettingUpdate(m.from, 'locked');
                    settingsUpdated.push('Group locked (admins only can add participants)');
                    break;
                    
                case 'unlocked':
                    // Unlock group
                    await sock.groupSettingUpdate(m.from, 'unlocked');
                    settingsUpdated.push('Group unlocked (all participants can add others)');
                    break;
                    
                case 'open':
                    // Open group - everyone can send messages
                    await sock.groupSettingUpdate(m.from, 'not_announcement');
                    settingsUpdated.push('Group opened (all participants can send messages)');
                    break;
                    
                default:
                    await m.react('❓');
                    return await m.reply('❓ *Available lock types:*\n• all - Lock everything\n• announcement - Admins only can message\n• locked - No new participants\n• unlocked - Allow new participants\n• open - Everyone can message');
            }
            
            const settingsText = settingsUpdated.map(setting => `• ${setting}`).join('\n');
            
            await m.reply(`✅ *Group Settings Updated!*\n\n🔒 *Action:* Group locked\n📋 *Changes:*\n${settingsText}\n👑 *By:* ${m.pushName}\n📅 *Time:* ${new Date().toLocaleTimeString()}`);
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Lock command error:', err);
            await m.react('❌');
            await m.reply('❌ Failed to lock group. Please try again.');
        }
    }
};

module.exports = {
    name: 'open',
    aliases: ['unlock', 'public'],
    description: 'Open group settings (Admin only)',
    
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
                return await m.reply('🤖 I need to be a group admin to open the group!');
            }
            
            // Send reaction
            await m.react('🔓');
            
            // Determine what to open
            const openType = args[0]?.toLowerCase() || 'all';
            
            let settingsUpdated = [];
            
            switch(openType) {
                case 'all':
                    // Open everything
                    await sock.groupSettingUpdate(m.from, 'not_announcement');
                    await sock.groupSettingUpdate(m.from, 'unlocked');
                    settingsUpdated.push('Group opened (all can send messages)');
                    settingsUpdated.push('Group unlocked (all can add participants)');
                    break;
                    
                case 'messages':
                    // Open messages
                    await sock.groupSettingUpdate(m.from, 'not_announcement');
                    settingsUpdated.push('Group opened (all participants can send messages)');
                    break;
                    
                case 'participants':
                    // Open participants
                    await sock.groupSettingUpdate(m.from, 'unlocked');
                    settingsUpdated.push('Group unlocked (all participants can add others)');
                    break;
                    
                default:
                    await m.react('❓');
                    return await m.reply('❓ *Available open types:*\n• all - Open everything\n• messages - Allow all to message\n• participants - Allow all to add members');
            }
            
            const settingsText = settingsUpdated.map(setting => `• ${setting}`).join('\n');
            
            await m.reply(`✅ *Group Settings Updated!*\n\n🔓 *Action:* Group opened\n📋 *Changes:*\n${settingsText}\n👑 *By:* ${m.pushName}\n📅 *Time:* ${new Date().toLocaleTimeString()}`);
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Open command error:', err);
            await m.react('❌');
            await m.reply('❌ Failed to open group. Please try again.');
        }
    }
};

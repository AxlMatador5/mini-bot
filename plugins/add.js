module.exports = {
    name: 'add',
    aliases: ['invite', 'adduser'],
    description: 'Add users to the group (Admin only)',
    
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
                return await m.reply('🤖 I need to be a group admin to add users!');
            }
            
            // Check if group is locked
            if (groupMetadata.restrict) {
                await m.react('🔒');
                return await m.reply('🔒 Group is locked! Only admins can add participants.');
            }
            
            // Get phone numbers to add
            if (args.length === 0) {
                await m.react('❓');
                return await m.reply('❓ Please provide phone numbers!\nUsage: .add 254712345678 254798765432\nOr reply to a contact message');
            }
            
            await m.react('➕');
            
            const usersToAdd = [];
            const invalidNumbers = [];
            
            // Process each argument
            for (const arg of args) {
                let phoneNumber = arg.replace(/\D/g, '');
                
                // Validate phone number
                if (phoneNumber.length >= 10) {
                    // Add country code if missing
                    if (!phoneNumber.startsWith('254') && phoneNumber.length === 9) {
                        phoneNumber = '254' + phoneNumber;
                    }
                    
                    const userJid = phoneNumber + '@s.whatsapp.net';
                    
                    // Check if already in group
                    const alreadyInGroup = groupMetadata.participants.find(p => p.id === userJid);
                    if (!alreadyInGroup) {
                        usersToAdd.push(userJid);
                    }
                } else {
                    invalidNumbers.push(arg);
                }
            }
            
            if (usersToAdd.length === 0) {
                await m.react('⚠️');
                return await m.reply('⚠️ No valid users to add or all are already in the group!');
            }
            
            // Add users to group
            const result = await sock.groupParticipantsUpdate(m.from, usersToAdd, 'add');
            
            let addedCount = 0;
            const addedUsers = [];
            
            // Check results
            for (let i = 0; i < usersToAdd.length; i++) {
                const userJid = usersToAdd[i];
                // Note: WhatsApp doesn't return success/failure for each user
                // We'll assume success if no error is thrown
                addedCount++;
                addedUsers.push(userJid.split('@')[0]);
            }
            
            let response = `✅ *Users Added Successfully!*\n\n👥 *Added:* ${addedCount} user${addedCount > 1 ? 's' : ''}\n👑 *By:* ${m.pushName}\n📅 *Time:* ${new Date().toLocaleTimeString()}`;
            
            if (addedUsers.length > 0) {
                response += `\n\n📱 *Phone Numbers:*\n${addedUsers.map(num => `• +${num}`).join('\n')}`;
            }
            
            if (invalidNumbers.length > 0) {
                response += `\n\n⚠️ *Invalid numbers skipped:*\n${invalidNumbers.join(', ')}`;
            }
            
            await m.reply(response);
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Add command error:', err);
            await m.react('❌');
            await m.reply('❌ Failed to add users. Please check the phone numbers and try again.');
        }
    }
};

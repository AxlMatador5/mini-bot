module.exports = {
    name: 'kick',
    aliases: ['remove', 'kickout', 'ban'],
    description: 'Remove a user from the group (Admin only)',
    
    async execute(sock, m, args) {
        await this.kickUser(sock, m, args);
    },
    
    async kickUser(sock, m, args) {
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
                        return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .kick @user');
                    }
                }
            } else {
                await m.react('❓');
                return await m.reply('❓ Please mention a user or reply to their message!\nUsage: .kick @user');
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
            
            // Check if target is admin
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

module.exports.promote = async function promote(sock, m, args) {
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
};

module.exports.demote = async function demote(sock, m, args) {
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
};

module.exports.lock = async function lock(sock, m, args) {
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
                await sock.groupSettingUpdate(m.from, 'announcement');
                await sock.groupSettingUpdate(m.from, 'locked');
                settingsUpdated.push('Group set to announcement only');
                settingsUpdated.push('Group locked (admins only can send messages)');
                break;
                
            case 'announcement':
                await sock.groupSettingUpdate(m.from, 'announcement');
                settingsUpdated.push('Group set to announcement only (admins can send messages)');
                break;
                
            case 'locked':
                await sock.groupSettingUpdate(m.from, 'locked');
                settingsUpdated.push('Group locked (admins only can add participants)');
                break;
                
            case 'unlocked':
                await sock.groupSettingUpdate(m.from, 'unlocked');
                settingsUpdated.push('Group unlocked (all participants can add others)');
                break;
                
            case 'open':
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
};

module.exports.open = async function open(sock, m, args) {
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
                await sock.groupSettingUpdate(m.from, 'not_announcement');
                await sock.groupSettingUpdate(m.from, 'unlocked');
                settingsUpdated.push('Group opened (all can send messages)');
                settingsUpdated.push('Group unlocked (all can add participants)');
                break;
                
            case 'messages':
                await sock.groupSettingUpdate(m.from, 'not_announcement');
                settingsUpdated.push('Group opened (all participants can send messages)');
                break;
                
            case 'participants':
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
};

module.exports.groupinfo = async function groupinfo(sock, m) {
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
};

module.exports.add = async function add(sock, m, args) {
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
            return await m.reply('❓ Please provide phone numbers!\nUsage: .add 254712345678 254798765432');
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
};

const { sendInteractiveMessage } = require('gifted-btns');
const axios = require('axios');
const os = require('os');

module.exports = {
    name: 'menu',
    aliases: ['help', 'commands', 'mercedes', 'bot'],
    description: 'Show all available bot commands',

    async execute(sock, m) {
        try {
            // Send initial reaction
            await m.react('📋');
            
            const prefix = global.BOT_PREFIX || '.';
            
            // Get bot statistics
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            const totalMemory = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100;
            const usedMemory = Math.round((os.totalmem() - os.freemem()) / (1024 * 1024 * 1024) * 100) / 100;
            const number = m.sender.split('@')[0] || 'Unknown';
            
            // Categories of commands
            const categories = {
                'core': [
                    `${prefix}ping - Check bot response speed`,
                    `${prefix}uptime - View bot running time`,
                    `${prefix}creator - Contact developer`,
                    `${prefix}menu - Show this menu`,
                    `${prefix}help - Get command help`,
                    `${prefix}alive - Check if bot is online`
                ],
                'utility': [
                    `${prefix}sticker - Create sticker from image`,
                    `${prefix}ocr - Extract text from images`,
                    `${prefix}tts - Convert text to speech`,
                    `${prefix}ai - Chat with AI assistant`,
                    `${prefix}ai-search - Search with AI`,
                    `${prefix}gstatus - Group status info`,
                    `${prefix}speed - Test connection speed`
                ],
                'group': [
                    `${prefix}tagall - Mention all members`,
                    `${prefix}tagme - Tag yourself`,
                    `${prefix}tagname - Tag with custom name`,
                    `${prefix}poll - Create a poll`,
                    `${prefix}couplepp - Show couple profile`,
                    `${prefix}arise - Wake up the bot`
                ],
                'owner': [
                    `${prefix}exec - Execute JavaScript code`,
                    `${prefix}> - Quick code execution`,
                    `${prefix}eval - Evaluate code`
                ]
            };

            // Main menu text with statistics box
            const menuText = 
`*┏───〘 🚗 ᴍᴇʀᴄᴇᴅᴇs ᴍᴇɴᴜ 〙───⊷*
*┃*  *BOT STATISTICS*
*┃* Uptime: ${hours}h ${minutes}m ${seconds}s
*┃* Memory: ${usedMemory}GB / ${totalMemory}GB
*┃* Your Number: ${number}
*┃* Prefix: ${prefix}
*┗──────────────⊷*

*📋 SELECT A CATEGORY:*

🚗 *Core Commands*
🛠️ *Utility Commands*
👥 *Group Commands*
🔧 *Owner Commands*

💡 *Tip:* Use \`${prefix}help <command>\` for details

*🔗 Website:* karenbishop.online
*👨‍💻 Developer:* Marisel

🎯 *German Engineering Excellence*
_Smooth as a Mercedes engine_`;

            const imgUrl = 'https://i.ibb.co/39GRRMX2/img-2m0cfk6r.jpg';
            const author = 'Marisel';
            const botname = 'Mercedes WhatsApp Bot';
            const sourceUrl = 'https://karenbishop.online';

            const thumbnailBuffer = (await axios.get(imgUrl, { responseType: 'arraybuffer' })).data;

            // Send main menu with buttons
            await sendInteractiveMessage(sock, m.from, {
                title: '🚗 MERCEDES BOT',
                text: menuText,
                footer: 'Tap a button below to view commands',
                interactiveButtons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🚗 Core Commands',
                            id: 'menu_core'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🛠️ Utility Commands',
                            id: 'menu_utility'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👥 Group Commands',
                            id: 'menu_group'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🌐 Visit Website',
                            url: sourceUrl
                        })
                    }
                ]
            });

            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Error sending menu:', err);
            try {
                await m.react('❌');
                await m.reply('❌ Failed to load menu. Please try again.');
            } catch (e) {
                console.error('Could not send error:', e);
            }
        }
    },

    // Handle button responses
    async onMessage(sock, m) {
        if (!m.isButtonResponse || !m.buttonId) return;
        
        const prefix = global.BOT_PREFIX || '.';
        
        // Define commands for each category
        const categories = {
            'menu_core': {
                title: '🚗 CORE COMMANDS',
                commands: [
                    `${prefix}ping - Check bot response speed`,
                    `${prefix}uptime - View bot running time`,
                    `${prefix}creator - Contact developer`,
                    `${prefix}menu - Show this menu`,
                    `${prefix}help - Get command help`,
                    `${prefix}alive - Check if bot is online`
                ]
            },
            'menu_utility': {
                title: '🛠️ UTILITY COMMANDS',
                commands: [
                    `${prefix}sticker - Create sticker from image`,
                    `${prefix}ocr - Extract text from images`,
                    `${prefix}tts - Convert text to speech`,
                    `${prefix}ai - Chat with AI assistant`,
                    `${prefix}ai-search - Search with AI`,
                    `${prefix}gstatus - Group status info`,
                    `${prefix}speed - Test connection speed`
                ]
            },
            'menu_group': {
                title: '👥 GROUP COMMANDS',
                commands: [
                    `${prefix}tagall - Mention all members`,
                    `${prefix}tagme - Tag yourself`,
                    `${prefix}tagname - Tag with custom name`,
                    `${prefix}poll - Create a poll`,
                    `${prefix}couplepp - Show couple profile`,
                    `${prefix}arise - Wake up the bot`
                ]
            }
        };

        const category = categories[m.buttonId];
        if (!category) return;

        // Create box-style menu for the selected category
        const categoryText = 
`*┏───〘 ${category.title} 〙───⊷*
${category.commands.map(cmd => `*┃* ${cmd}`).join('\n')}
*┗──────────────⊷*

💡 *Example:* \`${prefix}ping\`
📚 *Help:* \`${prefix}help <command>\`

🔙 *Tap Back to return to main menu*`;

        try {
            await sendInteractiveMessage(sock, m.from, {
                title: category.title,
                text: categoryText,
                footer: 'Mercedes Bot | Premium Commands',
                interactiveButtons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Back to Main Menu',
                            id: 'menu_main'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🚗 View Core Commands',
                            id: 'menu_core'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🛠️ View Utility Commands',
                            id: 'menu_utility'
                        })
                    }
                ]
            });
        } catch (err) {
            console.error('Error sending category menu:', err);
        }
    }
};

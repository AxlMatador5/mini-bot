const { sendInteractiveMessage } = require('gifted-btns');
const axios = require('axios');
const os = require('os');

module.exports = {
    name: 'menu',
    aliases: ['help', 'commands', 'mercedes', 'bot'],
    description: 'Show all available bot commands',

    async execute(sock, m) {
        try {
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
            
            const menuText = 
`*┏───〘 🚗 ᴍᴇʀᴄᴇᴅᴇs ᴍᴇɴᴜ 〙───⊷*
*┃*  *Bot name: Mercedes*
*┃* Uptime: ${hours}h ${minutes}m ${seconds}s
*┃* Memory: ${usedMemory}GB / ${totalMemory}GB
*┃* Your Number: ${number}
*┃* Prefix: ${prefix}
*┗──────────────⊷*

*┏───〘 🚗 CORE COMMANDS 〙───⊷*
*┃* ᪣ ${prefix}ping
*┃* ᪣ ${prefix}uptime
*┃* ᪣ ${prefix}creator
*┃* ᪣ ${prefix}menu
*┃* ᪣ ${prefix}help
*┃* ᪣ ${prefix}alive
*┗──────────────⊷*

*┏───〘 🛠️ UTILITY COMMANDS 〙───⊷*
*┃* ᪣ ${prefix}sticker
*┃* ᪣ ${prefix}ocr
*┃* ᪣ ${prefix}tts
*┃* ᪣ ${prefix}ai
*┃* ᪣ ${prefix}ai-search
*┃* ᪣ ${prefix}gstatus
*┃* ᪣ ${prefix}speed
*┗──────────────⊷*

*┏───〘 👥 GROUP COMMANDS 〙───⊷*
*┃* ᪣ ${prefix}tagall
*┃* ᪣ ${prefix}tagme
*┃* ᪣ ${prefix}tagname
*┃* ᪣ ${prefix}poll
*┃* ᪣ ${prefix}couplepp
*┃* ᪣ ${prefix}arise
*┃* ᪣ ${prefix}tagall1
*┃* ᪣ ${prefix}kick
*┃* ᪣ ${prefix}promote
*┃* ᪣ ${prefix}demote
*┃* ᪣ ${prefix}lock
*┃* ᪣ ${prefix}open
*┃* ᪣ ${prefix}groupinfo
*┃* ᪣ ${prefix}add
*┗──────────────⊷*

*┏───〘 🔧 OWNER COMMANDS 〙───⊷*
*┃* ᪣ ${prefix}exec
*┃* ᪣ ${prefix}>
*┃* ᪣ ${prefix}eval
*┗──────────────⊷*

>made by Marisel

💡 *Try these quick actions:*`;

            const imgUrl = 'https://files.catbox.moe/s2ctl7.jpg';
            const author = 'Marisel';
            const botname = 'Mercedes';
            const sourceUrl = 'https://karenbishop.online';

            let thumbnailBuffer;
            try {
                thumbnailBuffer = (await axios.get(imgUrl, { responseType: 'arraybuffer' })).data;
            } catch {
                thumbnailBuffer = Buffer.from('');
            }

            // Send with interactive buttons
            await sendInteractiveMessage(sock, m.from, {
                title: 'MERCEDES BOT MENU',
                text: menuText,
                footer: 'Premium WhatsApp Automation',
                interactiveButtons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Alive',
                            id: 'cmd_alive'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Ping',
                            id: 'cmd_ping'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Visit Website',
                            url: sourceUrl
                        })
                    }
                ]
            });

            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Error:', err);
            await m.react('❌');
        }
    }
};

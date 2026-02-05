const axios = require('axios');
const { sendInteractiveMessage } = require('gifted-btns');
const process = require('process');

module.exports = {
    name: 'ping',
    aliases: ['speed', 'latency'],
    description: 'Check bot response speed and latency',

    async execute(sock, m) {
        try {
            // Send initial reaction
            await m.react('⏱️');
            
            // Calculate ping/latency
            const start = Date.now();
            const latency = Date.now() - start;
            
            // Get server uptime
            const uptime = process.uptime();
            const days = Math.floor(uptime / (3600 * 24));
            const hours = Math.floor((uptime % (3600 * 24)) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            // Format uptime nicely
            let formattedUptime = '';
            if (days > 0) formattedUptime += `${days}d `;
            if (hours > 0) formattedUptime += `${hours}h `;
            if (minutes > 0) formattedUptime += `${minutes}m `;
            formattedUptime += `${seconds}s`;
            
            // Get image
            const imgUrl = 'https://files.catbox.moe/s2ctl7.jpg';
            let thumbnailBuffer;
            
            try {
                const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
                thumbnailBuffer = response.data;
            } catch (imgError) {
                console.log('Could not load image, using default thumbnail');
                thumbnailBuffer = null;
            }
            
            // Create message with image similar to original
            const info = `*Ping: ${latency} ms*\n` +
                         `_Server running smoothly_`;
            
            // First send the image message
            await sock.sendMessage(m.from, {
                image: thumbnailBuffer,
                caption: info,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    externalAdReply: {
                        title: 'marisel',
                        body: 'Mercedes Bot',
                        thumbnail: thumbnailBuffer,
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl: 'karenbishop.online'
                    }
                }
            });
            
            // Then send interactive buttons
            await sendInteractiveMessage(sock, m.from, {
                title: 'ACTIONS',
                text: 'Select an option below:',
                footer: '| Mercedes Bot Performance',
                interactiveButtons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Visit Channel',
                            url: 'https://whatsapp.com/channel/0029Vajvy2kEwEjwAKP4SI0x'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'More Info',
                            'id: `${global.BOT_PREFIX}menu` 
                        })
                    }
                ]
            });
            
            // Send success reaction
            await m.react('✅');
            
        } catch (err) {
            console.error('Error in ping command:', err);
            try {
                await m.react('❌');
                await m.reply('❌ Error checking ping!');
            } catch (e) {
                console.error('Could not send error:', e);
            }
        }
    }
};

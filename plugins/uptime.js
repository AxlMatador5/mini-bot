const { sendInteractiveMessage } = require('gifted-btns');
const process = require('process');

module.exports = {
    name: 'uptime',
    aliases: ['up', 'runtime', 'botuptime'],
    description: 'Check how long the bot has been running.',

    async execute(sock, m) {
        try {
            // Send initial reaction
            await m.react('⏱️');
            
            const uptime = process.uptime();

            const days = Math.floor(uptime / (3600 * 24));
            const hours = Math.floor((uptime % (3600 * 24)) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            // Format time nicely
            let formattedTime = '';
            if (days > 0) formattedTime += `${days} day${days > 1 ? 's' : ''} `;
            if (hours > 0) formattedTime += `${hours} hour${hours > 1 ? 's' : ''} `;
            if (minutes > 0) formattedTime += `${minutes} minute${minutes > 1 ? 's' : ''} `;
            formattedTime += `${seconds} second${seconds !== 1 ? 's' : ''}`;

            // Calculate uptime details
            const totalMinutes = Math.floor(uptime / 60);
            const totalHours = Math.floor(uptime / 3600);
            
            const text = `*Performance*\n\n` +
                         `*Running for:* ${formattedTime}\n` +
                         `*Server Time:* ${new Date().toLocaleTimeString()}\n` +
                         `*Date:* ${new Date().toLocaleDateString()}\n\n`;

            await sendInteractiveMessage(sock, m.from, {
                title: 'UPTIME STATUS',
                text: text,
                footer: '| made by marisel',
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
                            display_text: 'Refresh',
                            id: 'refresh_uptime'
                        })
                    }
                ]
            });

            // Send success reaction
            await m.react('✅');
            
        } catch (err) {
            console.error('Error in uptime command:', err);
            try {
                await m.react('❌');
                await m.reply('❌ Error checking uptime!');
            } catch (e) {
                console.error('Could not send error:', e);
            }
        }
    }
};

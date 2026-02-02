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
            
            const text = `*Mercedes Bot Uptime*\n\n` +
                         `*Running for:* ${formattedTime}\n` +
                         `*Total Hours:* ${totalHours}h\n` +
                         `*Total Minutes:* ${totalMinutes}m\n` +
                         `*Server Time:* ${new Date().toLocaleTimeString()}\n` +
                         `*Date:* ${new Date().toLocaleDateString()}\n\n` +
                         `✨ _Keep the Fire Bunning!_`;

            await sendInteractiveMessage(sock, m.from, {
                title: 'MERCEDES BOT UPTIME',
                text: text,
                footer: '| made by marisel',
                interactiveButtons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Visit Website',
                            url: 'https://karenbishop.online'
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

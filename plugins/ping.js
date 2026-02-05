const axios = require('axios');

module.exports = {
    name: 'ping',
    aliases: ['speed', 'latency'],
    description: 'Check bot response speed',

    async execute(sock, m, args) {
        try {
            // Send reaction first
            await m.react('⏱️');
            
            const start = Date.now();
            await m.reply('Pinging...');
            const latency = Date.now() - start;
            const info = `> Pong: ${latency} ms`;
            const imgUrl = 'https://files.catbox.moe/s2ctl7.jpg';
            const author = 'marisel';
            const botname = 'Mercedes';
            const sourceUrl = 'karenbishop.online';

            const thumbnailBuffer = (await axios.get(imgUrl, { responseType: 'arraybuffer' })).data;

            await m.send(info, {
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    externalAdReply: {
                        title: author,
                        body: botname,
                        thumbnail: thumbnailBuffer,
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl
                    }
                }
            });
            
            // Send success reaction after completion
            await m.react('✅');
            
        } catch (err) {
            console.error('Error sending ping info:', err);
            // Send error reaction if something goes wrong
            try {
                await m.react('❌');
            } catch (e) {
                console.error('Could not send error reaction:', e);
            }
        }
    }
};

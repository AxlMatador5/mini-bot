module.exports = {
    name: 'groupstatus',
    description: 'Send group status (image, video, audio, or text)',
    aliases: ['gstatus'],
    tags: ['group'],
    command: /^\.?(groupstatus|gstatus)$/i,

    async execute(sock, m, args) {
        try {
            const owners = [
                '254740007567@lid',
                '233533763772@s.whatsapp.net',
                '132779283087413@lid'
            ];

            const isOwner = owners.includes(m.sender);
            if (!isOwner) return m.reply('❌ Owner only command.');
            if (!m.isGroup) return m.reply('❌ Group only command.');

            const groupId = m.from;

            if (!m.quoted) {
                if (!args.length) return m.reply('❌ Reply to media or provide text.');

                const text = args.join(' ');

                await sock.sendMessage(groupId, {
                    groupStatusMessage: {
                        text,
                        backgroundColor: '#25D366',
                        font: 1
                    }
                });

                return m.reply('✅ Text group status sent!');
            }

            const targetMsg = m.quoted;
            let mediaBuffer, caption;

            if (targetMsg.message?.imageMessage) {
                mediaBuffer = await targetMsg.download();
                caption = targetMsg.message.imageMessage.caption || '';

                await sock.sendMessage(groupId, {
                    groupStatusMessage: {
                        image: mediaBuffer,
                        caption
                    }
                });

                return m.reply('✅ Image group status sent!');
            }

            if (targetMsg.message?.videoMessage) {
                mediaBuffer = await targetMsg.download();
                caption = targetMsg.message.videoMessage.caption || '';

                await sock.sendMessage(groupId, {
                    groupStatusMessage: {
                        video: mediaBuffer,
                        caption
                    }
                });

                return m.reply('✅ Video group status sent!');
            }

            if (targetMsg.message?.audioMessage) {
                mediaBuffer = await targetMsg.download();

                await sock.sendMessage(groupId, {
                    groupStatusMessage: {
                        audio: mediaBuffer,
                        mimetype: targetMsg.message.audioMessage.mimetype || 'audio/mp4',
                        ptt: targetMsg.message.audioMessage.ptt || false
                    }
                });

                return m.reply('✅ Audio group status sent!');
            }

            m.reply('❌ The replied message does not contain supported media.');
        } catch (err) {
            console.error('GroupStatus Error:', err);
            m.reply('❌ Failed to send group status.');
        }
    }
};

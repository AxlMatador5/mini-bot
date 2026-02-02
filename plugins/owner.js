const { sendInteractiveMessage } = require('gifted-btns');

module.exports = {
    name: 'creator',
    description: 'Creator/Owner contacts',
    aliases: ['owner', 'dev', 'marisel', 'support'],
    tags: ['main'],

    async execute(sock, m) {
        try {
            await m.react('👑');
            
            const creator = {
                name: 'Marisel',
                phone: '254740007567',
                formattedPhone: '+254 740 007 567',
                role: 'Developer',
                email: 'pantzaid@gmail.com',
                website: 'karenbishop.online',
                github: 'github.com/betingrich4',
                message: 'Hello Marisel, I came from your Mercedes WhatsApp Bot! Need help with:'
            };
            
            const waLink = `https://wa.me/${creator.phone}?text=${encodeURIComponent(creator.message)}`;
            const emailLink = `mailto:${creator.email}?subject=Mercedes Bot Support`;
            
            const text = `*MERCEDES BOT CREATOR*\n\n` +
                         `*Bot:* Mercedes WhatsApp Bot\n` +
                         `*Developer:* ${creator.name}\n` +
                         `*Phone:* ${creator.formattedPhone}\n` +
                         `*Email:* ${creator.email}\n` +
                         `*Website:* ${creator.website}\n` +
                         `*GitHub:* ${creator.github}\n\n` +
                         `*Role:* ${creator.role}\n\n` +
                         `_For bot support, customization, or collaborations_\n` +
                         `_Contact via any of the options below:_`;

            await sendInteractiveMessage(sock, m.from, {
                title: 'CONTACT DEVELOPER',
                text: text,
                footer: 'Mercedes Bot | Premium WhatsApp Automation',
                interactiveButtons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Chat Marisel',
                            url: waLink
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Send Email',
                            url: emailLink
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🌐 Visit Website',
                            url: `https://${creator.website}`
                        })
                    }
                ]
            });

            await m.react('✅');
            
        } catch (err) {
            console.error('Creator command error:', err);
            await m.react('❌');
        }
    }
};

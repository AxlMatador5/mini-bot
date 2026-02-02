module.exports = {
    name: 'autoreact',
    description: 'Auto-reacts to messages from owners',

    async execute() {},

    async onMessage(sock, m) {
        try {
            if (!m.body) return;

            const owners = [
                '254740007567@lid',
                '254740007567@s.whatsapp.net'
            ];

            if (owners.includes(m.sender)) {
                await m.react('✨');
            }
        } catch (err) {
            console.error('❌ Auto-react error:', err);
        }
    }
};

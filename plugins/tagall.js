module.exports = {
    name: 'tagall1',
    aliases: ['everyone1'],
    description: 'Tag everyone in the group',

    async execute(sock, m, args = []) {
        if (!m.isGroup) {
            return await sock.sendMessage(m.from, {
                text: 'This command can only be used in groups!'
            });
        }

        const owners = ['254740007567', '233533763772'];
        const senderId = m.sender.split('@')[0];

        if (!owners.includes(senderId)) {
            const groupMetadata = await sock.groupMetadata(m.from);
            const adminIds = groupMetadata.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id.split('@')[0]);

            if (!adminIds.includes(senderId)) {
                return await sock.sendMessage(m.from, {
                    text: 'Only group admins or owners can use this command!'
                });
            }
        }

        const jid = m.from;
        const groupMetadata = await sock.groupMetadata(jid);

        const subject = args.length ? args.join(' ') : 'everyone';

        await sock.sendMessage(jid, {
            text: '@' + jid,
            contextInfo: {
                mentionedJid: groupMetadata.participants.map(x => x.id),
                groupMentions: [
                    {
                        groupJid: jid,
                        groupSubject: subject
                    }
                ]
            }
        });
    }
};

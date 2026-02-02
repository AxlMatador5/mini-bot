const yts = require('yt-search');

module.exports = {
    name: 'ytsearch',
    description: 'Search for a YouTube video',
    aliases: ['youtube', 'pay'],
    tags: ['search', 'youtube'],
    command: /^\.?(ytsearch|youtube|yt)/i,

    async execute(sock, m, args) {
        try {
            if (!args[0]) {
                return m.reply('Usage: .ytsearch <search query>\nExample: .ytsearch lo-fi music');
            }

            const query = args.join(' ');

            const results = await yts(query);

            if (!results || !results.videos || results.videos.length === 0) {
                return m.reply('No results found on YouTube.');
            }

            const video = results.videos[0];

            const replyMessage = `
🎬 *${video.title}*
📌 Link: ${video.url}
⏱ Duration: ${video.timestamp}
👁 Views: ${video.views.toLocaleString()}
📅 Uploaded: ${video.ago}
🎥 Channel: ${video.author.name}
`;

            await sock.sendMessage(m.from, {
                image: { url: video.thumbnail },
                caption: replyMessage
            });

        } catch (err) {
            console.error('YouTube Search Error:', err);
            m.reply('Failed to search YouTube. Please try again later.');
        }
    }
};

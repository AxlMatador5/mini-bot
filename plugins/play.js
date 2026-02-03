const yts = require('yt-search');
const { sendInteractiveMessage } = require('gifted-btns');
const axios = require('axios');

module.exports = {
    name: 'play',
    description: 'Search and download YouTube audio/video',
    aliases: ['music', 'song', 'download'],
    tags: ['music', 'download', 'youtube'],
    command: /^\.?(play|music|song|dl)/i,

    async execute(sock, m, args) {
        try {
            if (!args[0]) {
                return m.reply('Usage: .play <song name>\nExample: .play Justin Bieber');
            }

            const query = args.join(' ');
            
            // Send searching indicator
            await m.react('🔍');

            // Search YouTube
            const results = await yts(query);
            
            if (!results || !results.videos || results.videos.length === 0) {
                await m.react('❌');
                return m.reply('No results found on YouTube.');
            }

            const video = results.videos[0];
            const videoId = video.videoId;

            // Get download links from API
            const apiUrl = `https://api.malvin.gleeze.com/download/youtube?id=${videoId}`;
            let audioUrl = null;
            let videoUrl = null;
            let quality = '';

            try {
                const response = await axios.get(apiUrl);
                const data = response.data;

                // Extract audio and video URLs
                if (data.formats) {
                    // Find best audio (usually highest quality)
                    const audioFormats = data.formats.filter(f => 
                        f.mimeType && f.mimeType.includes('audio/mp4') && f.hasAudio && !f.hasVideo
                    );
                    if (audioFormats.length > 0) {
                        audioUrl = audioFormats[0].url;
                    }

                    // Find best video with audio (mp4)
                    const videoFormats = data.formats.filter(f => 
                        f.mimeType && f.mimeType.includes('video/mp4') && f.hasAudio && f.hasVideo
                    );
                    
                    // Sort by quality/bitrate
                    videoFormats.sort((a, b) => {
                        const aQuality = parseInt(a.qualityLabel?.replace('p', '') || '0');
                        const bQuality = parseInt(b.qualityLabel?.replace('p', '') || '0');
                        return bQuality - aQuality;
                    });

                    if (videoFormats.length > 0) {
                        videoUrl = videoFormats[0].url;
                        quality = videoFormats[0].qualityLabel || '';
                    }
                }

                // Fallback if specific formats not found
                if (!audioUrl && data.url) {
                    audioUrl = data.url;
                }
                if (!videoUrl && data.url) {
                    videoUrl = data.url;
                }

            } catch (apiError) {
                console.error('API Error:', apiError);
            }

            // Prepare buttons
            const buttons = [];

            if (audioUrl) {
                buttons.push({
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '🎵 Download Audio',
                        url: audioUrl
                    })
                });
            }

            if (videoUrl) {
                buttons.push({
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: quality ? `🎬 Download Video (${quality})` : '🎬 Download Video',
                        url: videoUrl
                    })
                });
            }

            // Add search button
            buttons.push({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🔍 Search Again',
                    id: 'search_again'
                })
            });

            // Prepare message text
            const messageText = `
🎵 *${video.title}*
👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${video.timestamp}
👁 *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago}
🔗 *YouTube:* ${video.url}

*Choose download option below:*
${!audioUrl && !videoUrl ? '⚠️ Could not fetch download links. Try again later.' : ''}
            `.trim();

            // Send interactive message
            await sendInteractiveMessage(sock, m.from, {
                title: '🎶 YouTube Downloader',
                image: video.thumbnail,
                text: messageText,
                footer: 'Select your preferred format',
                interactiveButtons: buttons
            });

            await m.react('✅');

        } catch (err) {
            console.error('Play Command Error:', err);
            try {
                await m.react('❌');
                await m.reply('❌ Failed to process your request. Please try again.');
            } catch (e) {
                console.error('Could not send error:', e);
            }
        }
    },

    // Handle quick reply button interactions
    async handleInteraction(sock, m, buttonId) {
        if (buttonId === 'search_again') {
            await m.reply('🔍 Send another song name to search!');
        }
    }
};

/**
 * Serialize Message - Multi-Session Version
 * Created By ABZTECH
 * Follow https://github.com/abrahamdw882
 * Whatsapp : https://whatsapp.com/channel/0029VaMGgVL3WHTNkhzHik3c
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys'); 
const fs = require('fs');
const path = require('path');

// Cache for group metadata to reduce API calls
const groupMetadataCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Get group metadata with caching
 */
async function getGroupMetadata(sock, groupJid) {
    if (!groupJid.endsWith('@g.us')) return null;
    
    const cacheKey = `${sock.user.id}_${groupJid}`;
    const cached = groupMetadataCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.metadata;
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        groupMetadataCache.set(cacheKey, {
            metadata,
            timestamp: Date.now()
        });
        return metadata;
    } catch (error) {
        console.error('Error fetching group metadata:', error.message);
        return null;
    }
}

/**
 * Clear old cache entries
 */
function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of groupMetadataCache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
            groupMetadataCache.delete(key);
        }
    }
}

// Run cache cleanup every 10 minutes
setInterval(cleanupCache, 10 * 60 * 1000);

/**
 * Extract message body from different message types
 */
function extractMessageBody(msg) {
    if (!msg.message) return '';
    
    // Handle interactive button responses
    if (msg.message?.interactiveResponseMessage) {
        return msg.message.interactiveResponseMessage.buttonId || 
               msg.message.interactiveResponseMessage?.body?.text || 
               '';
    }
    
    // Handle view once messages
    if (msg.message?.viewOnceMessage?.message) {
        const viewOnceMsg = msg.message.viewOnceMessage.message;
        const viewOnceType = Object.keys(viewOnceMsg)[0];
        
        if (viewOnceType === 'imageMessage') {
            return viewOnceMsg.imageMessage?.caption || '';
        } else if (viewOnceType === 'videoMessage') {
            return viewOnceMsg.videoMessage?.caption || '';
        }
    }
    
    // Handle view once v2 messages
    if (msg.message?.viewOnceMessageV2?.message) {
        const viewOnceMsg = msg.message.viewOnceMessageV2.message;
        const viewOnceType = Object.keys(viewOnceMsg)[0];
        
        if (viewOnceType === 'imageMessage') {
            return viewOnceMsg.imageMessage?.caption || '';
        } else if (viewOnceType === 'videoMessage') {
            return viewOnceMsg.videoMessage?.caption || '';
        }
    }
    
    // Handle normal message types
    if (msg.message?.conversation) {
        return msg.message.conversation;
    }
    if (msg.message?.extendedTextMessage?.text) {
        return msg.message.extendedTextMessage.text;
    }
    if (msg.message?.imageMessage?.caption) {
        return msg.message.imageMessage.caption;
    }
    if (msg.message?.videoMessage?.caption) {
        return msg.message.videoMessage.caption;
    }
    if (msg.message?.documentMessage?.caption) {
        return msg.message.documentMessage.caption;
    }
    if (msg.message?.audioMessage?.caption) {
        return msg.message.audioMessage.caption;
    }
    if (msg.message?.buttonsResponseMessage?.selectedButtonId) {
        return msg.message.buttonsResponseMessage.selectedButtonId;
    }
    if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return msg.message.listResponseMessage.singleSelectReply.selectedRowId;
    }
    if (msg.message?.templateButtonReplyMessage?.selectedId) {
        return msg.message.templateButtonReplyMessage.selectedId;
    }
    if (msg.message?.liveLocationMessage) {
        return msg.message.liveLocationMessage?.caption || '';
    }
    if (msg.message?.stickerMessage) {
        return msg.message.stickerMessage?.caption || '';
    }
    if (msg.message?.contactMessage) {
        return msg.message.contactMessage?.displayName || '';
    }
    if (msg.message?.locationMessage) {
        return msg.message.locationMessage?.caption || '';
    }
    if (msg.message?.productMessage) {
        return msg.message.productMessage?.caption || '';
    }
    
    return '';
}

/**
 * Extract message type
 */
function extractMessageType(msg) {
    if (!msg.message) return '';
    
    // Check for special message types first
    if (msg.message.viewOnceMessage) {
        const innerType = Object.keys(msg.message.viewOnceMessage.message || {})[0];
        return innerType || 'viewOnceMessage';
    }
    
    if (msg.message.viewOnceMessageV2) {
        const innerType = Object.keys(msg.message.viewOnceMessageV2.message || {})[0];
        return innerType || 'viewOnceMessageV2';
    }
    
    if (msg.message.reactionMessage) {
        return 'reactionMessage';
    }
    
    if (msg.message.pollCreationMessage) {
        return 'pollCreationMessage';
    }
    
    if (msg.message.pollUpdateMessage) {
        return 'pollUpdateMessage';
    }
    
    // Return the first key of the message object
    return Object.keys(msg.message)[0] || '';
}

/**
 * Check if message is media
 */
function isMediaMessage(type) {
    const mediaTypes = [
        'imageMessage', 'videoMessage', 'documentMessage', 
        'audioMessage', 'stickerMessage', 'ptvMessage'
    ];
    return mediaTypes.includes(type);
}

/**
 * Serialize a quoted message
 */
async function serializeQuotedMessage(sock, ctxInfo, originalMsg) {
    if (!ctxInfo?.quotedMessage) return null;
    
    const qMsg = ctxInfo.quotedMessage;
    const qType = extractMessageType({ message: qMsg });
    const qBody = extractMessageBody({ message: qMsg });
    
    const quoted = {
        key: { 
            remoteJid: originalMsg.key.remoteJid, 
            id: ctxInfo.stanzaId, 
            participant: ctxInfo.participant || originalMsg.key.remoteJid,
            fromMe: ctxInfo.participant === sock.user?.id
        },
        message: qMsg,
        type: qType,
        mtype: qType,
        body: qBody,
        text: qBody,
        isMedia: isMediaMessage(qType),
        mediaType: qType.replace('Message', '').toLowerCase(),
        mimetype: qMsg?.[qType]?.mimetype || null,
        sender: ctxInfo.participant || originalMsg.key.remoteJid,
        pushName: ctxInfo.participant?.split('@')[0] || 'Unknown',
        download: async () => {
            try {
                return await downloadMediaMessage(
                    { message: qMsg, key: originalMsg.key }, 
                    'buffer', 
                    {}, 
                    sock
                );
            } catch (error) {
                console.error('Error downloading quoted media:', error.message);
                return null;
            }
        }
    };
    
    return quoted;
}

/**
 * Serialize a message object for further processing and interaction.
 * Multi-session compatible version.
 *
 * @param sock - The socket connection used for sending and receiving messages.
 * @param msg - The message object containing details about the message to be serialized.
 * @param sessionId - Optional session ID for multi-session tracking
 * @returns An object representing the serialized message with methods for interaction.
 */
async function serializeMessage(sock, msg, sessionId = null) {
    try {
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.fromMe ? sock.user?.id : (isGroup ? msg.key.participant : from);
        const pushName = msg.pushName || (sender ? sender.split('@')[0] : 'Unknown');
        
        // Extract message body and type
        const body = extractMessageBody(msg);
        const type = extractMessageType(msg);
        
        // Check if this is a media message
        const isMedia = isMediaMessage(type);
        const mediaType = type.replace('Message', '').toLowerCase();
        const mimetype = msg.message?.[type]?.mimetype || null;
        
        // Get group metadata if it's a group
        let groupMetadata = null;
        if (isGroup) {
            groupMetadata = await getGroupMetadata(sock, from);
        }
        
        // Handle quoted messages
        let quoted = null;
        const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (ctxInfo) {
            quoted = await serializeQuotedMessage(sock, ctxInfo, msg);
        }
        
        // Message download handler
        const downloadHandler = async () => {
            if (!isMedia) return null;
            
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, sock);
                
                // Optional: Save to file for debugging
                if (sessionId && buffer) {
                    const mediaDir = path.join(__dirname, 'media', sessionId);
                    if (!fs.existsSync(mediaDir)) {
                        fs.mkdirSync(mediaDir, { recursive: true });
                    }
                    
                    const filename = `${Date.now()}_${msg.key.id}_${mediaType}`;
                    const filePath = path.join(mediaDir, filename);
                    
                    // Save asynchronously to not block response
                    fs.writeFile(filePath, buffer, (err) => {
                        if (err) console.error('Failed to save media:', err.message);
                    });
                }
                
                return buffer;
            } catch (error) {
                console.error('Error downloading media:', error.message);
                return null;
            }
        };
        
        return {
            // Basic info
            id: msg.key.id,
            from,
            sender,
            pushName,
            isGroup,
            groupMetadata,
            
            // Message content
            body,
            text: body,
            type,
            mtype: type,
            
            // Media info
            isMedia,
            mediaType,
            mimetype,
            
            // Quoted message
            quoted,
            
            // Additional flags
            isButtonResponse: !!msg.message?.interactiveResponseMessage,
            buttonId: msg.message?.interactiveResponseMessage?.buttonId || null,
            isViewOnce: type.includes('viewOnce'),
            isReaction: type === 'reactionMessage',
            isPoll: type.includes('poll'),
            isEphemeral: !!msg.message?.ephemeralMessage,
            
            // Session info (for multi-session tracking)
            sessionId,
            timestamp: msg.messageTimestamp || Date.now(),
            rawMessage: msg, // Keep raw message for advanced handling
            
            // Action methods
            reply: async (text, options = {}) => {
                try {
                    return await sock.sendMessage(
                        from, 
                        { text, ...options }, 
                        { quoted: msg }
                    );
                } catch (error) {
                    console.error('Error replying to message:', error.message);
                    return null;
                }
            },
            
            send: async (content, options = {}) => {
                try {
                    const messageContent = typeof content === 'string' 
                        ? { text: content, ...options } 
                        : content;
                    
                    return await sock.sendMessage(from, messageContent, { quoted: msg });
                } catch (error) {
                    console.error('Error sending message:', error.message);
                    return null;
                }
            },
            
            react: async (emoji) => {
                try {
                    return await sock.sendMessage(
                        from, 
                        { react: { text: emoji, key: msg.key } }
                    );
                } catch (error) {
                    console.error('Error reacting to message:', error.message);
                    return null;
                }
            },
            
            forward: async (jid, force = false) => {
                try {
                    return await sock.sendMessage(
                        jid, 
                        { forward: msg, force }
                    );
                } catch (error) {
                    console.error('Error forwarding message:', error.message);
                    return null;
                }
            },
            
            delete: async () => {
                try {
                    if (isGroup) {
                        // Check if bot is admin in group
                        if (groupMetadata) {
                            const participant = groupMetadata.participants.find(p => p.id === sock.user?.id);
                            if (participant?.admin) {
                                return await sock.sendMessage(from, {
                                    delete: msg.key
                                });
                            }
                        }
                    } else {
                        // Can delete own messages in private chat
                        if (msg.key.fromMe) {
                            return await sock.sendMessage(from, {
                                delete: msg.key
                            });
                        }
                    }
                    return null;
                } catch (error) {
                    console.error('Error deleting message:', error.message);
                    return null;
                }
            },
            
            download: downloadHandler,
            
            // Additional utility methods
            getSenderNumber: () => {
                if (!sender) return null;
                return sender.split('@')[0];
            },
            
            isFromBot: () => {
                return msg.key.fromMe || false;
            },
            
            isFromOwner: (ownerNumbers = []) => {
                if (!sender) return false;
                const senderNumber = sender.split('@')[0];
                return ownerNumbers.includes(senderNumber);
            },
            
            getMessageAge: () => {
                const msgTime = msg.messageTimestamp * 1000;
                return Date.now() - msgTime;
            },
            
            // Get mentioned users
            getMentionedUsers: () => {
                const mentions = ctxInfo?.mentionedJid || [];
                return mentions.filter(jid => jid !== 'status@broadcast');
            },
            
            // Check if message mentions the bot
            mentionsBot: () => {
                if (!sock.user?.id) return false;
                const mentioned = ctxInfo?.mentionedJid || [];
                const botJid = sock.user.id;
                return mentioned.includes(botJid);
            },
            
            // Log message (useful for debugging)
            log: (level = 'info', additionalInfo = {}) => {
                const logData = {
                    sessionId,
                    messageId: msg.key.id,
                    from,
                    sender,
                    type,
                    body: body.substring(0, 100),
                    timestamp: new Date().toISOString(),
                    ...additionalInfo
                };
                
                console[level](`Message logged:`, logData);
            }
        };
        
    } catch (error) {
        console.error('Error serializing message:', error);
        
        // Return a minimal serialized message even on error
        return {
            id: msg.key?.id || 'unknown',
            from: msg.key?.remoteJid || 'unknown',
            sender: 'unknown',
            pushName: 'unknown',
            isGroup: false,
            body: '',
            text: '',
            type: 'error',
            error: error.message,
            reply: async () => null,
            send: async () => null,
            react: async () => null,
            forward: async () => null,
            download: async () => null
        };
    }
}

// Export helper functions for external use
module.exports = {
    serializeMessage,
    extractMessageBody,
    extractMessageType,
    isMediaMessage,
    getGroupMetadata,
    cleanupCache
};

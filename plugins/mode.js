const fs = require('fs');
const path = require('path');

// Default config path
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const MODES = {
    PUBLIC: 'public',
    PRIVATE: 'private'
};

// Default mode
let currentMode = MODES.PRIVATE;
let owner = '254740007567@s.whatsapp.net'; // Default owner (Marisel)

// Load config if exists
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            currentMode = config.mode || MODES.PRIVATE;
            owner = config.owner || owner;
            console.log(`✅ Mode loaded: ${currentMode}`);
            console.log(`✅ Owner: ${owner}`);
        } else {
            // Create default config
            const defaultConfig = {
                mode: MODES.PRIVATE,
                owner: owner,
                version: '1.0',
                prefix: global.BOT_PREFIX || '.'
            };
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
            console.log('📁 Created default config file');
        }
    } catch (err) {
        console.error('❌ Error loading config:', err);
    }
}

// Save config
function saveConfig() {
    try {
        const config = {
            mode: currentMode,
            owner: owner,
            version: '1.0',
            prefix: global.BOT_PREFIX || '.',
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        console.log(`💾 Config saved: ${currentMode} mode`);
        return true;
    } catch (err) {
        console.error('❌ Error saving config:', err);
        return false;
    }
}

// Initialize on load
loadConfig();

// Check if user is owner
function isOwner(sender) {
    return sender === owner;
}

// Check if command should be allowed based on mode
function shouldAllowCommand(m, isGroup) {
    // Owner can always use commands
    if (isOwner(m.sender)) {
        return true;
    }
    
    // Private mode: only owner can use commands
    if (currentMode === MODES.PRIVATE) {
        return false;
    }
    
    // Public mode: everyone can use commands
    if (currentMode === MODES.PUBLIC) {
        return true;
    }
    
    // Default deny
    return false;
}

module.exports = {
    name: 'mode',
    aliases: ['botmode', 'setmode', 'togglemode'],
    description: 'Change bot mode between public and private',
    
    async execute(sock, m, args) {
        try {
            // Check if user is owner
            if (!isOwner(m.sender)) {
                await m.react('⛔');
                return await m.reply(`⛔ *Access Denied*\n\nOnly the bot owner can change modes.\n\nOwner: @${owner.split('@')[0]}`);
            }
            
            const subcommand = args[0]?.toLowerCase();
            
            if (!subcommand || subcommand === 'status') {
                return await this.showModeStatus(sock, m);
            }
            
            if (subcommand === 'public') {
                return await this.setPublicMode(sock, m);
            }
            
            if (subcommand === 'private') {
                return await this.setPrivateMode(sock, m);
            }
            
            if (subcommand === 'toggle') {
                return await this.toggleMode(sock, m);
            }
            
            if (subcommand === 'owner') {
                return await this.setOwner(sock, m, args.slice(1));
            }
            
            if (subcommand === 'help') {
                return await this.showHelp(sock, m);
            }
            
            await m.react('❓');
            await this.showHelp(sock, m);
            
        } catch (err) {
            console.error('❌ Mode command error:', err);
            await m.react('❌');
            await m.reply('❌ Error changing mode. Please try again.');
        }
    },
    
    async showModeStatus(sock, m) {
        await m.react('📊');
        
        const statusText = 
`*┏───〘 🤖 BOT MODE STATUS 〙───⊷*
*┃* *Current Mode:* ${currentMode === MODES.PUBLIC ? '🟢 PUBLIC' : '🔴 PRIVATE'}
*┃* *Owner:* @${owner.split('@')[0]}
*┃* *Prefix:* ${global.BOT_PREFIX || '.'}
*┃* *Version:* 1.0
*┗──────────────⊷*

*📝 Mode Details:*

🟢 *PUBLIC MODE:*
• Anyone can use bot commands
• Works in groups and private chats
• All features available

🔴 *PRIVATE MODE:*
• Only owner can use commands
• Others get access denied
• Groups: Bot won't respond to non-owners

*🔧 Commands:*
• ${global.BOT_PREFIX || '.'}mode public - Enable public mode
• ${global.BOT_PREFIX || '.'}mode private - Enable private mode
• ${global.BOT_PREFIX || '.'}mode toggle - Switch between modes
• ${global.BOT_PREFIX || '.'}mode status - Show this info

🚗 *Mercedes Bot Control*
> Made by Marisel`;

        await m.reply(statusText);
        await m.react('✅');
    },
    
    async setPublicMode(sock, m) {
        if (currentMode === MODES.PUBLIC) {
            await m.react('ℹ️');
            return await m.reply('ℹ️ Bot is already in *PUBLIC* mode.');
        }
        
        currentMode = MODES.PUBLIC;
        const saved = saveConfig();
        
        if (saved) {
            await m.react('🟢');
            await m.reply(`✅ *Bot Mode Changed to PUBLIC*\n\n📢 Bot now responds to *everyone*\n🔓 All commands are available\n👥 Works in groups and private chats\n\n🚗 Mercedes Bot is now public!`);
        } else {
            await m.react('❌');
            await m.reply('❌ Failed to save mode change. Check permissions.');
        }
    },
    
    async setPrivateMode(sock, m) {
        if (currentMode === MODES.PRIVATE) {
            await m.react('ℹ️');
            return await m.reply('ℹ️ Bot is already in *PRIVATE* mode.');
        }
        
        currentMode = MODES.PRIVATE;
        const saved = saveConfig();
        
        if (saved) {
            await m.react('🔴');
            await m.reply(`✅ *Bot Mode Changed to PRIVATE*\n\n🔒 Bot now responds to *owner only*\n⛔ Others get access denied\n👤 Only @${owner.split('@')[0]} can use commands\n\n🚗 Mercedes Bot is now private!`);
        } else {
            await m.react('❌');
            await m.reply('❌ Failed to save mode change. Check permissions.');
        }
    },
    
    async toggleMode(sock, m) {
        const newMode = currentMode === MODES.PUBLIC ? MODES.PRIVATE : MODES.PUBLIC;
        const oldMode = currentMode;
        
        currentMode = newMode;
        const saved = saveConfig();
        
        if (saved) {
            await m.react('🔄');
            await m.reply(`✅ *Bot Mode Toggled*\n\n📊 *From:* ${oldMode.toUpperCase()}\n📊 *To:* ${newMode.toUpperCase()}\n\n${newMode === MODES.PUBLIC ? '📢 Bot is now public!' : '🔒 Bot is now private!'}\n\n🚗 Mode switched successfully!`);
        } else {
            // Revert on error
            currentMode = oldMode;
            await m.react('❌');
            await m.reply('❌ Failed to toggle mode. Check permissions.');
        }
    },
    
    async setOwner(sock, m, args) {
        if (args.length === 0) {
            await m.react('❓');
            return await m.reply(`❓ Please provide a phone number!\n\nUsage: ${global.BOT_PREFIX || '.'}mode owner 254740007567\n\nCurrent owner: @${owner.split('@')[0]}`);
        }
        
        let phoneNumber = args[0].replace(/\D/g, '');
        
        // Add country code if missing
        if (!phoneNumber.startsWith('254') && phoneNumber.length === 9) {
            phoneNumber = '254' + phoneNumber;
        }
        
        if (phoneNumber.length < 10) {
            await m.react('❌');
            return await m.reply('❌ Invalid phone number! Use format: 254740007567');
        }
        
        const newOwner = phoneNumber + '@s.whatsapp.net';
        const oldOwner = owner;
        
        owner = newOwner;
        const saved = saveConfig();
        
        if (saved) {
            await m.react('👑');
            await m.reply(`✅ *Bot Owner Changed!*\n\n👑 *Old Owner:* @${oldOwner.split('@')[0]}\n👑 *New Owner:* @${newOwner.split('@')[0]}\n\n⚠️ *Important:*\n• New owner has full control\n• Old owner loses privileges\n• Make sure this is intentional!\n\n🚗 Ownership transferred successfully!`);
        } else {
            // Revert on error
            owner = oldOwner;
            await m.react('❌');
            await m.reply('❌ Failed to change owner. Check permissions.');
        }
    },
    
    async showHelp(sock, m) {
        await m.react('❓');
        
        const helpText = 
`*┏───〘 🤖 BOT MODE COMMANDS 〙───⊷*
*┃* *Control bot accessibility*
*┗──────────────⊷*

*🔧 Available Commands:*

${global.BOT_PREFIX || '.'}mode status
• Show current mode and settings

${global.BOT_PREFIX || '.'}mode public
• Set bot to PUBLIC mode
• Everyone can use commands

${global.BOT_PREFIX || '.'}mode private
• Set bot to PRIVATE mode
• Only owner can use commands

${global.BOT_PREFIX || '.'}mode toggle
• Switch between public/private

${global.BOT_PREFIX || '.'}mode owner <phone>
• Change bot owner
• Example: ${global.BOT_PREFIX || '.'}mode owner 254740007567

*💡 Examples:*
• ${global.BOT_PREFIX || '.'}mode public
• ${global.BOT_PREFIX || '.'}mode toggle
• ${global.BOT_PREFIX || '.'}mode owner 254712345678
> Made by Marisel`;

        await m.reply(helpText);
    },
    
    // Export helper functions for other plugins to use
    shouldAllowCommand: (m, isGroup) => shouldAllowCommand(m, isGroup),
    isOwner: (sender) => isOwner(sender),
    getCurrentMode: () => currentMode,
    getOwner: () => owner,
    MODES: MODES
};

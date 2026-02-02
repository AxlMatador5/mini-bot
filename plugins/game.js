const { delay } = require("@whiskeysockets/baileys");

const activeGames = new Map();
const ticTacToeGames = new Map();

module.exports = {
    name: 'game',
    aliases: ['games', 'play', 'fun'],
    description: 'Play various games in the group',
    
    async execute(sock, m, args) {
        try {
            const subcommand = args[0]?.toLowerCase() || 'list';
            
            switch(subcommand) {
                case 'squid':
                case 'squidgame':
                    return await this.squidGame(sock, m, args.slice(1));
                case 'konami':
                case 'match':
                    return await this.konamiMatch(sock, m, args.slice(1));
                case 'guess':
                case 'guessnumber':
                    return await this.guessNumber(sock, m, args.slice(1));
                case 'rps':
                case 'rockpaperscissors':
                    return await this.rockPaperScissors(sock, m, args.slice(1));
                case 'tictactoe':
                case 'ttt':
                    return await this.ticTacToe(sock, m, args.slice(1));
                case 'list':
                case 'help':
                default:
                    return await this.showGameList(sock, m);
            }
        } catch (err) {
            console.error('❌ Game command error:', err);
            await m.react('❌');
            await m.reply('❌ Error starting game. Please try again.');
        }
    },
    
    // Show all available games
    async showGameList(sock, m) {
        await m.react('🎮');
        
        const prefix = global.BOT_PREFIX || '.';
        const gameList = 
`*┏───〘 🎮 MERCEDES GAMES 〙───⊷*
*┃* *Available Games & Commands*
*┗──────────────⊷*

*┏───〘 GROUP GAMES 〙───⊷*
*┃* *Squid Game:* ${prefix}game squid
*┃*  - Admin only, Red Light Green Light
*┃*  - Last player standing wins
*┃*
*┃* *Konami Match:* ${prefix}game konami
*┃*  - Football team voting game
*┃*  - 30 second voting period
*┃*
*┃* *Guess Number:* ${prefix}game guess
*┃*  - Guess number 1-20
*┃*  - 5 attempts per player
*┗──────────────⊷*

*┏───〘 DUEL GAMES 〙───⊷*
*┃* *Rock Paper Scissors:* ${prefix}game rps <choice>
*┃*  Example: ${prefix}game rps rock
*┃*
*┃* *Tic Tac Toe:* ${prefix}game tictactoe
*┃*  Start: ${prefix}game tictactoe start
*┃*  Move: ${prefix}game tictactoe move <1-9>
*┗──────────────⊷*

💡 *Tips:*
• Only one game can run per chat
• Some games require admin permissions
• Games auto-cleanup after completion

🚗 *Mercedes Entertainment System*
> Made by Marisel`;

        await m.reply(gameList);
        await m.react('✅');
    },
    
    // Squid Game
    async squidGame(sock, m, args) {
        try {
            if (!m.isGroup) {
                await m.react('❌');
                return await m.reply('❌ This command can only be used in groups!');
            }
            
            if (activeGames.has(m.from)) {
                await m.react('⚠️');
                return await m.reply('⚠️ A game is already running in this chat!');
            }
            
            // Check if user is admin
            const groupMetadata = await sock.groupMetadata(m.from);
            const participant = m.isGroup ? m.sender : m.from;
            const senderAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
            
            if (!senderAdmin) {
                await m.react('⛔');
                return await m.reply('⛔ Only group admins can start Squid Game!');
            }
            
            // Filter non-admin players
            let players = groupMetadata.participants.filter(p => !p.admin && p.id !== sock.user.id);
            
            if (players.length < 3) {
                await m.react('👥');
                return await m.reply('👥 Need at least 3 non-admin players to start!');
            }
            
            activeGames.set(m.from, 'squidgame');
            await m.react('🔴');
            
            const gameCreator = m.pushName || 'Admin';
            const playerMentions = players.map(p => `@${p.id.split('@')[0]}`).join('\n');
            
            await sock.sendMessage(m.from, {
                text: `🔴 *SQUID GAME: RED LIGHT GREEN LIGHT*\n\n👑 *Front Man:* ${gameCreator}\n\n🎮 *Players:*\n${playerMentions}\n\n⚠️ *Rules:*\n• Red Light: Stay silent\n• Green Light: Send any message\n• Wrong move = Elimination\n• Last player wins!\n\n⏰ Game starts in 15 seconds...`,
                mentions: players.map(p => p.id)
            });
            
            await delay(15000);
            
            let remainingPlayers = [...players];
            let round = 1;
            
            while (remainingPlayers.length > 1 && round <= 10) {
                const isGreenLight = Math.random() > 0.5;
                const lightText = isGreenLight ? '🟢 GREEN LIGHT!' : '🔴 RED LIGHT!';
                const instruction = isGreenLight ? 'SEND ANY MESSAGE NOW!' : 'STAY SILENT!';
                
                await sock.sendMessage(m.from, {
                    text: `⚡ *ROUND ${round}*\n\n${lightText}\n${instruction}\n\n⏳ Time: 7 seconds`,
                    mentions: remainingPlayers.map(p => p.id)
                });
                
                // Listen for messages
                const spokenPlayers = new Set();
                const listener = async (update) => {
                    if (update.type === 'notify') {
                        const msg = update.messages[0];
                        if (msg.key.remoteJid === m.from && msg.key.participant) {
                            const sender = msg.key.participant;
                            if (remainingPlayers.find(p => p.id === sender)) {
                                spokenPlayers.add(sender);
                            }
                        }
                    }
                };
                
                sock.ev.on('messages.upsert', listener);
                
                await delay(7000);
                sock.ev.off('messages.upsert', listener);
                
                // Determine eliminations
                let eliminated = [];
                if (isGreenLight) {
                    // Green Light: Players who didn't speak are eliminated
                    eliminated = remainingPlayers.filter(p => !spokenPlayers.has(p.id));
                } else {
                    // Red Light: Players who spoke are eliminated
                    eliminated = remainingPlayers.filter(p => spokenPlayers.has(p.id));
                }
                
                // Eliminate players
                for (const player of eliminated) {
                    try {
                        await sock.groupParticipantsUpdate(m.from, [player.id], 'remove');
                        await sock.sendMessage(m.from, {
                            text: `❌ ELIMINATED: @${player.id.split('@')[0]}\nReason: ${isGreenLight ? 'Did not speak on Green Light' : 'Spoke on Red Light'}`,
                            mentions: [player.id]
                        });
                        await delay(2000);
                    } catch (e) {
                        console.log('Failed to remove player:', e.message);
                    }
                }
                
                remainingPlayers = remainingPlayers.filter(p => !eliminated.find(ep => ep.id === p.id));
                
                if (remainingPlayers.length > 1) {
                    await sock.sendMessage(m.from, {
                        text: `📊 *Round ${round} Complete*\n\n👥 Remaining: ${remainingPlayers.length} players\n🎮 Next round in 5 seconds...`,
                        mentions: remainingPlayers.map(p => p.id)
                    });
                    await delay(5000);
                }
                
                round++;
            }
            
            // Game result
            if (remainingPlayers.length === 1) {
                const winner = remainingPlayers[0];
                await sock.sendMessage(m.from, {
                    text: `🏆 *SQUID GAME WINNER!*\n\n🎉 Congratulations @${winner.id.split('@')[0]}!\n💰 You won the game!\n\nThanks for playing!`,
                    mentions: [winner.id]
                });
            } else {
                await sock.sendMessage(m.from, {
                    text: `🎮 *Game Over!*\n\nNo winner this time. All players were eliminated!\n\nBetter luck next time!`
                });
            }
            
            activeGames.delete(m.from);
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Squid Game error:', err);
            activeGames.delete(m.from);
            await m.react('❌');
            await m.reply('❌ Squid Game failed. Please try again.');
        }
    },
    
    // Konami Match Voting Game
    async konamiMatch(sock, m, args) {
        try {
            if (!m.isGroup) {
                await m.react('❌');
                return await m.reply('❌ This command only works in groups!');
            }
            
            if (activeGames.has(m.from)) {
                await m.react('⚠️');
                return await m.reply('⚠️ A game is already running!');
            }
            
            activeGames.set(m.from, 'konami');
            await m.react('⚽');
            
            const teams = [
                'Real Madrid 🇪🇸', 'FC Barcelona 🇪🇸', 'Manchester United 🇬🇧', 'Liverpool FC 🇬🇧',
                'Bayern Munich 🇩🇪', 'Juventus 🇮🇹', 'Paris Saint-Germain 🇫🇷', 'Arsenal FC 🇬🇧',
                'AC Milan 🇮🇹', 'Inter Milan 🇮🇹', 'Chelsea FC 🇬🇧', 'Borussia Dortmund 🇩🇪'
            ];
            
            let team1 = teams[Math.floor(Math.random() * teams.length)];
            let team2;
            do {
                team2 = teams[Math.floor(Math.random() * teams.length)];
            } while (team2 === team1);
            
            await sock.sendMessage(m.from, {
                text: `⚽ *KONAMI MATCH VOTING*\n\n🏆 *Match Fixture*\n\n1️⃣ ${team1}\n   VS\n2️⃣ ${team2}\n\n🗳️ *How to Vote:*\nSend "1" to vote for ${team1}\nSend "2" to vote for ${team2}\n\n⏰ Voting ends in 30 seconds!`
            });
            
            let votes = { team1: 0, team2: 0 };
            const voters = new Set();
            
            // Listen for votes
            const voteListener = async (update) => {
                if (update.type === 'notify') {
                    const msg = update.messages[0];
                    if (msg.key.remoteJid === m.from && msg.message?.conversation) {
                        const vote = msg.message.conversation.trim();
                        const voter = msg.key.participant || msg.key.remoteJid;
                        
                        if (!voters.has(voter)) {
                            if (vote === '1') {
                                votes.team1++;
                                voters.add(voter);
                            } else if (vote === '2') {
                                votes.team2++;
                                voters.add(voter);
                            }
                        }
                    }
                }
            };
            
            sock.ev.on('messages.upsert', voteListener);
            
            await delay(30000);
            
            sock.ev.off('messages.upsert', voteListener);
            
            // Determine winner
            let winner, resultText;
            if (votes.team1 > votes.team2) {
                winner = team1;
                resultText = `🏆 *${team1} WINS!*\n\nScore: ${votes.team1} - ${votes.team2}`;
            } else if (votes.team2 > votes.team1) {
                winner = team2;
                resultText = `🏆 *${team2} WINS!*\n\nScore: ${votes.team1} - ${votes.team2}`;
            } else {
                winner = Math.random() > 0.5 ? team1 : team2;
                resultText = `⚖️ *DRAW!*\n\nScore: ${votes.team1} - ${votes.team2}\nRandom winner: ${winner}`;
            }
            
            await sock.sendMessage(m.from, {
                text: `${resultText}\n\n👥 Total Voters: ${voters.size}\n🎮 Match completed!\n\nThanks for playing!`
            });
            
            activeGames.delete(m.from);
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ Konami Match error:', err);
            activeGames.delete(m.from);
            await m.react('❌');
            await m.reply('❌ Konami Match failed. Please try again.');
        }
    },
    
    // Guess Number Game
    async guessNumber(sock, m, args) {
        try {
            if (activeGames.has(m.from)) {
                await m.react('⚠️');
                return await m.reply('⚠️ A game is already running!');
            }
            
            activeGames.set(m.from, 'guessnumber');
            await m.react('🎲');
            
            const targetNumber = Math.floor(Math.random() * 20) + 1;
            let attempts = 5;
            let gameActive = true;
            
            await sock.sendMessage(m.from, {
                text: `🎲 *GUESS THE NUMBER*\n\nI'm thinking of a number between 1 and 20!\n\n🎯 You have ${attempts} attempts\n📝 Just send your guess as a number\n\nGame starts now!`
            });
            
            // Game listener
            const gameListener = async (update) => {
                if (!gameActive) return;
                
                if (update.type === 'notify') {
                    const msg = update.messages[0];
                    if (msg.key.remoteJid === m.from && msg.message?.conversation) {
                        const guess = parseInt(msg.message.conversation.trim());
                        const player = msg.key.participant || msg.key.remoteJid;
                        
                        if (!isNaN(guess) && guess >= 1 && guess <= 20) {
                            attempts--;
                            
                            if (guess === targetNumber) {
                                gameActive = false;
                                activeGames.delete(m.from);
                                sock.ev.off('messages.upsert', gameListener);
                                
                                await sock.sendMessage(m.from, {
                                    text: `🎉 *CORRECT!*\n\n@${player.split('@')[0]} guessed the number ${targetNumber}!\n\n🏆 You win! 🎊`,
                                    mentions: [player]
                                });
                            } else if (attempts === 0) {
                                gameActive = false;
                                activeGames.delete(m.from);
                                sock.ev.off('messages.upsert', gameListener);
                                
                                await sock.sendMessage(m.from, {
                                    text: `❌ *GAME OVER!*\n\nThe number was: ${targetNumber}\n\nNo attempts left. Better luck next time!`
                                });
                            } else {
                                const hint = guess > targetNumber ? '📈 Too high!' : '📉 Too low!';
                                await sock.sendMessage(m.from, {
                                    text: `❌ Wrong guess! ${hint}\n\nAttempts left: ${attempts}\nLast guess: ${guess}`
                                });
                            }
                        }
                    }
                }
            };
            
            sock.ev.on('messages.upsert', gameListener);
            
            // Auto timeout after 2 minutes
            setTimeout(() => {
                if (gameActive) {
                    gameActive = false;
                    activeGames.delete(m.from);
                    sock.ev.off('messages.upsert', gameListener);
                    
                    sock.sendMessage(m.from, {
                        text: `⏰ *GAME TIMEOUT!*\n\nThe number was: ${targetNumber}\n\nGame ended due to inactivity.`
                    });
                }
            }, 120000);
            
        } catch (err) {
            console.error('❌ Guess Number error:', err);
            activeGames.delete(m.from);
            await m.react('❌');
            await m.reply('❌ Guess Number game failed. Please try again.');
        }
    },
    
    // Rock Paper Scissors
    async rockPaperScissors(sock, m, args) {
        try {
            await m.react('✊');
            
            if (args.length === 0) {
                return await m.reply(`🎮 *ROCK PAPER SCISSORS*\n\nUsage: ${global.BOT_PREFIX || '.'}game rps <choice>\n\nChoices: rock, paper, scissors\n\nExample: ${global.BOT_PREFIX || '.'}game rps rock`);
            }
            
            const userChoice = args[0].toLowerCase();
            const validChoices = ['rock', 'paper', 'scissors'];
            
            if (!validChoices.includes(userChoice)) {
                await m.react('❌');
                return await m.reply('❌ Invalid choice! Please choose: rock, paper, or scissors');
            }
            
            const botChoice = validChoices[Math.floor(Math.random() * 3)];
            
            // Determine winner
            let result;
            if (userChoice === botChoice) {
                result = '🤝 *It\'s a TIE!*';
            } else if (
                (userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')
            ) {
                result = '🎉 *You WIN!*';
            } else {
                result = '😢 *You LOSE!*';
            }
            
            const emojiMap = {
                rock: '✊',
                paper: '✋',
                scissors: '✌️'
            };
            
            await m.reply(
                `🎮 *ROCK PAPER SCISSORS*\n\n` +
                `👤 Your choice: ${emojiMap[userChoice]} ${userChoice}\n` +
                `🤖 My choice: ${emojiMap[botChoice]} ${botChoice}\n\n` +
                `${result}\n\n` +
                `🚗 *Mercedes Games*\n> Good game!`
            );
            
            await m.react('✅');
            
        } catch (err) {
            console.error('❌ RPS error:', err);
            await m.react('❌');
            await m.reply('❌ RPS game failed. Please try again.');
        }
    },
    
    // Tic Tac Toe
    async ticTacToe(sock, m, args) {
        try {
            const subcmd = args[0]?.toLowerCase();
            
            if (!subcmd) {
                return await this.showTicTacToeHelp(sock, m);
            }
            
            if (subcmd === 'start') {
                return await this.startTicTacToe(sock, m);
            } else if (subcmd === 'move') {
                return await this.makeTicTacToeMove(sock, m, args[1]);
            } else if (subcmd === 'board' || subcmd === 'status') {
                return await this.showTicTacToeBoard(sock, m);
            } else if (subcmd === 'end' || subcmd === 'quit') {
                return await this.endTicTacToe(sock, m);
            } else {
                return await this.showTicTacToeHelp(sock, m);
            }
            
        } catch (err) {
            console.error('❌ Tic Tac Toe error:', err);
            await m.react('❌');
            await m.reply('❌ Tic Tac Toe error. Please try again.');
        }
    },
    
    async showTicTacToeHelp(sock, m) {
        await m.react('❓');
        
        const prefix = global.BOT_PREFIX || '.';
        const helpText = 
`🎮 *TIC TAC TOE COMMANDS*

${prefix}game tictactoe start - Start new game
${prefix}game tictactoe move <1-9> - Make a move
${prefix}game tictactoe board - Show current board
${prefix}game tictactoe end - End current game

📐 *Board Positions:*
1 2 3
4 5 6
7 8 9

👥 *How to Play:*
1. Start game with "start"
2. Players take turns with "move"
3. First to get 3 in a row wins!

🚗 *Mercedes Strategy Games*
> Made by Marisel`;

        await m.reply(helpText);
    },
    
    async startTicTacToe(sock, m) {
        if (ticTacToeGames.has(m.from)) {
            await m.react('⚠️');
            return await m.reply('⚠️ A Tic Tac Toe game is already in progress!');
        }
        
        ticTacToeGames.set(m.from, {
            board: Array(9).fill('⬜'),
            players: [m.sender, null],
            turn: '❌', // Player 1 is X
            moves: 0
        });
        
        await m.react('🎮');
        
        await m.reply(
            `🎮 *TIC TAC TOE STARTED!*\n\n` +
            `Player 1 (❌): @${m.sender.split('@')[0]}\n` +
            `Player 2 (⭕): Waiting to join...\n\n` +
            `📐 *Empty Board:*\n` +
            `⬜⬜⬜\n⬜⬜⬜\n⬜⬜⬜\n\n` +
            `Player 1 starts! Use "${global.BOT_PREFIX || '.'}game tictactoe move <1-9>"`
        );
    },
    
    async makeTicTacToeMove(sock, m, position) {
        const game = ticTacToeGames.get(m.from);
        
        if (!game) {
            await m.react('❌');
            return await m.reply('❌ No Tic Tac Toe game in progress! Start one first.');
        }
        
        const pos = parseInt(position);
        if (isNaN(pos) || pos < 1 || pos > 9) {
            await m.react('❌');
            return await m.reply('❌ Position must be a number 1-9!');
        }
        
        const index = pos - 1;
        
        if (game.board[index] !== '⬜') {
            await m.react('❌');
            return await m.reply('❌ That position is already taken!');
        }
        
        // Determine current player
        const isPlayer1 = game.players[0] === m.sender;
        const isPlayer2 = game.players[1] === m.sender;
        
        if (!isPlayer1 && !isPlayer2) {
            // New player joining as Player 2
            if (!game.players[1]) {
                game.players[1] = m.sender;
            } else {
                await m.react('⛔');
                return await m.reply('⛔ You are not part of this game!');
            }
        }
        
        // Check if it's player's turn
        const shouldBeX = game.turn === '❌';
        if ((shouldBeX && !isPlayer1) || (!shouldBeX && !isPlayer2)) {
            await m.react('⏳');
            return await m.reply('⏳ It\'s not your turn!');
        }
        
        // Make move
        game.board[index] = game.turn;
        game.moves++;
        
        // Check for win
        const winPatterns = [
            [0,1,2], [3,4,5], [6,7,8], // rows
            [0,3,6], [1,4,7], [2,5,8], // columns
            [0,4,8], [2,4,6]           // diagonals
        ];
        
        let winner = null;
        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (game.board[a] !== '⬜' && 
                game.board[a] === game.board[b] && 
                game.board[a] === game.board[c]) {
                winner = game.board[a];
                break;
            }
        }
        
        // Format board
        const boardText = 
            `${game.board[0]}${game.board[1]}${game.board[2]}\n` +
            `${game.board[3]}${game.board[4]}${game.board[5]}\n` +
            `${game.board[6]}${game.board[7]}${game.board[8]}`;
        
        if (winner) {
            const winningPlayer = winner === '❌' ? game.players[0] : game.players[1];
            const winnerName = `@${winningPlayer.split('@')[0]}`;
            
            await m.reply(
                `🏆 *TIC TAC TOE WINNER!*\n\n` +
                `${boardText}\n\n` +
                `🎉 ${winnerName} (${winner}) wins!\n` +
                `Moves: ${game.moves}\n\n` +
                `🚗 *Great game!*`
            );
            
            ticTacToeGames.delete(m.from);
            await m.react('✅');
            
        } else if (game.moves === 9) {
            // Draw
            await m.reply(
                `🤝 *TIC TAC TOE DRAW!*\n\n` +
                `${boardText}\n\n` +
                `⚖️ It\'s a draw! No winner.\n` +
                `Moves: ${game.moves}\n\n` +
                `🚗 *Well played both!*`
            );
            
            ticTacToeGames.delete(m.from);
            await m.react('✅');
            
        } else {
            // Continue game
            game.turn = game.turn === '❌' ? '⭕' : '❌';
            const nextPlayer = game.turn === '❌' ? game.players[0] : game.players[1];
            const nextPlayerName = nextPlayer ? `@${nextPlayer.split('@')[0]}` : 'Waiting for Player 2';
            
            await m.reply(
                `🎮 *TIC TAC TOE MOVE ${game.moves}*\n\n` +
                `${boardText}\n\n` +
                `➡️ Next turn: ${game.turn} (${nextPlayerName})\n` +
                `Use "${global.BOT_PREFIX || '.'}game tictactoe move <1-9>"`
            );
            
            await m.react('✅');
        }
    },
    
    async showTicTacToeBoard(sock, m) {
        const game = ticTacToeGames.get(m.from);
        
        if (!game) {
            await m.react('❌');
            return await m.reply('❌ No Tic Tac Toe game in progress!');
        }
        
        const boardText = 
            `${game.board[0]}${game.board[1]}${game.board[2]}\n` +
            `${game.board[3]}${game.board[4]}${game.board[5]}\n` +
            `${game.board[6]}${game.board[7]}${game.board[8]}`;
        
        const player1Name = game.players[0] ? `@${game.players[0].split('@')[0]}` : 'None';
        const player2Name = game.players[1] ? `@${game.players[1].split('@')[0]}` : 'Waiting...';
        
        await m.reply(
            `🎮 *TIC TAC TOE STATUS*\n\n` +
            `${boardText}\n\n` +
            `❌ Player 1: ${player1Name}\n` +
            `⭕ Player 2: ${player2Name}\n` +
            `🎯 Turn: ${game.turn}\n` +
            `📊 Moves: ${game.moves}/9`
        );
        
        await m.react('📊');
    },
    
    async endTicTacToe(sock, m) {
        if (!ticTacToeGames.has(m.from)) {
            await m.react('❌');
            return await m.reply('❌ No Tic Tac Toe game in progress!');
        }
        
        ticTacToeGames.delete(m.from);
        await m.react('🛑');
        await m.reply('🎮 Tic Tac Toe game ended!');
    }
};

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('.'));

// Game state
const rooms = {};
const words = [
    'Cat', 'Dog', 'House', 'Tree', 'Car', 'Sun', 'Flower', 'Book', 
    'Pizza', 'Ice Cream', 'Bicycle', 'Mountain', 'Beach', 'Rainbow',
    'Dragon', 'Castle', 'Robot', 'Spaceship', 'Unicorn', 'Wizard',
    'Guitar', 'Piano', 'Microphone', 'Camera', 'Computer', 'Phone',
    'Coffee', 'Hamburger', 'Sunglasses', 'Hat', 'Shoe', 'Clock'
];

class GameRoom {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = {};
        this.gameState = 'waiting';
        this.currentDrawer = null;
        this.currentWord = '';
        this.scores = {};
        this.round = 1;
        this.totalRounds = 3;
        this.roundTime = 60;
        this.history = [];
    }

    addPlayer(socketId, playerName) {
        this.players[socketId] = playerName;
        this.scores[socketId] = 0;
        this.broadcastPlayerList();
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        delete this.scores[socketId];
        
        if (socketId === this.currentDrawer) {
            this.selectNextDrawer();
        }
        
        this.broadcastPlayerList();
    }

    broadcastPlayerList() {
        io.to(this.roomId).emit('playerList', this.players);
        io.to(this.roomId).emit('scoreUpdate', this.scores);
    }

    startGame() {
        if (Object.keys(this.players).length < 2) {
            this.broadcastMessage('system', 'Need at least 2 players to start!');
            return;
        }

        this.gameState = 'drawing';
        this.round = 1;
        this.startRound();
    }

    startRound() {
        const playerIds = Object.keys(this.players);
        this.currentDrawer = playerIds[this.round % playerIds.length];
        this.currentWord = words[Math.floor(Math.random() * words.length)];
        
        io.to(this.roomId).emit('clearCanvas');
        
        // Send word only to drawer
        io.to(this.currentDrawer).emit('wordToDraw', this.currentWord);
        
        io.to(this.roomId).emit('roundStart', {
            drawerId: this.currentDrawer,
            word: this.currentWord,
            round: this.round,
            totalRounds: this.totalRounds,
            time: this.roundTime
        });
        
        this.broadcastMessage('system', `Round ${this.round} started!`);
    }

    selectNextDrawer() {
        const playerIds = Object.keys(this.players);
        if (playerIds.length === 0) return;
        
        const currentIndex = playerIds.indexOf(this.currentDrawer);
        this.currentDrawer = playerIds[(currentIndex + 1) % playerIds.length];
    }

    handleGuess(socketId, guess) {
        const playerName = this.players[socketId];
        const guessLower = guess.toLowerCase().trim();
        const wordLower = this.currentWord.toLowerCase();
        
        if (socketId === this.currentDrawer) {
            this.broadcastMessage(playerName, guess, 'normal');
            return;
        }
        
        if (guessLower === wordLower) {
            // Award points
            this.scores[this.currentDrawer] = (this.scores[this.currentDrawer] || 0) + 2;
            this.scores[socketId] = (this.scores[socketId] || 0) + (10 - Math.floor(this.round / 2));
            
            this.broadcastMessage(playerName, `guessed the word "${this.currentWord}"!`, 'correct');
            this.broadcastPlayerList();
            
            // End round early
            setTimeout(() => {
                this.nextRound();
            }, 3000);
        } else {
            this.broadcastMessage(playerName, guess, 'normal');
        }
    }

    nextRound() {
        this.round++;
        
        if (this.round > this.totalRounds) {
            this.endGame();
        } else {
            this.startRound();
        }
    }

    endGame() {
        this.gameState = 'ended';
        
        // Find winner
        let winner = null;
        let highScore = -1;
        
        Object.entries(this.scores).forEach(([playerId, score]) => {
            if (score > highScore) {
                highScore = score;
                winner = playerId;
            }
        });
        
        io.to(this.roomId).emit('gameOver', winner);
        this.broadcastMessage('system', 'Game Over! Starting new game in 10 seconds...');
        
        // Reset for new game
        setTimeout(() => {
            this.resetGame();
        }, 10000);
    }

    resetGame() {
        this.gameState = 'waiting';
        this.currentDrawer = null;
        this.currentWord = '';
        this.round = 1;
        
        // Reset scores
        Object.keys(this.scores).forEach(playerId => {
            this.scores[playerId] = 0;
        });
        
        io.to(this.roomId).emit('gameState', 'waiting');
        io.to(this.roomId).emit('clearCanvas');
        this.broadcastPlayerList();
        this.broadcastMessage('system', 'New game ready! Waiting for players...');
    }

    broadcastMessage(sender, message, type = 'normal') {
        io.to(this.roomId).emit('newMessage', {
            player: sender,
            message: message,
            type: type
        });
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);
    
    let currentRoom = null;
    
    socket.on('joinRoom', ({ playerName, roomId }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = new GameRoom(roomId);
        }
        
        currentRoom = rooms[roomId];
        socket.join(roomId);
        
        currentRoom.addPlayer(socket.id, playerName);
        socket.emit('gameState', currentRoom.gameState);
        
        currentRoom.broadcastMessage('system', `${playerName} joined the game!`);
        console.log(`${playerName} joined room ${roomId}`);
    });
    
    socket.on('startGame', () => {
        if (currentRoom) {
            currentRoom.startGame();
        }
    });
    
    socket.on('message', (message) => {
        if (currentRoom && message.trim()) {
            currentRoom.handleGuess(socket.id, message);
        }
    });
    
    socket.on('drawing', (data) => {
        if (currentRoom && socket.id === currentRoom.currentDrawer) {
            socket.to(currentRoom.roomId).emit('drawingData', data);
        }
    });
    
    socket.on('clearCanvas', () => {
        if (currentRoom && socket.id === currentRoom.currentDrawer) {
            socket.to(currentRoom.roomId).emit('clearCanvas');
        }
    });
    
    socket.on('nextRound', () => {
        if (currentRoom) {
            currentRoom.nextRound();
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
        
        if (currentRoom) {
            const playerName = currentRoom.players[socket.id];
            currentRoom.removePlayer(socket.id);
            
            io.to(currentRoom.roomId).emit('playerDisconnected', socket.id);
            currentRoom.broadcastMessage('system', `${playerName} left the game`);
            
            // Clean up empty rooms
            if (Object.keys(currentRoom.players).length === 0) {
                delete rooms[currentRoom.roomId];
            }
        }
    });
    
    // Handle initial connection with query params
    const { playerName, roomId } = socket.handshake.query;
    if (playerName && roomId) {
        socket.emit('joinRoom', { playerName, roomId });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎨 Drawing Game Server running on port ${PORT}`);
    console.log(`👉 Open http://localhost:${PORT} in your browser`);
});

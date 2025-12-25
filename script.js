class DrawingGame {
    constructor() {
        this.socket = null;
        this.playerName = 'Player';
        this.roomId = 'fun-room';
        this.isDrawing = false;
        this.currentWord = '';
        this.gameState = 'waiting'; // waiting, drawing, guessing, ended
        this.players = {};
        this.scores = {};
        this.isCurrentDrawer = false;
        this.drawingHistory = [];
        this.historyIndex = -1;
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.showConnectionModal();
    }

    setupCanvas() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.lineWidth = 5;
        this.ctx.lineCap = 'round';
        this.ctx.strokeStyle = '#000000';
        
        // Set canvas size based on container
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = 500;
        
        // Drawing state
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    setupEventListeners() {
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this.stopDrawing());

        // Tool controls
        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.ctx.lineWidth = e.target.value;
            document.getElementById('brush-size-value').textContent = e.target.value + 'px';
        });

        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.ctx.strokeStyle = btn.dataset.color;
            });
        });

        document.getElementById('clear-btn').addEventListener('click', () => this.clearCanvas());
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());

        // Game controls
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Connection modal
        document.getElementById('join-btn').addEventListener('click', () => this.connectToGame());
        document.getElementById('create-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connectToGame();
        });
        document.getElementById('room-id').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connectToGame();
        });
    }

    showConnectionModal() {
        document.getElementById('connection-modal').classList.remove('hidden');
    }

    hideConnectionModal() {
        document.getElementById('connection-modal').classList.add('hidden');
    }

    connectToGame() {
        this.playerName = document.getElementById('player-name').value || 'Player';
        this.roomId = document.getElementById('room-id').value || 'fun-room';
        
        // Connect to Socket.IO server
        this.socket = io('http://localhost:3000', {
            query: {
                playerName: this.playerName,
                roomId: this.roomId
            }
        });

        this.setupSocketListeners();
        this.hideConnectionModal();
    }

    createRoom() {
        const randomId = Math.random().toString(36).substring(7);
        document.getElementById('room-id').value = randomId;
        this.connectToGame();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.addMessage('system', 'Connected to game server!');
        });

        this.socket.on('playerList', (players) => {
            this.updatePlayerList(players);
        });

        this.socket.on('gameState', (state) => {
            this.updateGameState(state);
        });

        this.socket.on('newMessage', (data) => {
            this.addMessage(data.player, data.message, data.type);
        });

        this.socket.on('drawingData', (data) => {
            this.drawFromData(data);
        });

        this.socket.on('clearCanvas', () => {
            this.clearCanvas();
        });

        this.socket.on('wordToDraw', (word) => {
            this.setWordToDraw(word);
        });

        this.socket.on('playerDisconnected', (playerId) => {
            this.addMessage('system', `${this.players[playerId]} left the game`);
            delete this.players[playerId];
            this.updatePlayerList(this.players);
        });

        this.socket.on('scoreUpdate', (scores) => {
            this.updateScoreboard(scores);
        });

        this.socket.on('roundStart', (data) => {
            this.startRound(data);
        });

        this.socket.on('gameOver', (winner) => {
            this.endGame(winner);
        });
    }

    startDrawing(e) {
        if (!this.isCurrentDrawer || this.gameState !== 'drawing') return;
        
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        [this.lastX, this.lastY] = [e.clientX - rect.left, e.clientY - rect.top];
        
        // Play drawing sound
        document.getElementById('draw-sound').currentTime = 0;
        document.getElementById('draw-sound').play();
    }

    draw(e) {
        if (!this.isDrawing || !this.isCurrentDrawer) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Draw locally
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        // Save to history
        this.saveToHistory();
        
        // Send drawing data to server
        if (this.socket) {
            this.socket.emit('drawing', {
                fromX: this.lastX / this.canvas.width,
                fromY: this.lastY / this.canvas.height,
                toX: x / this.canvas.width,
                toY: y / this.canvas.height,
                color: this.ctx.strokeStyle,
                width: this.ctx.lineWidth
            });
        }
        
        [this.lastX, this.lastY] = [x, y];
    }

    stopDrawing() {
        this.isDrawing = false;
        this.ctx.beginPath();
    }

    drawFromData(data) {
        const ctx = this.ctx;
        
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.width;
        
        const fromX = data.fromX * this.canvas.width;
        const fromY = data.fromY * this.canvas.height;
        const toX = data.toX * this.canvas.width;
        const toY = data.toY * this.canvas.height;
        
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        
        // Reset to current settings
        const activeColor = document.querySelector('.color-btn.active');
        ctx.strokeStyle = activeColor ? activeColor.dataset.color : '#000000';
        ctx.lineWidth = document.getElementById('brush-size').value;
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawingHistory = [];
        this.historyIndex = -1;
        
        if (this.socket && this.isCurrentDrawer) {
            this.socket.emit('clearCanvas');
        }
    }

    saveToHistory() {
        // Remove any redo history after new draw
        this.drawingHistory = this.drawingHistory.slice(0, this.historyIndex + 1);
        
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.drawingHistory.push(imageData);
        this.historyIndex++;
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const imageData = this.drawingHistory[this.historyIndex];
            this.ctx.putImageData(imageData, 0, 0);
        } else if (this.historyIndex === 0) {
            this.historyIndex = -1;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    redo() {
        if (this.historyIndex < this.drawingHistory.length - 1) {
            this.historyIndex++;
            const imageData = this.drawingHistory[this.historyIndex];
            this.ctx.putImageData(imageData, 0, 0);
        }
    }

    sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        
        if (message && this.socket) {
            this.socket.emit('message', message);
            input.value = '';
        }
    }

    addMessage(player, message, type = 'normal') {
        const chat = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        
        messageDiv.className = `message ${type}-message`;
        
        if (type === 'system') {
            messageDiv.innerHTML = `<i class="fas fa-robot"></i> ${message}`;
        } else if (type === 'correct') {
            messageDiv.innerHTML = `<strong>${player}</strong> guessed correctly! 🎉 ${message}`;
            document.getElementById('correct-sound').play();
        } else {
            messageDiv.innerHTML = `<strong>${player}:</strong> ${message}`;
        }
        
        chat.appendChild(messageDiv);
        chat.scrollTop = chat.scrollHeight;
    }

    updatePlayerList(players) {
        this.players = players;
        const playerList = document.getElementById('players-list');
        const playerCount = document.getElementById('player-count');
        
        playerList.innerHTML = '';
        playerCount.textContent = Object.keys(players).length;
        
        // Add current player first
        const currentPlayerDiv = document.createElement('div');
        currentPlayerDiv.className = 'player me';
        currentPlayerDiv.innerHTML = `
            <span class="player-icon"><i class="fas fa-user"></i></span>
            <span class="player-name">You (${this.playerName})</span>
            <span class="player-score">${this.scores[this.socket?.id] || 0} pts</span>
        `;
        playerList.appendChild(currentPlayerDiv);
        
        // Add other players
        Object.entries(players).forEach(([id, name]) => {
            if (id !== this.socket?.id) {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'player';
                playerDiv.innerHTML = `
                    <span class="player-icon"><i class="fas fa-user"></i></span>
                    <span class="player-name">${name}</span>
                    <span class="player-score">${this.scores[id] || 0} pts</span>
                `;
                playerList.appendChild(playerDiv);
            }
        });
    }

    updateGameState(state) {
        this.gameState = state;
        const statusElement = document.getElementById('game-status');
        const overlay = document.getElementById('canvas-overlay');
        const wordElement = document.getElementById('word-to-guess');
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        switch(state) {
            case 'waiting':
                statusElement.textContent = 'Waiting for players...';
                overlay.classList.remove('hidden');
                overlay.querySelector('h3').textContent = 'Waiting for players to join...';
                wordElement.classList.add('hidden');
                messageInput.disabled = true;
                sendBtn.disabled = true;
                this.isCurrentDrawer = false;
                break;
                
            case 'drawing':
                if (this.isCurrentDrawer) {
                    statusElement.textContent = 'Your turn to draw!';
                    overlay.classList.add('hidden');
                    wordElement.classList.remove('hidden');
                    messageInput.disabled = true;
                    sendBtn.disabled = true;
                } else {
                    statusElement.textContent = 'Guess what is being drawn!';
                    overlay.classList.add('hidden');
                    wordElement.classList.add('hidden');
                    messageInput.disabled = false;
                    sendBtn.disabled = false;
                }
                break;
                
            case 'guessing':
                statusElement.textContent = 'Time\'s up! Guessing time...';
                messageInput.disabled = false;
                sendBtn.disabled = false;
                break;
                
            case 'ended':
                statusElement.textContent = 'Game Over!';
                break;
        }
    }

    setWordToDraw(word) {
        this.currentWord = word;
        this.isCurrentDrawer = true;
        
        document.getElementById('current-word').textContent = word;
        document.getElementById('word-to-guess').classList.remove('hidden');
        
        this.addMessage('system', `Your word to draw is: <strong>${word}</strong>`, 'system');
    }

    startRound(data) {
        const { drawerId, word, round, totalRounds, time } = data;
        
        this.isCurrentDrawer = this.socket.id === drawerId;
        this.currentWord = word;
        
        document.getElementById('round-number').textContent = round;
        
        if (this.isCurrentDrawer) {
            this.setWordToDraw(word);
        } else {
            document.getElementById('word-to-guess').classList.add('hidden');
            this.addMessage('system', `Someone is drawing... Try to guess what it is!`, 'system');
        }
        
        this.startTimer(time);
        this.updateGameState('drawing');
    }

    startTimer(seconds) {
        const timerElement = document.getElementById('timer');
        const timeElement = document.getElementById('time-left');
        
        let timeLeft = seconds;
        timerElement.textContent = timeLeft;
        
        const timer = setInterval(() => {
            timeLeft--;
            timerElement.textContent = timeLeft;
            
            if (timeLeft <= 10) {
                timeElement.classList.add('timer-warning');
                if (timeLeft <= 5) {
                    document.getElementById('time-sound').play();
                }
            }
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                timeElement.classList.remove('timer-warning');
                
                if (this.gameState === 'drawing') {
                    this.updateGameState('guessing');
                    this.addMessage('system', 'Time\'s up! Now guess the word!', 'system');
                    
                    // Auto-reveal after 10 seconds
                    setTimeout(() => {
                        if (this.gameState === 'guessing') {
                            this.addMessage('system', `The word was: <strong>${this.currentWord}</strong>`, 'system');
                            if (this.socket) {
                                this.socket.emit('nextRound');
                            }
                        }
                    }, 10000);
                }
            }
        }, 1000);
    }

    updateScoreboard(scores) {
        this.scores = scores;
        const scoreboard = document.getElementById('scoreboard');
        scoreboard.innerHTML = '';
        
        // Sort scores from high to low
        const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        
        sortedScores.forEach(([playerId, score]) => {
            const scoreDiv = document.createElement('div');
            scoreDiv.className = `score-item ${playerId === this.socket?.id ? 'current-player' : ''}`;
            scoreDiv.innerHTML = `
                <span class="score-name">${this.players[playerId] || 'Unknown'}</span>
                <span class="score-value">${score} pts</span>
            `;
            scoreboard.appendChild(scoreDiv);
        });
        
        this.updatePlayerList(this.players);
    }

    startGame() {
        if (this.socket) {
            this.socket.emit('startGame');
        }
    }

    endGame(winner) {
        this.updateGameState('ended');
        
        const winnerName = this.players[winner] || 'Someone';
        this.addMessage('system', `🎉 <strong>${winnerName}</strong> wins the game! 🏆`, 'system');
        
        // Show celebration
        document.getElementById('game-status').innerHTML = 
            `🎊 ${winnerName} Wins! 🎊`;
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    new DrawingGame();
});

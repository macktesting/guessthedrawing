class OfflineDrawingGame {
    constructor() {
        this.gameState = 'idle';
        this.currentWord = '';
        this.score = 0;
        this.round = 1;
        this.totalRounds = 5;
        this.timeLeft = 60;
        this.timer = null;
        
        // Setup initial
        this.setupTools();
    }

    init() {
        console.log('🎮 Initializing game...');
        
        // Setup canvas
        this.setupCanvas();
        
        // Load game data
        this.loadGameData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
        
        // Setup toastr
        this.setupToastr();
        
        console.log('✅ Game initialized successfully!');
        
        // Show welcome message
        setTimeout(() => {
            toastr.info('🎨 Welcome to Drawing Guessing Game!', 'Ready to Draw!', {
                timeOut: 3000
            });
        }, 1000);
    }

    setupCanvas() {
        this.canvas = document.getElementById('drawing-canvas');
        if (!this.canvas) {
            console.error('❌ Canvas element not found!');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        
        // Set initial canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Clear canvas
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set drawing settings
        this.ctx.lineWidth = 5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = '#000000';
        
        console.log('✅ Canvas setup complete');
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        }
    }

    setupEventListeners() {
        console.log('🔗 Setting up event listeners...');
        
        // Canvas drawing events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches[0]) this.startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches[0]) this.draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this.stopDrawing());
        
        // ====== FIXED: Bind buttons dengan cara yang benar ======
        
        // 1. New Game Button - PASTIKAN INI BEKERJA
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) {
            console.log('Found new-game-btn');
            newGameBtn.addEventListener('click', (e) => {
                console.log('🎮 New Game button clicked!');
                e.preventDefault();
                this.startNewGame();
            });
        } else {
            console.error('❌ new-game-btn NOT FOUND!');
        }
        
        // 2. Practice Mode Button
        const practiceBtn = document.getElementById('practice-btn');
        if (practiceBtn) {
            practiceBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startPracticeMode();
            });
        }
        
        // 3. Clear Canvas Button
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.clearCanvas();
            });
        }
        
        // 4. Undo/Redo Buttons
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.addEventListener('click', (e) => { e.preventDefault(); this.undo(); });
        if (redoBtn) redoBtn.addEventListener('click', (e) => { e.preventDefault(); this.redo(); });
        
        // 5. Drawing Tools
        const fillBtn = document.getElementById('fill-btn');
        const eraserBtn = document.getElementById('eraser-btn');
        const saveBtn = document.getElementById('save-btn');
        
        if (fillBtn) fillBtn.addEventListener('click', (e) => { e.preventDefault(); this.fillCanvas(); });
        if (eraserBtn) eraserBtn.addEventListener('click', (e) => { e.preventDefault(); this.toggleEraser(); });
        if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); this.saveDrawing(); });
        
        // 6. Color buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const color = e.currentTarget.getAttribute('data-color');
                if (color) {
                    this.currentColor = color;
                    this.ctx.strokeStyle = color;
                    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                }
            });
        });
        
        // 7. Brush size
        const brushSize = document.getElementById('brush-size');
        if (brushSize) {
            brushSize.addEventListener('input', (e) => {
                this.ctx.lineWidth = parseInt(e.target.value);
                document.getElementById('brush-size-value').textContent = e.target.value;
            });
        }
        
        console.log('✅ Event listeners setup complete');
    }

    startDrawing(e) {
        if (this.gameState !== 'drawing') return;
        
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        
        // Play sound if available
        this.playSound('draw-sound');
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        this.lastX = x;
        this.lastY = y;
    }

    stopDrawing() {
        this.isDrawing = false;
        this.ctx.closePath();
    }

    // ====== FIXED: Game Control Methods ======
    
    startNewGame() {
        console.log('🚀 Starting new game...');
        
        // Reset game state
        this.gameState = 'drawing';
        this.score = 0;
        this.timeLeft = 60;
        clearInterval(this.timer);
        
        // Get random word
        this.currentWord = this.getRandomWord();
        console.log('Word to draw:', this.currentWord);
        
        // Clear canvas
        this.clearCanvas();
        
        // Update UI
        this.updateUI();
        
        // Start timer
        this.startTimer();
        
        // Hide overlay
        const overlay = document.getElementById('canvas-overlay');
        if (overlay) overlay.classList.add('hidden');
        
        // Show success message
        toastr.success(`Draw: "${this.currentWord}"`, 'New Game Started!');
        
        // Play sound
        this.playSound('click-sound');
    }

    startPracticeMode() {
        console.log('🎨 Starting practice mode...');
        
        this.gameState = 'drawing';
        this.currentWord = 'Practice Mode - Draw Anything!';
        
        // Clear canvas
        this.clearCanvas();
        
        // Update UI
        this.updateUI();
        
        // Hide overlay
        const overlay = document.getElementById('canvas-overlay');
        if (overlay) overlay.classList.add('hidden');
        
        // No timer in practice
        clearInterval(this.timer);
        document.getElementById('timer').textContent = '∞';
        
        toastr.info('Practice mode started! Draw anything you like!');
    }

    clearCanvas() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.history = [];
        this.redoStack = [];
        
        toastr.info('Canvas cleared');
    }

    startTimer() {
        clearInterval(this.timer);
        this.timeLeft = 60;
        
        const timerElement = document.getElementById('timer');
        if (!timerElement) return;
        
        timerElement.textContent = this.timeLeft;
        
        this.timer = setInterval(() => {
            this.timeLeft--;
            timerElement.textContent = this.timeLeft;
            
            if (this.timeLeft <= 10) {
                timerElement.classList.add('timer-warning');
            }
            
            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.endRound();
            }
        }, 1000);
    }

    // ====== Helper Methods ======
    
    setupTools() {
        this.wordBank = {
            easy: ['Cat', 'Dog', 'Sun', 'House', 'Tree', 'Car', 'Ball', 'Fish'],
            medium: ['Dragon', 'Castle', 'Rocket', 'Butterfly', 'Mountain', 'Rainbow'],
            hard: ['Time Machine', 'Solar System', 'Neural Network', 'Ancient Temple']
        };
        
        this.colorNames = {
            '#000000': 'Black',
            '#e74c3c': 'Red',
            '#3498db': 'Blue',
            '#2ecc71': 'Green',
            '#f1c40f': 'Yellow'
        };
    }

    getRandomWord() {
        const words = this.wordBank.medium;
        return words[Math.floor(Math.random() * words.length)];
    }

    updateUI() {
        // Update word display
        const wordElement = document.getElementById('current-word');
        if (wordElement) {
            wordElement.textContent = this.currentWord;
        }
        
        // Update score
        const scoreElement = document.getElementById('score');
        if (scoreElement) {
            scoreElement.textContent = this.score;
        }
        
        // Update timer
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = this.timeLeft;
        }
    }

    playSound(soundId) {
        const sound = document.getElementById(soundId);
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log('Sound play failed:', e));
        }
    }

    setupToastr() {
        if (typeof toastr !== 'undefined') {
            toastr.options = {
                positionClass: "toast-top-right",
                timeOut: 3000,
                closeButton: true
            };
        }
    }

    loadGameData() {
        // Simple load for now
        console.log('Loading game data...');
    }

    // Stub methods for other features
    undo() { toastr.info('Undo'); }
    redo() { toastr.info('Redo'); }
    fillCanvas() { toastr.info('Fill canvas'); }
    toggleEraser() { toastr.info('Toggle eraser'); }
    saveDrawing() { toastr.info('Save drawing'); }
    endRound() { toastr.info('Round ended'); }
}

// ====== FIXED: Initialize Game Properly ======
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM fully loaded and parsed');
    
    // Initialize toastr first
    if (typeof toastr !== 'undefined') {
        toastr.options = {
            positionClass: "toast-top-right",
            timeOut: 3000,
            closeButton: true
        };
    }
    
    // Create and initialize game
    try {
        window.drawingGame = new OfflineDrawingGame();
        window.drawingGame.init();
        
        console.log('🎉 Game loaded successfully!');
        console.log('👉 Click "New Game" to start drawing!');
        
    } catch (error) {
        console.error('❌ Error loading game:', error);
        alert('Error loading game. Please check console.');
    }
});

// Fallback in case DOMContentLoaded already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (!window.drawingGame) {
            console.log('📄 DOM already loaded, initializing game...');
            window.drawingGame = new OfflineDrawingGame();
            window.drawingGame.init();
        }
    }, 100);
          }

class MultiplayerQuiz {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.roomId = null;
        this.playerName = null;
        this.isHost = false;
        this.gameState = 'waiting';
        this.currentQuestion = null;
        this.selectedAnswer = null;
        this.scores = [];

        this.initializeElements();
        this.attachEventListeners();
    }

    initializeElements() {
        // Screens
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.roomListScreen = document.getElementById('roomListScreen');
        this.joinRoomScreen = document.getElementById('joinRoomScreen');
        this.lobbyScreen = document.getElementById('lobbyScreen');
        this.gameScreen = document.getElementById('gameScreen');
        this.resultsScreen = document.getElementById('resultsScreen');

        // Buttons
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.backToWelcomeBtn = document.getElementById('backToWelcomeBtn');
        this.backToWelcomeBtn2 = document.getElementById('backToWelcomeBtn2');
        this.joinSpecificRoomBtn = document.getElementById('joinSpecificRoomBtn');
        this.startGameBtn = document.getElementById('startGameBtn');
        this.leaveLobbyBtn = document.getElementById('leaveLobbyBtn');
        this.backToLobbyBtn = document.getElementById('backToLobbyBtn');
        this.leaveGameBtn = document.getElementById('leaveGameBtn');

        // Inputs
        this.playerNameInput = document.getElementById('playerName');
        this.roomIdInput = document.getElementById('roomId');
        this.roomIdDisplay = document.getElementById('roomIdDisplay');

        // Game elements
        this.questionText = document.getElementById('questionText');
        this.optionsContainer = document.getElementById('optionsContainer');
        this.timerElement = document.getElementById('timer');
        this.playersContainer = document.getElementById('playersContainer');
        this.scoreboardList = document.getElementById('scoreboardList');
        this.finalScores = document.getElementById('finalScores');
        this.playerCount = document.getElementById('playerCount');
        this.answerStatus = document.getElementById('answerStatus');
        this.roomsContainer = document.getElementById('roomsContainer');
        this.notification = document.getElementById('notification');
    }

    attachEventListeners() {
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.showRoomList());
        this.backToWelcomeBtn.addEventListener('click', () => this.showScreen('welcomeScreen'));
        this.backToWelcomeBtn2.addEventListener('click', () => this.showScreen('welcomeScreen'));
        this.joinSpecificRoomBtn.addEventListener('click', () => this.joinRoom());
        this.startGameBtn.addEventListener('click', () => this.startGame());
        this.leaveLobbyBtn.addEventListener('click', () => this.leaveRoom());
        this.backToLobbyBtn.addEventListener('click', () => this.backToLobby());
        this.leaveGameBtn.addEventListener('click', () => this.leaveRoom());
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            this.showNotification('Connected to server', 'success');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.socket.onclose = () => {
            this.showNotification('Disconnected from server', 'error');
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleMessage(data) {
        console.log('Received:', data);
        
        switch (data.type) {
            case 'room_created':
                this.playerId = data.playerId;
                this.roomId = data.roomId;
                this.isHost = data.isHost;
                this.updateLobby(data.players);
                this.showScreen('lobbyScreen');
                break;

            case 'room_joined':
                this.playerId = data.playerId;
                this.roomId = data.roomId;
                this.isHost = data.isHost;
                this.updateLobby(data.players);
                this.showScreen('lobbyScreen');
                break;

            case 'player_joined':
                this.updateLobby(data.players);
                break;

            case 'player_left':
                this.updateLobby(data.players);
                break;

            case 'game_started':
                this.gameState = 'playing';
                this.showScreen('gameScreen');
                break;

            case 'new_question':
                this.currentQuestion = data.question;
                this.selectedAnswer = null;
                this.displayQuestion(data.question);
                break;

            case 'timer_update':
                this.updateTimer(data.timeRemaining);
                break;

            case 'answer_received':
                this.showAnswerFeedback(data.isCorrect);
                break;

            case 'answer_reveal':
                this.revealAnswers(data.correctAnswer, data.playerAnswers);
                this.updateScoreboard(data.scores);
                break;

            case 'game_ended':
                this.showResults(data.scores);
                this.showScreen('resultsScreen');
                break;

            case 'error':
                this.showNotification(data.message, 'error');
                break;
        }
    }

    showScreen(screenName) {
        const screens = [
            'welcomeScreen',
            'roomListScreen',
            'joinRoomScreen',
            'lobbyScreen',
            'gameScreen',
            'resultsScreen'
        ];

        screens.forEach(screen => {
            document.getElementById(screen).classList.remove('active');
        });

        document.getElementById(screenName).classList.add('active');
    }

    async showRoomList() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) {
            this.showNotification('Please enter your name', 'error');
            return;
        }

        try {
            const response = await fetch('/api/rooms');
            const rooms = await response.json();
            this.displayRooms(rooms);
            this.showScreen('roomListScreen');
        } catch (error) {
            this.showNotification('Failed to load rooms', 'error');
        }
    }

    displayRooms(rooms) {
        this.roomsContainer.innerHTML = '';
        
        if (rooms.length === 0) {
            this.roomsContainer.innerHTML = '<p>No active rooms available. Create one!</p>';
            return;
        }

        rooms.forEach(room => {
            const roomCard = document.createElement('div');
            roomCard.className = 'room-card';
            roomCard.innerHTML = `
                <h3>Room: ${room.id}</h3>
                <p>Players: ${room.playerCount}/${room.maxPlayers}</p>
            `;
            roomCard.addEventListener('click', () => {
                this.roomIdInput.value = room.id;
                this.joinRoom();
            });
            this.roomsContainer.appendChild(roomCard);
        });
    }

    createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) {
            this.showNotification('Please enter your name', 'error');
            return;
        }

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'create_room',
                playerName: this.playerName
            }));
        } else {
            this.showNotification('Not connected to server', 'error');
        }
    }

    joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        const roomId = this.roomIdInput.value.trim();
        
        if (!this.playerName) {
            this.showNotification('Please enter your name', 'error');
            return;
        }
        
        if (!roomId) {
            this.showNotification('Please enter room ID', 'error');
            return;
        }

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'join_room',
                roomId: roomId,
                playerName: this.playerName
            }));
        } else {
            this.showNotification('Not connected to server', 'error');
        }
    }

    updateLobby(players) {
        this.roomIdDisplay.textContent = this.roomId;
        this.playerCount.textContent = players.length;
        
        this.playersContainer.innerHTML = '';
        players.forEach(player => {
            const playerTag = document.createElement('div');
            playerTag.className = `player-tag ${player.id === this.playerId ? 'current-player' : ''}`;
            if (player.id === this.playerId) {
                playerTag.classList.add('host');
            }
            playerTag.textContent = player.name + (player.id === this.playerId ? ' (You)' : '');
            this.playersContainer.appendChild(playerTag);
        });

        // Enable start button for host if there are at least 2 players
        if (this.isHost && players.length >= 1) {
            this.startGameBtn.disabled = false;
        } else {
            this.startGameBtn.disabled = true;
        }
    }

    startGame() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'start_game'
            }));
        }
    }

    leaveRoom() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'leave_room'
            }));
        }
        this.resetGame();
        this.showScreen('welcomeScreen');
    }

    backToLobby() {
        this.showScreen('lobbyScreen');
    }

    displayQuestion(question) {
        this.questionText.textContent = `Question ${question.questionNumber}/${question.totalQuestions}: ${question.question}`;
        
        this.optionsContainer.innerHTML = '';
        question.options.forEach((option, index) => {
            const button = document.createElement('button');
            button.className = 'option-btn';
            button.textContent = option;
            button.addEventListener('click', () => this.selectAnswer(index));
            this.optionsContainer.appendChild(button);
        });

        this.timerElement.textContent = question.timeLimit;
        this.timerElement.classList.remove('low');
        this.answerStatus.innerHTML = '';
    }

    selectAnswer(answerIndex) {
        if (this.selectedAnswer !== null) return;
        
        this.selectedAnswer = answerIndex;
        
        // Highlight selected answer
        const buttons = this.optionsContainer.querySelectorAll('.option-btn');
        buttons.forEach((btn, index) => {
            btn.classList.toggle('selected', index === answerIndex);
        });

        // Send answer to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'submit_answer',
                answerIndex: answerIndex
            }));
        }
    }

    updateTimer(time) {
        this.timerElement.textContent = time;
        
        if (time <= 5) {
            this.timerElement.classList.add('low');
        }
    }

    showAnswerFeedback(isCorrect) {
        this.answerStatus.innerHTML = `
            <div class="notification ${isCorrect ? 'success' : 'error'} show">
                ${isCorrect ? '✅ Correct!' : '❌ Wrong answer!'}
            </div>
        `;
    }

    revealAnswers(correctAnswer, playerAnswers) {
        const buttons = this.optionsContainer.querySelectorAll('.option-btn');
        
        // Highlight correct answer
        buttons[correctAnswer].classList.add('correct');
        
        // Highlight incorrect selected answers
        playerAnswers.forEach(playerAnswer => {
            if (!playerAnswer.isCorrect && playerAnswer.answer !== null) {
                buttons[playerAnswer.answer].classList.add('incorrect');
            }
        });
    }

    updateScoreboard(scores) {
        this.scores = scores;
        this.scoreboardList.innerHTML = '';
        
        scores.sort((a, b) => b.score - a.score).forEach((score, index) => {
            const scoreItem = document.createElement('div');
            scoreItem.className = `score-item ${score.playerId === this.playerId ? 'current-player' : ''}`;
            scoreItem.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="rank">${index + 1}</div>
                    <span>${score.playerName} ${score.playerId === this.playerId ? '(You)' : ''}</span>
                </div>
                <span>${score.score} points</span>
            `;
            this.scoreboardList.appendChild(scoreItem);
        });
    }

    showResults(scores) {
        this.finalScores.innerHTML = '';
        
        scores.forEach((score, index) => {
            const scoreItem = document.createElement('div');
            scoreItem.className = `score-item ${score.playerId === this.playerId ? 'current-player' : ''}`;
            scoreItem.style.padding = '20px';
            scoreItem.style.margin = '10px 0';
            scoreItem.style.background = index === 0 ? '#fff3cd' : '#f8f9fa';
            scoreItem.style.borderRadius = '10px';
            scoreItem.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="rank" style="background: ${index === 0 ? '#ffc107' : index === 1 ? '#6c757d' : index === 2 ? '#cd7f32' : '#667eea'}">
                        ${index + 1}
                    </div>
                    <div>
                        <h3 style="margin: 0;">${score.playerName} ${score.playerId === this.playerId ? '(You)' : ''}</h3>
                        <p style="margin: 5px 0 0 0; color: #666;">${score.score} points</p>
                    </div>
                </div>
                ${index === 0 ? '<span style="color: #ffc107; font-weight: bold;">🏆 Winner!</span>' : ''}
            `;
            this.finalScores.appendChild(scoreItem);
        });
    }

    showNotification(message, type = 'info') {
        this.notification.textContent = message;
        this.notification.className = `notification ${type} show`;
        
       
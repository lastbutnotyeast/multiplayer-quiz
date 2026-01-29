const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store game rooms and players
const rooms = new Map();
const players = new Map();

// Sample quiz questions
const quizQuestions = [
    {
        id: 1,
        question: "What is the capital of France?",
        options: ["London", "Berlin", "Paris", "Madrid"],
        correctAnswer: 2,
        timeLimit: 10
    },
    {
        id: 2,
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Saturn"],
        correctAnswer: 1,
        timeLimit: 10
    },
    {
        id: 3,
        question: "What is 5 + 7?",
        options: ["10", "11", "12", "13"],
        correctAnswer: 2,
        timeLimit: 8
    }
];

class GameRoom {
    constructor(roomId, hostId) {
        this.id = roomId;
        this.hostId = hostId;
        this.players = new Map();
        this.gameState = 'waiting'; // waiting, playing, ended
        this.currentQuestion = 0;
        this.scores = new Map();
        this.answers = new Map();
        this.timer = null;
        this.timeRemaining = 0;
        this.maxPlayers = 4;
    }

    addPlayer(playerId, playerName) {
        if (this.players.size >= this.maxPlayers) return false;
        this.players.set(playerId, playerName);
        this.scores.set(playerId, 0);
        return true;
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
        this.scores.delete(playerId);
    }

    startGame() {
        if (this.players.size < 1) return false;
        this.gameState = 'playing';
        this.currentQuestion = 0;
        this.broadcastToRoom({
            type: 'game_started',
            players: Array.from(this.players.entries()).map(([id, name]) => ({ id, name }))
        });
        this.nextQuestion();
        return true;
    }

    nextQuestion() {
        if (this.currentQuestion >= quizQuestions.length) {
            this.endGame();
            return;
        }

        clearTimeout(this.timer);
        
        const question = quizQuestions[this.currentQuestion];
        this.timeRemaining = question.timeLimit;
        this.answers.clear();

        this.broadcastToRoom({
            type: 'new_question',
            question: {
                ...question,
                questionNumber: this.currentQuestion + 1,
                totalQuestions: quizQuestions.length
            },
            timeLimit: question.timeLimit
        });

        this.timer = setInterval(() => {
            this.timeRemaining--;
            
            this.broadcastToRoom({
                type: 'timer_update',
                timeRemaining: this.timeRemaining
            });

            if (this.timeRemaining <= 0) {
                clearInterval(this.timer);
                this.revealAnswer();
                setTimeout(() => {
                    this.currentQuestion++;
                    this.nextQuestion();
                }, 3000);
            }
        }, 1000);
    }

    submitAnswer(playerId, answerIndex) {
        const question = quizQuestions[this.currentQuestion];
        const isCorrect = answerIndex === question.correctAnswer;
        
        if (isCorrect) {
            const points = Math.max(1, this.timeRemaining);
            const currentScore = this.scores.get(playerId) || 0;
            this.scores.set(playerId, currentScore + points);
        }

        this.answers.set(playerId, {
            answer: answerIndex,
            isCorrect: isCorrect,
            timeSubmitted: Date.now()
        });

        // Check if all players answered
        if (this.answers.size === this.players.size) {
            clearInterval(this.timer);
            setTimeout(() => {
                this.revealAnswer();
                setTimeout(() => {
                    this.currentQuestion++;
                    this.nextQuestion();
                }, 3000);
            }, 500);
        }

        // Send confirmation to player
        const playerWs = players.get(playerId);
        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
            playerWs.send(JSON.stringify({
                type: 'answer_received',
                isCorrect: isCorrect
            }));
        }
    }

    revealAnswer() {
        const question = quizQuestions[this.currentQuestion];
        const playerAnswers = Array.from(this.answers.entries()).map(([playerId, answer]) => ({
            playerId: playerId,
            playerName: this.players.get(playerId),
            answer: answer.answer,
            isCorrect: answer.isCorrect
        }));

        this.broadcastToRoom({
            type: 'answer_reveal',
            correctAnswer: question.correctAnswer,
            playerAnswers: playerAnswers,
            scores: Array.from(this.scores.entries()).map(([id, score]) => ({
                playerId: id,
                playerName: this.players.get(id),
                score: score
            }))
        });
    }

    endGame() {
        clearTimeout(this.timer);
        this.gameState = 'ended';
        
        const finalScores = Array.from(this.scores.entries())
            .map(([id, score]) => ({
                playerId: id,
                playerName: this.players.get(id),
                score: score
            }))
            .sort((a, b) => b.score - a.score);

        this.broadcastToRoom({
            type: 'game_ended',
            scores: finalScores
        });
    }

    broadcastToRoom(message) {
        for (const [playerId] of this.players) {
            const playerWs = players.get(playerId);
            if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                playerWs.send(JSON.stringify(message));
            }
        }
    }
}

wss.on('connection', (ws) => {
    const playerId = uuidv4();
    let currentRoom = null;
    let playerName = null;

    players.set(playerId, ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join_room':
                    playerName = data.playerName;
                    
                    let room = rooms.get(data.roomId);
                    if (!room) {
                        room = new GameRoom(data.roomId, playerId);
                        rooms.set(data.roomId, room);
                    }
                    
                    if (room.addPlayer(playerId, playerName)) {
                        currentRoom = room;
                        ws.send(JSON.stringify({
                            type: 'room_joined',
                            roomId: data.roomId,
                            playerId: playerId,
                            isHost: room.hostId === playerId,
                            players: Array.from(room.players.entries()).map(([id, name]) => ({ id, name }))
                        }));
                        
                        // Notify other players
                        room.broadcastToRoom({
                            type: 'player_joined',
                            playerId: playerId,
                            playerName: playerName,
                            players: Array.from(room.players.entries()).map(([id, name]) => ({ id, name }))
                        });
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room is full or does not exist'
                        }));
                    }
                    break;

                case 'start_game':
                    if (currentRoom && currentRoom.hostId === playerId) {
                        currentRoom.startGame();
                    }
                    break;

                case 'submit_answer':
                    if (currentRoom && currentRoom.gameState === 'playing') {
                        currentRoom.submitAnswer(playerId, data.answerIndex);
                    }
                    break;

                case 'create_room':
                    const newRoomId = uuidv4().slice(0, 8);
                    playerName = data.playerName;
                    const newRoom = new GameRoom(newRoomId, playerId);
                    rooms.set(newRoomId, newRoom);
                    
                    if (newRoom.addPlayer(playerId, playerName)) {
                        currentRoom = newRoom;
                        ws.send(JSON.stringify({
                            type: 'room_created',
                            roomId: newRoomId,
                            playerId: playerId,
                            isHost: true,
                            players: [{ id: playerId, name: playerName }]
                        }));
                    }
                    break;

                case 'leave_room':
                    if (currentRoom) {
                        currentRoom.removePlayer(playerId);
                        if (currentRoom.players.size === 0) {
                            rooms.delete(currentRoom.id);
                        } else {
                            currentRoom.broadcastToRoom({
                                type: 'player_left',
                                playerId: playerId,
                                players: Array.from(currentRoom.players.entries()).map(([id, name]) => ({ id, name }))
                            });
                        }
                        currentRoom = null;
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        if (currentRoom) {
            currentRoom.removePlayer(playerId);
            if (currentRoom.players.size === 0) {
                rooms.delete(currentRoom.id);
            } else {
                currentRoom.broadcastToRoom({
                    type: 'player_left',
                    playerId: playerId,
                    players: Array.from(currentRoom.players.entries()).map(([id, name]) => ({ id, name }))
                });
            }
        }
        players.delete(playerId);
    });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get active rooms
app.get('/api/rooms', (req, res) => {
    const activeRooms = Array.from(rooms.entries())
        .filter(([id, room]) => room.gameState === 'waiting' && room.players.size < room.maxPlayers)
        .map(([id, room]) => ({
            id: id,
            host: room.hostId,
            playerCount: room.players.size,
            maxPlayers: room.maxPlayers
        }));
    res.json(activeRooms);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        players: players.size
    });
});

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Public directory: ${path.join(__dirname, 'public')}`);
});
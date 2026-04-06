import React, {useEffect, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {io} from 'socket.io-client';
import {Header} from './components/Header.jsx';
import {ToastHub, useToasts} from './components/ToastHub.jsx';
import {GradientBackground} from './components/GradientBackground.jsx';
import {AuthCard} from './components/AuthCard.jsx';
import {ProfileCard} from './components/ProfileCard.jsx';
import {QuizListCard} from './components/QuizListCard.jsx';
import {CreateQuizCard} from './components/CreateQuizCard.jsx';
import {JoinCard} from './components/JoinCard.jsx';
import {HistoryCard} from './components/HistoryCard.jsx';
import {WaitingCard} from './components/WaitingCard.jsx';
import {QuestionCard} from './components/QuestionCard.jsx';
import {ResultsCard} from './components/ResultsCard.jsx';
import {request, toRuError, WS_URL} from './api/client.js';
import {useStoredState} from './hooks/useStoredState.js';
import {useCardHeight} from './hooks/useCardHeight.js';

const STORAGE_KEY = 'quiz_app_state_v1';

export function App() {
    const stored = useStoredState(STORAGE_KEY, {});
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [user, setUser] = useState(null);
    const [view, setView] = useState(stored.view || 'auth');
    const [dashboard, setDashboard] = useState(null);
    const [quizList, setQuizList] = useState([]);
    const [session, setSession] = useState(stored.session || null);
    const [currentQuestion, setCurrentQuestion] = useState(stored.currentQuestion || null);
    const [leaderboard, setLeaderboard] = useState(stored.leaderboard || []);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [questionEndsAt, setQuestionEndsAt] = useState(null);
    const [editingQuiz, setEditingQuiz] = useState(null);
    const [createdDraftQuizId, setCreatedDraftQuizId] = useState(null);
    const [participantCount, setParticipantCount] = useState(0);
    const [answerStats, setAnswerStats] = useState(stored.answerStats || {
        answeredPlayers: 0,
        totalPlayers: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        correctPercent: 0,
        wrongPercent: 0
    });
    const {toasts, pushToast, removeToast} = useToasts();

    const socketRef = useRef(null);
    const [uiReady, setUiReady] = useState(false);
    const {cardContentRef, cardHeight, viewportHeight, recalculateCardHeight} = useCardHeight([view, quizList, dashboard, currentQuestion, leaderboard, participantCount, answerStats, editingQuiz]);

    useEffect(() => {
        document.body.dataset.theme = theme;
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        const timer = setTimeout(() => setUiReady(true), 0);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!token) return;
        localStorage.setItem('token', token);
        request('/api/auth/me', 'GET', token)
            .then(({user: me}) => {
                setUser(me);
                setView((prev) => (prev === 'auth' ? 'profile' : prev));
            })
            .catch(() => {
                localStorage.removeItem('token');
                setToken(null);
                setUser(null);
            });
    }, [token]);

    useEffect(() => {
        if (!token) {
            setView('auth');
        }
    }, [token]);

    useEffect(() => {
        if (!token) {
            socketRef.current?.disconnect();
            socketRef.current = null;
            return undefined;
        }

        const socket = io(WS_URL, {
            auth: {token},
            transports: ['websocket'],
            autoConnect: true,
            reconnectionAttempts: 5
        });

        socketRef.current = socket;

        socket.on('session:started', ({question, durationSec, startedAt}) => {
            setView('quiz');
            setCurrentQuestion(question);
            const endTs = startedAt + ((durationSec || question?.timeLimitSec || 20) * 1000);
            setQuestionEndsAt(endTs);
        });
        socket.on('session:question', ({question, durationSec, startedAt}) => {
            setCurrentQuestion(question);
            const endTs = startedAt + ((durationSec || question?.timeLimitSec || 20) * 1000);
            setQuestionEndsAt(endTs);
        });
        socket.on('session:answer-stats', (stats) => {
            setAnswerStats(stats);
        });
        socket.on('session:participant-count', ({totalPlayers}) => setParticipantCount(totalPlayers));
        socket.on('session:leaderboard-update', ({leaderboard: rows}) => setLeaderboard(rows));
        socket.on('session:finished', ({leaderboard: rows}) => {
            setLeaderboard(rows);
            setView('results');
            setSession(null);
            setQuestionEndsAt(null);
            pushToast('Квиз завершен. Показан итоговый лидерборд.', 'info');
        });
        socket.on('session:cancelled', () => {
            setSession(null);
            setQuestionEndsAt(null);
            setView('profile');
            pushToast('Организатор отменил квиз. Вы возвращены на главный экран.', 'info');
        });

        socket.on('connect_error', (error) => {
            pushToast(`Ошибка WebSocket: ${toRuError(error.message)}`, 'error');
        });

        return () => {
            socket.disconnect();
            if (socketRef.current === socket) {
                socketRef.current = null;
            }
        };
    }, [token, pushToast]);

    useEffect(() => {
        if (view !== 'quiz' || !questionEndsAt) return;
        const tick = () => setSecondsLeft(Math.max(0, Math.ceil((questionEndsAt - Date.now()) / 1000)));
        tick();
        const timer = setInterval(tick, 250);
        document.addEventListener('visibilitychange', tick);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [view, questionEndsAt]);

    useEffect(() => {
        if (!token || !session?.roomCode) return;
        const socket = socketRef.current;
        if (!socket) return;

        const joinCurrentRoom = () => {
            socket.emit('session:join-room', {roomCode: session.roomCode}, (ack) => {
                if (!ack?.ok) return;
                setSession((prev) => ({...prev, ...ack.session}));
                if (ack.session.currentQuestion) {
                    setCurrentQuestion(ack.session.currentQuestion);
                    setView('quiz');
                    const remaining = ack.session.remainingSec || ack.session.currentQuestion.timeLimitSec || 20;
                    setQuestionEndsAt(Date.now() + remaining * 1000);
                } else if (ack.session.status === 'WAITING') {
                    setView('waiting');
                }
            });
        };

        if (socket.connected) {
            joinCurrentRoom();
            return undefined;
        }

        socket.once('connect', joinCurrentRoom);
        return () => socket.off('connect', joinCurrentRoom);
    }, [token, session?.roomCode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            view,
            session,
            currentQuestion,
            leaderboard,
            secondsLeft,
            questionEndsAt,
            answerStats
        }));
    }, [view, session, currentQuestion, leaderboard, secondsLeft, questionEndsAt, answerStats]);

    useEffect(() => {
        if (view === 'history' || view === 'profile' || view === 'quiz-list') {
            loadDashboard();
        }
    }, [view]);

    const onLogin = async (payload, isRegister) => {
        try {
            if (isRegister) {
                const data = await request('/api/auth/register', 'POST', null, {
                    email: payload.email,
                    password: payload.password,
                    displayName: payload.displayName,
                    role: payload.role
                });
                setToken(data.token);
                setUser(data.user);
                setView('profile');
                pushToast('Аккаунт создан', 'success');
                return;
            }
            const data = await request('/api/auth/login', 'POST', null, payload);
            setToken(data.token);
            setUser(data.user);
            setView('profile');
            pushToast('Успешный вход в систему', 'success');
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
        }
    };

    const loadDashboard = async () => {
        if (!token) return;
        try {
            const [dash, quizzes] = await Promise.all([
                request('/api/profile/dashboard', 'GET', token),
                request('/api/quizzes', 'GET', token)
            ]);
            setDashboard(dash);
            setQuizList(quizzes);
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
        }
    };

    useEffect(() => {
        loadDashboard();
    }, [token]);

    const joinByCode = async (roomCode) => {
        try {
            const data = await request('/api/sessions/join', 'POST', token, {roomCode});
            setSession(data.session);
            setView('waiting');
            socketRef.current?.emit('session:join-room', {roomCode}, (ack) => {
                if (!ack.ok) pushToast(toRuError(ack.error), 'error');
            });
            pushToast('Подключение к комнате выполнено', 'success');
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
        }
    };

    const launchSession = async (quizId) => {
        try {
            const created = await request(`/api/sessions/launch/${quizId}`, 'POST', token);
            setSession(created);
            setView('waiting');
            socketRef.current?.emit('session:join-room', {roomCode: created.roomCode});
            pushToast(`Сессия запущена. Код комнаты: ${created.roomCode}`, 'success');
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
        }
    };

    const createQuiz = async (payload) => {
        try {
            const created = await request('/api/quizzes', 'POST', token, payload);
            setEditingQuiz(created);
            setCreatedDraftQuizId(created.id);
            setView('create-quiz');
            await loadDashboard();
            pushToast('Квиз создан. Добавьте вопросы и опубликуйте.', 'success');
            return created;
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
            return null;
        }
    };

    const addQuestionToQuiz = async (quizId, payload) => {
        try {
            await request(`/api/quizzes/${quizId}/questions`, 'POST', token, payload);
            const quiz = await request(`/api/quizzes/${quizId}`, 'GET', token);
            setEditingQuiz(quiz);
            await loadDashboard();
            pushToast('Вопрос добавлен', 'success');
            return true;
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
            return false;
        }
    };

    const updateQuestionInQuiz = async (quizId, questionId, payload) => {
        try {
            await request(`/api/quizzes/${quizId}/questions/${questionId}`, 'PATCH', token, payload);
            const quiz = await request(`/api/quizzes/${quizId}`, 'GET', token);
            setEditingQuiz(quiz);
            await loadDashboard();
            pushToast('Вопрос обновлен', 'success');
            return true;
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
            return false;
        }
    };

    const deleteQuestionFromQuiz = async (quizId, questionId) => {
        try {
            await request(`/api/quizzes/${quizId}/questions/${questionId}`, 'DELETE', token);
            const quiz = await request(`/api/quizzes/${quizId}`, 'GET', token);
            setEditingQuiz(quiz);
            await loadDashboard();
            pushToast('Вопрос удален', 'success');
            return true;
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
            return false;
        }
    };

    const publishQuiz = async (quizId) => {
        try {
            const updated = await request(`/api/quizzes/${quizId}`, 'PATCH', token, {status: 'PUBLISHED'});
            setEditingQuiz(updated);
            if (createdDraftQuizId === quizId) {
                setCreatedDraftQuizId(null);
            }
            await loadDashboard();
            pushToast('Квиз опубликован', 'success');
            setView('quizzes');
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
        }
    };

    const deleteQuiz = async (quizId) => {
        try {
            await request(`/api/quizzes/${quizId}`, 'DELETE', token);
            if (createdDraftQuizId === quizId) {
                setCreatedDraftQuizId(null);
            }
            await loadDashboard();
            pushToast('Квиз удален из списка активных', 'success');
            setView('quizzes');
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
        }
    };

    const openQuizEditor = async (quizId) => {
        try {
            const fullQuiz = await request(`/api/quizzes/${quizId}`, 'GET', token);
            setEditingQuiz(fullQuiz);
            setCreatedDraftQuizId(null);
            setView('create-quiz');
        } catch (e) {
            pushToast(toRuError(e.message), 'error');
        }
    };

    const backFromQuizEditor = async () => {
        if (editingQuiz?.id && editingQuiz.id === createdDraftQuizId) {
            try {
                await request(`/api/quizzes/${editingQuiz.id}`, 'DELETE', token);
                await loadDashboard();
                pushToast('Черновик квиза удален', 'info');
            } catch (e) {
                pushToast(toRuError(e.message), 'error');
                return;
            }
        }
        setEditingQuiz(null);
        setCreatedDraftQuizId(null);
        setView('quizzes');
    };

    const startQuiz = () => socketRef.current?.emit('session:start', {sessionId: session.id}, (ack) => !ack.ok && pushToast(toRuError(ack.error), 'error'));
    const cancelQuiz = () => socketRef.current?.emit('session:cancel', {sessionId: session.id}, (ack) => {
        if (!ack.ok) return pushToast(toRuError(ack.error), 'error');
        setSession(null);
        setView('profile');
    });
    const leaveQuiz = () => socketRef.current?.emit('session:leave', {sessionId: session.id}, (ack) => {
        if (!ack.ok) return pushToast(toRuError(ack.error), 'error');
        setSession(null);
        setCurrentQuestion(null);
        setQuestionEndsAt(null);
        setView('profile');
        pushToast('Вы вышли из квиза', 'info');
    });
    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
        setSession(null);
        setCurrentQuestion(null);
        setQuestionEndsAt(null);
        setView('auth');
    };
    const submitAnswer = (optionIds) => socketRef.current?.emit('session:submit-answer', {
        sessionId: session.id,
        questionId: currentQuestion.id,
        optionIds
    }, (ack) => {
        if (!ack.ok) return pushToast(toRuError(ack.error), 'error');
        pushToast('Ответ принят', 'success');
    });

    const activeQuiz = view === 'quiz';
    const isAuthView = view === 'auth';
    const cardOffsetY = isAuthView ? Math.max(0, (viewportHeight - (cardHeight || 0)) / 2 - 20) : 0;

    return (
        <div className={`app ${theme} ${uiReady ? 'ready' : 'no-transitions'}`}>
            <GradientBackground disabled={activeQuiz} theme={theme}/>
            <AnimatePresence initial={false}>
                {!isAuthView && <motion.div
                    key="app-header"
                    initial={{opacity: 0, y: -20, scale: 0.98}}
                    animate={{opacity: 1, y: 0, scale: 1}}
                    exit={{opacity: 0, y: -20, scale: 0.98}}
                    transition={{duration: 0.22, ease: 'easeOut'}}
                >
                    <Header
                        user={user}
                        session={session}
                        secondsLeft={secondsLeft}
                        activeQuiz={activeQuiz}
                        waiting={view === 'waiting'}
                        activeView={view === 'create-quiz' || view === 'quiz-list' ? 'quizzes' : view}
                        onNavigate={setView}
                        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                        theme={theme}
                        onLeaveQuiz={leaveQuiz}
                    />
                </motion.div>}
            </AnimatePresence>

            <main className={`content ${isAuthView ? 'auth-content' : ''}`}>
                <motion.section
                    className={`card ${isAuthView ? 'compact' : ''}`}
                    animate={{height: cardHeight || 'auto', y: cardOffsetY}}
                    transition={{type: 'spring', stiffness: 120, damping: 22}}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            ref={cardContentRef}
                            className="card-scroll"
                            key={view}
                            initial={{opacity: 0, y: 14}}
                            animate={{opacity: 1, y: 0}}
                            exit={{opacity: 0, y: -14}}
                            transition={{duration: 0.25}}
                        >
                            {view === 'auth' && <AuthCard onSubmit={onLogin} pushToast={pushToast}/>}
                            {view === 'profile' && <ProfileCard user={user} dashboard={dashboard} onLogout={logout}/>}
                            {view === 'quizzes' && <QuizListCard quizzes={quizList} user={user} onLaunch={launchSession}
                                                                 onEditQuiz={openQuizEditor} onDeleteQuiz={deleteQuiz}
                                                                 onCreateQuizClick={() => {
                                                                     setEditingQuiz(null);
                                                                     setCreatedDraftQuizId(null);
                                                                     setView('create-quiz');
                                                                 }}/>}
                            {view === 'join' && <JoinCard onJoin={joinByCode}/>}
                            {view === 'history' &&
                                <HistoryCard dashboard={dashboard} role={user?.role}
                                             onContentChange={recalculateCardHeight}/>}
                            {view === 'create-quiz' && <CreateQuizCard quiz={editingQuiz} onCreateQuiz={createQuiz}
                                                                       onAddQuestion={addQuestionToQuiz}
                                                                       onUpdateQuestion={updateQuestionInQuiz}
                                                                       onDeleteQuestion={deleteQuestionFromQuiz}
                                                                       onPublish={publishQuiz}
                                                                       onBack={backFromQuizEditor}/>}
                            {view === 'waiting' &&
                                <WaitingCard session={session} user={user} onStart={startQuiz} onCancel={cancelQuiz}
                                             onLeave={leaveQuiz} participantCount={participantCount}/>}
                            {view === 'quiz' && <QuestionCard question={currentQuestion}
                                                              totalQuestions={session?.quiz?.questionCount || 0}
                                                              onSubmit={submitAnswer} onLeave={leaveQuiz} user={user}
                                                              answerStats={answerStats}
                                                              onContentChange={recalculateCardHeight}/>}
                            {view === 'results' &&
                                <ResultsCard leaderboard={leaderboard}
                                             onBack={() => setView(user?.role === 'ORGANIZER' ? 'quizzes' : 'join')}
                                             user={user}/>}
                        </motion.div>
                    </AnimatePresence>
                </motion.section>
            </main>

            <ToastHub toasts={toasts} removeToast={removeToast}/>
        </div>
    );
}

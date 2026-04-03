import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {io} from 'socket.io-client';
import {Header} from './components/Header.jsx';
import {ToastHub, useToasts} from './components/ToastHub.jsx';
import {GradientBackground} from './components/GradientBackground.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const WS_URL = import.meta.env.VITE_WS_URL || API_URL;
const STORAGE_KEY = 'quiz_app_state_v1';

function readStoredState() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

async function request(path, method = 'GET', token, body) {
    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? {Authorization: `Bearer ${token}`} : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
}

function toRuError(message) {
    const map = {
        'Failed to fetch': 'Не удалось подключиться к серверу',
        'NetworkError when attempting to fetch resource.': 'Ошибка сети при обращении к серверу',
        'Invalid credentials': 'Неверный email или пароль',
        Unauthorized: 'Требуется авторизация',
        Forbidden: 'Недостаточно прав',
        'Quiz not found': 'Квиз не найден',
        'Session not found': 'Сессия не найдена',
        'Question must have at least one correct option': 'Укажите хотя бы один правильный вариант ответа'
    };
    return map[message] || message || 'Произошла ошибка';
}

export function App() {
    const stored = readStoredState();
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
    const cardContentRef = useRef(null);
    const [cardHeight, setCardHeight] = useState(null);
    const [uiReady, setUiReady] = useState(false);

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
                setToken(null);
                setUser(null);
            });
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

    useLayoutEffect(() => {
        if (!cardContentRef.current) return;
        const calculate = () => setCardHeight(Math.min(cardContentRef.current.scrollHeight + 2, window.innerHeight * 0.82));
        calculate();
        const observer = new ResizeObserver(calculate);
        observer.observe(cardContentRef.current);
        window.addEventListener('resize', calculate);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', calculate);
        };
    }, [view, quizList, dashboard, currentQuestion, leaderboard, participantCount, answerStats, editingQuiz]);

    useEffect(() => {
        if (view === 'history' || view === 'profile' || view === 'quiz-list') {
            loadDashboard();
        }
    }, [view]);

    const onLogin = async (payload, isRegister) => {
        try {
            if (isRegister) {
                const data = await request('/api/auth/register-confirm', 'POST', null, {
                    email: payload.email,
                    code: payload.code
                });
                setToken(data.token);
                setUser(data.user);
                setView('profile');
                pushToast('Аккаунт подтвержден и создан', 'success');
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

    return (
        <div className={`app ${theme} ${uiReady ? 'ready' : 'no-transitions'}`}>
            <GradientBackground disabled={activeQuiz} theme={theme}/>
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

            <main className="content">
                <motion.section className="card" animate={{height: cardHeight || 'auto'}}
                                transition={{type: 'spring', stiffness: 120, damping: 22}}>
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
                            {view === 'auth' && <AuthCard onSubmit={onLogin}/>}
                            {view === 'profile' && <ProfileCard user={user} dashboard={dashboard} onLogout={logout}/>}
                            {view === 'quizzes' && <QuizListCard quizzes={quizList} user={user} onLaunch={launchSession}
                                                                 onEditQuiz={openQuizEditor} onDeleteQuiz={deleteQuiz}
                                                                 onCreateQuizClick={() => {
                                                                     setEditingQuiz(null);
                                                                     setCreatedDraftQuizId(null);
                                                                     setView('create-quiz');
                                                                 }}/>}
                            {view === 'join' && <JoinCard onJoin={joinByCode}/>}
                            {view === 'history' && <HistoryCard dashboard={dashboard} role={user?.role}/>}
                            {view === 'create-quiz' && <CreateQuizCard quiz={editingQuiz} onCreateQuiz={createQuiz}
                                                                       onAddQuestion={addQuestionToQuiz}
                                                                       onUpdateQuestion={updateQuestionInQuiz}
                                                                       onDeleteQuestion={deleteQuestionFromQuiz}
                                                                       onPublish={publishQuiz}
                                                                       onBack={backFromQuizEditor}/>}
                            {view === 'waiting' &&
                                <WaitingCard session={session} user={user} onStart={startQuiz} onCancel={cancelQuiz}
                                             participantCount={participantCount}/>}
                            {view === 'quiz' && <QuestionCard question={currentQuestion}
                                                              totalQuestions={session?.quiz?.questionCount || 0}
                                                              onSubmit={submitAnswer} onLeave={leaveQuiz} user={user}
                                                              answerStats={answerStats}/>}
                            {view === 'results' &&
                                <ResultsCard leaderboard={leaderboard} onBack={() => setView('profile')}/>}
                        </motion.div>
                    </AnimatePresence>
                </motion.section>
            </main>

            <ToastHub toasts={toasts} removeToast={removeToast}/>
        </div>
    );
}

function AuthCard({onSubmit}) {
    const [isRegister, setRegister] = useState(false);
    const [step, setStep] = useState('init');
    const [form, setForm] = useState({email: '', password: '', displayName: '', role: 'PARTICIPANT', code: ''});
    const isWeakPassword = isRegister && step === 'init' && form.password.length > 0 && !/^(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(form.password);
    return <div>
        <div className="stack centered auth-card">
            <h2>{isRegister ? 'Регистрация' : 'Вход'}</h2>
            <form className="stack centered field-full" onSubmit={async (e) => {
                e.preventDefault();
                if (isRegister && step === 'init' && isWeakPassword) {
                    pushToast('Пароль должен быть не короче 8 символов и содержать строчные и заглавные буквы', 'error');
                    return;
                }
                if (isRegister && step === 'init') {
                    try {
                        await request('/api/auth/register-init', 'POST', null, form);
                        setStep('confirm');
                        pushToast('Код подтверждения отправлен', 'info');
                    } catch (error) {
                        pushToast(toRuError(error.message), 'error');
                    }
                    return;
                }
                onSubmit(form, isRegister);
            }}>
                {isRegister && step === 'init' &&
                    <input className="field-half" placeholder="Имя" value={form.displayName}
                           onChange={(e) => setForm({...form, displayName: e.target.value})} required/>}
                <input className="field-half" placeholder="Email" type="email" value={form.email}
                       onChange={(e) => setForm({...form, email: e.target.value})} required/>
                {!isRegister && <input className="field-half" placeholder="Пароль" type="password" value={form.password}
                                       onChange={(e) => setForm({...form, password: e.target.value})} required/>}
                {isRegister && step === 'init' && <>
                    <input className="field-half" placeholder="Пароль" type="password" value={form.password}
                           onChange={(e) => setForm({...form, password: e.target.value})} required/>
                    {isWeakPassword && <p className="error-text">Простой пароль</p>}
                    <CustomSelect
                        className="field-half"
                        value={form.role}
                        onChange={(value) => setForm({...form, role: value})}
                        options={[
                            {value: 'PARTICIPANT', label: 'Участник'},
                            {value: 'ORGANIZER', label: 'Организатор'}
                        ]}
                    />
                </>}
                {isRegister && step === 'confirm' &&
                    <input className="field-half" placeholder="Код подтверждения из email" value={form.code}
                           onChange={(e) => setForm({...form, code: e.target.value})} required/>}
                <button>{isRegister && step === 'init' ? 'Отправить код' : 'Продолжить'}</button>
            </form>
            <button type="button" className="link-button" onClick={() => {
                setRegister((s) => !s);
                setStep('init');
            }}>
                {isRegister ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}
            </button>
        </div>
    </div>;
}

function ProfileCard({user, dashboard, onLogout}) {
    return <div className="stack centered">
        <h2>Профиль</h2>
        <article className="profile-info">
            <p>Имя пользователя: <b>{user?.displayName}</b></p>
            <p>Роль: {user?.role === 'ORGANIZER' ? 'Организатор' : 'Участник'}</p>
            {user?.role === 'ORGANIZER' &&
                <p>Перейдите во вкладку «Квизы», чтобы создавать, редактировать, публиковать и запускать квизы.</p>}
            {user?.role === 'PARTICIPANT' && <p>Используйте «Присоединиться», чтобы войти в активный квиз.</p>}
        </article>
        <button className="ghost" onClick={onLogout}>Выйти из профиля</button>
        {!dashboard && <p>Загрузка...</p>}
    </div>;
}

function QuizListCard({quizzes, user, onLaunch, onEditQuiz, onDeleteQuiz, onCreateQuizClick}) {
    return <div className="stack centered">
        <h2 style={{marginBottom: 0}}>Квизы</h2>
        {user?.role === 'ORGANIZER' && <button style={{marginBottom: 20}} onClick={onCreateQuizClick}>Создать квиз</button>}
        {quizzes?.map((quiz) => (
            <article key={quiz.id} className="tile quiz-row">
                <b className="quiz-col-title">{quiz.title}</b>
                <span className="quiz-col-count">{quiz._count.questions} вопросов</span>
                <button className="ghost field-full" onClick={() => onEditQuiz(quiz.id)}>Ред.</button>
                <button className="ghost field-full icon-button" onClick={() => onDeleteQuiz(quiz.id)}
                        aria-label="Удалить квиз" title="Удалить квиз">
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
                <button className="field-full" onClick={() => onLaunch(quiz.id)}>Запустить</button>
            </article>
        ))}
    </div>;
}

function CreateQuizCard({quiz, onCreateQuiz, onAddQuestion, onUpdateQuestion, onDeleteQuestion, onPublish, onBack}) {
    const [newQuiz, setNewQuiz] = useState({title: '', description: '', categoryNames: ''});
    const [question, setQuestion] = useState({
        type: 'TEXT',
        prompt: '',
        imageUrl: '',
        allowMultiple: false,
        points: 100,
        timeLimitSec: 20,
        options: [
            {text: '', isCorrect: false},
            {text: '', isCorrect: false}
        ]
    });
    const [editingQuestionId, setEditingQuestionId] = useState(null);
    const getEmptyQuestion = () => ({
        type: 'TEXT',
        prompt: '',
        imageUrl: '',
        allowMultiple: false,
        points: 100,
        timeLimitSec: 20,
        options: [
            {text: '', isCorrect: false},
            {text: '', isCorrect: false}
        ]
    });

    const handleCreateQuiz = async (e) => {
        e.preventDefault();
        const created = await onCreateQuiz({
            title: newQuiz.title,
            description: newQuiz.description,
            categoryNames: newQuiz.categoryNames.split(',').map((s) => s.trim()).filter(Boolean)
        });
        if (created) {
            setNewQuiz({title: '', description: '', categoryNames: ''});
        }
    };

    if (!quiz) {
        return <div className="stack centered">
            <h2>Создание квиза</h2>
            <form className="stack centered field-full" onSubmit={handleCreateQuiz}>
                <input className="field-full" placeholder="Название квиза" value={newQuiz.title}
                       onChange={(e) => setNewQuiz({...newQuiz, title: e.target.value})} required/>
                <div className="inline-fields">
                    <input placeholder="Описание" value={newQuiz.description}
                           onChange={(e) => setNewQuiz({...newQuiz, description: e.target.value})}/>
                    <input placeholder="Категории через запятую" value={newQuiz.categoryNames}
                           onChange={(e) => setNewQuiz({...newQuiz, categoryNames: e.target.value})}/>
                </div>
                <button>Создать квиз</button>
            </form>
            <button className="ghost" onClick={onBack}>Назад</button>
        </div>;
    }

    const changeOption = (index, patch) => {
        setQuestion((prev) => {
            let nextOptions = prev.options.map((option, idx) => (idx === index ? {...option, ...patch} : option));
            if (!prev.allowMultiple && patch.isCorrect) {
                nextOptions = nextOptions.map((option, idx) => ({...option, isCorrect: idx === index}));
            }
            return {
                ...prev,
                options: nextOptions
            };
        });
    };

    return <div className="stack centered">
        <h2>Редактор квиза: {quiz.title}</h2>
        <p>Статус: <b>{quiz.status}</b></p>

        <form className="stack centered field-full" onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
                ...question,
                options: question.options.filter((option) => option.text.trim())
            };

            let success = false;
            if (editingQuestionId) {
                success = await onUpdateQuestion(quiz.id, editingQuestionId, payload);
            } else {
                success = await onAddQuestion(quiz.id, payload);
            }

            if (success) {
                setQuestion(getEmptyQuestion());
                setEditingQuestionId(null);
            }
        }}>
            <CustomSelect
                className="field-half"
                value={question.type}
                onChange={(value) => setQuestion({...question, type: value})}
                options={[
                    {value: 'TEXT', label: 'Текстовый вопрос'},
                    {value: 'IMAGE', label: 'Вопрос с изображением'}
                ]}
            />
            <input className="field-half" placeholder="Текст вопроса" value={question.prompt}
                   onChange={(e) => setQuestion({...question, prompt: e.target.value})} required/>
            {question.type === 'IMAGE' && <>
                <input className="field-half" placeholder="URL изображения" value={question.imageUrl}
                       onChange={(e) => setQuestion({...question, imageUrl: e.target.value})} required/>
                {question.imageUrl &&
                    <img className="preview field-half" src={question.imageUrl} alt="Превью изображения вопроса"/>}
            </>}
            <label><input type="checkbox" checked={question.allowMultiple} onChange={(e) => {
                const allowMultiple = e.target.checked;
                setQuestion((prev) => {
                    if (allowMultiple) {
                        return {...prev, allowMultiple};
                    }
                    const firstCorrectIndex = prev.options.findIndex((option) => option.isCorrect);
                    return {
                        ...prev,
                        allowMultiple: false,
                        options: prev.options.map((option, index) => ({
                            ...option,
                            isCorrect: firstCorrectIndex === -1 ? false : index === firstCorrectIndex
                        }))
                    };
                });
            }}/> Множественный выбор</label>
            <label>Очки за вопрос
                <input className="field-half" type="number" min="10" max="1000" value={question.points}
                       onChange={(e) => setQuestion({...question, points: Number(e.target.value)})}/>
            </label>
            <label>Время на вопрос (секунды)
                <input className="field-half" type="number" min="5" max="180" value={question.timeLimitSec}
                       onChange={(e) => setQuestion({...question, timeLimitSec: Number(e.target.value)})}/>
            </label>

            <h4>Варианты ответа</h4>
            {question.options.map((option, idx) => (
                <div key={idx} className="option-editor">
                    <input placeholder={`Вариант ${idx + 1}`} value={option.text}
                           onChange={(e) => changeOption(idx, {text: e.target.value})} required/>
                    <label><input type="checkbox" checked={option.isCorrect}
                                  onChange={(e) => changeOption(idx, {isCorrect: e.target.checked})}/> Правильный</label>
                    <button
                        type="button"
                        className="ghost field-full icon-button option-remove"
                        onClick={() => setQuestion((prev) => ({
                            ...prev,
                            options: prev.options.filter((_, optionIndex) => optionIndex !== idx)
                        }))}
                        disabled={question.options.length <= 2}
                        aria-label={`Удалить вариант ${idx + 1}`}
                        title={`Удалить вариант ${idx + 1}`}
                    >
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    </button>
                </div>
            ))}
            <button type="button" className="ghost" onClick={() => setQuestion((prev) => ({
                ...prev,
                options: [...prev.options, {text: '', isCorrect: false}]
            }))}>+ Добавить вариант
            </button>

            <div className="row-actions">
                {editingQuestionId &&
                    <button type="button" className="ghost" onClick={() => setEditingQuestionId(null)}>Отмена
                        редактирования</button>}
                <button>{editingQuestionId ? 'Обновить вопрос' : 'Сохранить вопрос'}</button>
            </div>
        </form>

        <div className="stack field-full">
            <h4>Текущие вопросы ({quiz.questions?.length || 0})</h4>
            {quiz.questions?.map((q) => <article key={q.id} className="tile question-item">
                <div className="question-item-main">
                    <b>{q.orderIndex + 1}. {q.prompt}</b>
                    <span>{q.points} очков</span>
                </div>
                <div className="question-item-actions">
                    <button className="ghost compact-button" onClick={() => {
                        setEditingQuestionId(q.id);
                        setQuestion({
                            type: q.type,
                            prompt: q.prompt,
                            imageUrl: q.imageUrl || '',
                            allowMultiple: q.allowMultiple,
                            points: q.points,
                            timeLimitSec: q.timeLimitSec || 20,
                            options: q.options.map((option) => ({text: option.text, isCorrect: option.isCorrect}))
                        });
                    }}>Изменить
                    </button>
                    <button className="ghost icon-button compact-button" onClick={async () => {
                        const success = await onDeleteQuestion(quiz.id, q.id);
                        if (!success) return;
                        if (editingQuestionId === q.id) {
                            setEditingQuestionId(null);
                            setQuestion(getEmptyQuestion());
                        }
                    }} aria-label="Удалить вопрос" title="Удалить вопрос">
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    </button>
                </div>
            </article>)}
        </div>

        <div className="row-actions">
            <button className="ghost" onClick={onBack}>Назад</button>
            <button onClick={() => onPublish(quiz.id)} disabled={!quiz.questions?.length}>Опубликовать квиз</button>
        </div>
    </div>;
}

function JoinCard({onJoin}) {
    const [roomCode, setRoomCode] = useState('');
    return <div className="stack centered"><h2>Присоединиться к квизу</h2>
        <form className="stack field-full centered" onSubmit={(e) => {
            e.preventDefault();
            onJoin(roomCode.trim().toUpperCase());
        }}><input className="field-half" maxLength={6} placeholder="Код комнаты" value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)} required/>
            <button>Подключиться</button>
        </form>
    </div>;
}

function HistoryCard({dashboard, role}) {
    return <div className="stack centered"><h2>История</h2>
        <div className="stack field-full">{role === 'ORGANIZER' ? dashboard?.quizzes?.map((q) => <article
            className="tile" key={q.id}>{q.title}<span>Сессий: {q._count.sessions}</span>
        </article>) : dashboard?.participations?.map((p) => <article className="tile"
                                                                     key={p.id}>{p.session.quiz.title}<span>{p.totalScore} очков</span>
        </article>)}</div>
    </div>;
}

function WaitingCard({session, user, onStart, onCancel, participantCount}) {
    return <div className="stack centered"><h2>Ожидание начала</h2><p>Код комнаты: <b>{session?.roomCode}</b></p>
        {user?.role === 'ORGANIZER' && <p>Подключилось игроков: <b>{participantCount}</b></p>}
        {user?.role === 'ORGANIZER' && <div className="row-actions">
            <button onClick={onStart}>Начать квиз</button>
            <button className="ghost" onClick={onCancel}>Отменить квиз</button>
        </div>}
    </div>;
}

function QuestionCard({question, totalQuestions, onSubmit, onLeave, user, answerStats}) {
    const [selected, setSelected] = useState([]);
    const [submitted, setSubmitted] = useState(false);
    useEffect(() => setSelected([]), [question?.id]);
    useEffect(() => setSubmitted(false), [question?.id]);
    if (!question) return <p>Ожидаем вопрос...</p>;
    const toggle = (id) => setSelected((prev) => question.allowMultiple ? (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]) : [id]);
    return <div className="stack centered"><h2>Вопрос {question.orderIndex + 1}/{totalQuestions || '?'}</h2>
        <p>{question.prompt}</p>{question.imageUrl && <img className="preview" src={question.imageUrl} alt="Вопрос"/>}
        {user?.role === 'ORGANIZER' && (
            <div className="stack">
                <p>Ответили: <b>{answerStats.answeredPlayers}</b> / {answerStats.totalPlayers}</p>
                <p>Верно: <b>{answerStats.correctPercent}%</b> ({answerStats.correctAnswers})</p>
                <p>Неверно: <b>{answerStats.wrongPercent}%</b> ({answerStats.wrongAnswers})</p>
            </div>
        )}
        {user?.role === 'PARTICIPANT' && (
            <>
                {!submitted && <div className="stack field-full">{question.options.map((o) => <button key={o.id}
                                                                                                      className={"field-full " + `option option-answer ${selected.includes(o.id) ? 'active' : ''}`}
                                                                                                      onClick={() => toggle(o.id)}>
                    <input className="option-control" type={question.allowMultiple ? 'checkbox' : 'radio'}
                           checked={selected.includes(o.id)} readOnly tabIndex={-1} aria-hidden="true"/>
                    {o.text}</button>)}</div>}
                {!submitted
                    ? <button className="field-half" onClick={() => {
                        onSubmit(selected);
                        setSubmitted(true);
                    }} disabled={!selected.length}>Ответить</button>
                    :
                    <p>Ответ отправлен. Ответили: <b>{answerStats.answeredPlayers}</b> / {answerStats.totalPlayers}</p>}
            </>
        )}
    </div>;
}

function ResultsCard({leaderboard, onBack}) {
    return <div className="stack centered"><h2>Лидерборд</h2>
        <div className="stack field-full">{leaderboard.map((row, i) => <article key={row.id} className="tile">
            <b>{i + 1}. {row.user.displayName}</b><span>{row.totalScore} очков</span></article>)}</div>
        <button onClick={onBack}>В профиль</button>
    </div>;
}

function CustomSelect({className = '', value, onChange, options}) {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', handleOutsideClick);
        return () => document.removeEventListener('pointerdown', handleOutsideClick);
    }, []);

    const selected = options.find((option) => option.value === value);

    return (
        <div ref={rootRef} className={`custom-select ${className}`}>
            <button type="button" className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                    onClick={() => setIsOpen((prev) => !prev)}>
                <span>{selected?.label || 'Выберите значение'}</span>
                <span className="custom-select-chevron" aria-hidden="true">expand_more</span>
            </button>
            {isOpen && <div className="custom-select-menu">
                {options.map((option) => (
                    <button key={option.value} type="button"
                            className={`custom-select-option ${option.value === value ? 'active' : ''}`}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}>
                        {option.label}
                    </button>
                ))}
            </div>}
        </div>
    );
}

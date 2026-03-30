import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';
import { Header } from './components/Header.jsx';
import { ToastHub, useToasts } from './components/ToastHub.jsx';
import { GradientBackground } from './components/GradientBackground.jsx';

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
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
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
  const [secondsLeft, setSecondsLeft] = useState(stored.secondsLeft || 0);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [answerStats, setAnswerStats] = useState(stored.answerStats || { answeredPlayers: 0, totalPlayers: 0 });
  const { toasts, pushToast, removeToast } = useToasts();

  const socketRef = useRef(null);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!token) return;
    localStorage.setItem('token', token);
    request('/api/auth/me', 'GET', token)
      .then(({ user: me }) => {
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
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    socket.on('session:started', ({ question }) => {
      setView('quiz');
      setCurrentQuestion(question);
      setSecondsLeft(question?.timeLimitSec || 20);
    });
    socket.on('session:question', ({ question, durationSec }) => {
      setCurrentQuestion(question);
      setSecondsLeft(durationSec || question?.timeLimitSec || 20);
    });
    socket.on('session:answer-stats', ({ answeredPlayers, totalPlayers }) => {
      setAnswerStats({ answeredPlayers, totalPlayers });
    });
    socket.on('session:leaderboard-update', ({ leaderboard: rows }) => setLeaderboard(rows));
    socket.on('session:finished', ({ leaderboard: rows }) => {
      setLeaderboard(rows);
      setView('results');
      pushToast('Квиз завершен. Показан итоговый лидерборд.', 'info');
    });

    socket.on('connect_error', (error) => {
      pushToast(`Ошибка WebSocket: ${error.message}`, 'error');
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [token, pushToast]);

  useEffect(() => {
    if (view !== 'quiz' || !secondsLeft) return;
    const timer = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [view, secondsLeft]);

  useEffect(() => {
    if (!token || !session?.roomCode) return;
    const socket = socketRef.current;
    if (!socket) return;

    const joinCurrentRoom = () => {
      socket.emit('session:join-room', { roomCode: session.roomCode }, (ack) => {
        if (!ack?.ok) return;
        setSession((prev) => ({ ...prev, ...ack.session }));
        if (ack.session.currentQuestion) {
          setCurrentQuestion(ack.session.currentQuestion);
          setView('quiz');
          setSecondsLeft(ack.session.currentQuestion.timeLimitSec || 20);
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
      answerStats
    }));
  }, [view, session, currentQuestion, leaderboard, secondsLeft, answerStats]);

  const onLogin = async (payload, isRegister) => {
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const data = await request(endpoint, 'POST', null, payload);
      setToken(data.token);
      setUser(data.user);
      setView('profile');
      pushToast('Успешный вход в систему', 'success');
    } catch (e) {
      pushToast(e.message, 'error');
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
      pushToast(e.message, 'error');
    }
  };

  useEffect(() => { loadDashboard(); }, [token]);

  const joinByCode = async (roomCode) => {
    try {
      const data = await request('/api/sessions/join', 'POST', token, { roomCode });
      setSession(data.session);
      setView('waiting');
      socketRef.current?.emit('session:join-room', { roomCode }, (ack) => {
        if (!ack.ok) pushToast(ack.error, 'error');
      });
      pushToast('Подключение к комнате выполнено', 'success');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const launchSession = async (quizId) => {
    try {
      const created = await request(`/api/sessions/launch/${quizId}`, 'POST', token);
      setSession(created);
      setView('waiting');
      socketRef.current?.emit('session:join-room', { roomCode: created.roomCode });
      pushToast(`Сессия запущена. Код комнаты: ${created.roomCode}`, 'success');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const createQuiz = async (payload) => {
    try {
      const created = await request('/api/quizzes', 'POST', token, payload);
      setEditingQuiz(created);
      setView('create-quiz');
      await loadDashboard();
      pushToast('Квиз создан. Добавьте вопросы и опубликуйте.', 'success');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const addQuestionToQuiz = async (quizId, payload) => {
    try {
      await request(`/api/quizzes/${quizId}/questions`, 'POST', token, payload);
      const quiz = await request(`/api/quizzes/${quizId}`, 'GET', token);
      setEditingQuiz(quiz);
      await loadDashboard();
      pushToast('Вопрос добавлен', 'success');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const updateQuestionInQuiz = async (quizId, questionId, payload) => {
    try {
      await request(`/api/quizzes/${quizId}/questions/${questionId}`, 'PATCH', token, payload);
      const quiz = await request(`/api/quizzes/${quizId}`, 'GET', token);
      setEditingQuiz(quiz);
      await loadDashboard();
      pushToast('Вопрос обновлен', 'success');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const publishQuiz = async (quizId) => {
    try {
      const updated = await request(`/api/quizzes/${quizId}`, 'PATCH', token, { status: 'PUBLISHED' });
      setEditingQuiz(updated);
      await loadDashboard();
      pushToast('Квиз опубликован', 'success');
      setView('quizzes');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const openQuizEditor = async (quizId) => {
    try {
      const fullQuiz = await request(`/api/quizzes/${quizId}`, 'GET', token);
      setEditingQuiz(fullQuiz);
      setView('create-quiz');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const startQuiz = () => socketRef.current?.emit('session:start', { sessionId: session.id }, (ack) => !ack.ok && pushToast(ack.error, 'error'));
  const submitAnswer = (optionIds) => socketRef.current?.emit('session:submit-answer', { sessionId: session.id, questionId: currentQuestion.id, optionIds }, (ack) => {
    if (!ack.ok) return pushToast(ack.error, 'error');
    pushToast('Ответ принят', 'success');
  });

  const activeQuiz = view === 'quiz';

  return (
    <div className={`app ${theme}`}>
      <GradientBackground disabled={activeQuiz} theme={theme} />
      <Header
        user={user}
        session={session}
        secondsLeft={secondsLeft}
        activeQuiz={activeQuiz}
        waiting={view === 'waiting'}
        activeView={view === 'create-quiz' ? 'quizzes' : view}
        onNavigate={setView}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />

      <main className="content">
        <motion.section className="card" layout transition={{ layout: { duration: 0.35 } }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.25 }}
            >
              {view === 'auth' && <AuthCard onSubmit={onLogin} />}
              {view === 'profile' && <ProfileCard user={user} dashboard={dashboard} />}
              {view === 'quizzes' && <OrganizerQuizzesCard quizzes={quizList} onLaunch={launchSession} onCreateQuiz={createQuiz} onEditQuiz={openQuizEditor} />}
              {view === 'join' && <JoinCard onJoin={joinByCode} />}
              {view === 'history' && <HistoryCard dashboard={dashboard} role={user?.role} />}
              {view === 'create-quiz' && <CreateQuizCard quiz={editingQuiz} onAddQuestion={addQuestionToQuiz} onUpdateQuestion={updateQuestionInQuiz} onPublish={publishQuiz} onBack={() => setView('quizzes')} />}
              {view === 'waiting' && <WaitingCard session={session} user={user} onStart={startQuiz} />}
              {view === 'quiz' && <QuestionCard question={currentQuestion} onSubmit={submitAnswer} user={user} answerStats={answerStats} />}
              {view === 'results' && <ResultsCard leaderboard={leaderboard} onBack={() => setView('profile')} />}
            </motion.div>
          </AnimatePresence>
        </motion.section>
      </main>

      <ToastHub toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

function AuthCard({ onSubmit }) {
  const [isRegister, setRegister] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'PARTICIPANT' });
  return <div>
    <h2>{isRegister ? 'Регистрация' : 'Вход'}</h2>
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(form, isRegister); }}>
      {isRegister && <input placeholder="Имя" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />}
      <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      <input placeholder="Пароль" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      {isRegister && <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="PARTICIPANT">Участник</option><option value="ORGANIZER">Организатор</option></select>}
      <button>Продолжить</button>
    </form>
    <button className="ghost" onClick={() => setRegister((s) => !s)}>{isRegister ? 'Уже есть аккаунт' : 'Создать аккаунт'}</button>
  </div>;
}

function ProfileCard({ user, dashboard }) {
  return <div>
    <h2>Профиль</h2><p>{user?.displayName} ({user?.role})</p>
    {user?.role === 'ORGANIZER' && <p>Перейдите во вкладку «Квизы», чтобы создавать, редактировать, публиковать и запускать квизы.</p>}
    {user?.role === 'PARTICIPANT' && <p>Используйте «Присоединиться», чтобы войти в активный квиз.</p>}
    {!dashboard && <p>Загрузка...</p>}
  </div>;
}

function OrganizerQuizzesCard({ quizzes, onLaunch, onCreateQuiz, onEditQuiz }) {
  const [newQuiz, setNewQuiz] = useState({ title: '', description: '', categoryNames: '' });

  return <div className="stack">
    <h2>Управление квизами</h2>
    <form className="stack" onSubmit={(e) => {
      e.preventDefault();
      onCreateQuiz({
        title: newQuiz.title,
        description: newQuiz.description,
        categoryNames: newQuiz.categoryNames.split(',').map((s) => s.trim()).filter(Boolean)
      });
    }}>
      <input placeholder="Название квиза" value={newQuiz.title} onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })} required />
      <input placeholder="Описание" value={newQuiz.description} onChange={(e) => setNewQuiz({ ...newQuiz, description: e.target.value })} />
      <input placeholder="Категории через запятую" value={newQuiz.categoryNames} onChange={(e) => setNewQuiz({ ...newQuiz, categoryNames: e.target.value })} />
      <button>Создать квиз</button>
    </form>

    <h3>Список квизов</h3>
    {quizzes?.map((quiz) => (
      <article key={quiz.id} className="tile">
        <b>{quiz.title}</b>
        <span>{quiz._count.questions} вопросов</span>
        <div className="row-actions">
          <button className="ghost" onClick={() => onEditQuiz(quiz.id)}>Редактировать</button>
          <button onClick={() => onLaunch(quiz.id)}>Запустить</button>
        </div>
      </article>
    ))}
  </div>;
}

function CreateQuizCard({ quiz, onAddQuestion, onUpdateQuestion, onPublish, onBack }) {
  const [question, setQuestion] = useState({
    type: 'TEXT',
    prompt: '',
    imageUrl: '',
    allowMultiple: false,
    points: 100,
    timeLimitSec: 20,
    options: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ]
  });
  const [editingQuestionId, setEditingQuestionId] = useState(null);

  if (!quiz) {
    return <div><h2>Редактор квиза</h2><p>Сначала создайте квиз в профиле.</p><button onClick={onBack}>Назад</button></div>;
  }

  const changeOption = (index, patch) => {
    setQuestion((prev) => {
      let nextOptions = prev.options.map((option, idx) => (idx === index ? { ...option, ...patch } : option));
      if (!prev.allowMultiple && patch.isCorrect) {
        nextOptions = nextOptions.map((option, idx) => ({ ...option, isCorrect: idx === index }));
      }
      return {
        ...prev,
        options: nextOptions
      };
    });
  };

  return <div className="stack">
    <h2>Редактор квиза: {quiz.title}</h2>
    <p>Статус: <b>{quiz.status}</b></p>

    <form className="stack" onSubmit={(e) => {
      e.preventDefault();
      const payload = {
        ...question,
        options: question.options.filter((option) => option.text.trim())
      };

      if (editingQuestionId) {
        onUpdateQuestion(quiz.id, editingQuestionId, payload);
      } else {
        onAddQuestion(quiz.id, payload);
      }

      setQuestion({
        type: 'TEXT',
        prompt: '',
        imageUrl: '',
        allowMultiple: false,
        points: 100,
        timeLimitSec: 20,
        options: [
          { text: '', isCorrect: false },
          { text: '', isCorrect: false }
        ]
      });
      setEditingQuestionId(null);
    }}>
      <select value={question.type} onChange={(e) => setQuestion({ ...question, type: e.target.value })}>
        <option value="TEXT">Текстовый вопрос</option>
        <option value="IMAGE">Вопрос с изображением</option>
      </select>
      <input placeholder="Текст вопроса" value={question.prompt} onChange={(e) => setQuestion({ ...question, prompt: e.target.value })} required />
      {question.type === 'IMAGE' && <input placeholder="URL изображения" value={question.imageUrl} onChange={(e) => setQuestion({ ...question, imageUrl: e.target.value })} required />}
      <label><input type="checkbox" checked={question.allowMultiple} onChange={(e) => {
        const allowMultiple = e.target.checked;
        setQuestion((prev) => {
          if (allowMultiple) {
            return { ...prev, allowMultiple };
          }
          const firstCorrectIndex = prev.options.findIndex((option) => option.isCorrect);
          return {
            ...prev,
            allowMultiple: false,
            options: prev.options.map((option, index) => ({ ...option, isCorrect: firstCorrectIndex === -1 ? false : index === firstCorrectIndex }))
          };
        });
      }} /> Множественный выбор</label>
      <label>Очки за вопрос
        <input type="number" min="10" max="1000" value={question.points} onChange={(e) => setQuestion({ ...question, points: Number(e.target.value) })} />
      </label>
      <label>Время на вопрос (секунды)
        <input type="number" min="5" max="180" value={question.timeLimitSec} onChange={(e) => setQuestion({ ...question, timeLimitSec: Number(e.target.value) })} />
      </label>

      <h4>Варианты ответа</h4>
      {question.options.map((option, idx) => (
        <div key={idx} className="option-editor">
          <input placeholder={`Вариант ${idx + 1}`} value={option.text} onChange={(e) => changeOption(idx, { text: e.target.value })} required />
          <label><input type="checkbox" checked={option.isCorrect} onChange={(e) => changeOption(idx, { isCorrect: e.target.checked })} /> Правильный</label>
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => setQuestion((prev) => ({ ...prev, options: [...prev.options, { text: '', isCorrect: false }] }))}>+ Добавить вариант</button>

      <div className="row-actions">
        {editingQuestionId && <button type="button" className="ghost" onClick={() => setEditingQuestionId(null)}>Отмена редактирования</button>}
        <button>{editingQuestionId ? 'Обновить вопрос' : 'Сохранить вопрос'}</button>
      </div>
    </form>

    <div className="stack">
      <h4>Текущие вопросы ({quiz.questions?.length || 0})</h4>
      {quiz.questions?.map((q) => <article key={q.id} className="tile"><b>{q.orderIndex + 1}. {q.prompt}</b><span>{q.points} очков</span><button className="ghost" onClick={() => {
        setEditingQuestionId(q.id);
        setQuestion({
          type: q.type,
          prompt: q.prompt,
          imageUrl: q.imageUrl || '',
          allowMultiple: q.allowMultiple,
          points: q.points,
          timeLimitSec: q.timeLimitSec || 20,
          options: q.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect }))
        });
      }}>Изменить</button></article>)}
    </div>

    <div className="row-actions">
      <button className="ghost" onClick={onBack}>Назад</button>
      <button onClick={() => onPublish(quiz.id)} disabled={!quiz.questions?.length}>Опубликовать квиз</button>
    </div>
  </div>;
}

function JoinCard({ onJoin }) {
  const [roomCode, setRoomCode] = useState('');
  return <div><h2>Подключение к квизу</h2><form className="stack" onSubmit={(e) => { e.preventDefault(); onJoin(roomCode.trim().toUpperCase()); }}><input maxLength={6} placeholder="Код комнаты" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} required/><button>Подключиться</button></form></div>;
}

function HistoryCard({ dashboard, role }) {
  return <div><h2>История</h2>{role === 'ORGANIZER' ? dashboard?.quizzes?.map((q) => <article className="tile" key={q.id}>{q.title}<span>Сессий: {q._count.sessions}</span></article>) : dashboard?.participations?.map((p) => <article className="tile" key={p.id}>{p.session.quiz.title}<span>{p.totalScore} очков</span></article>)}</div>;
}

function WaitingCard({ session, user, onStart }) {
  return <div><h2>Ожидание начала</h2><p>Код комнаты: <b>{session?.roomCode}</b></p>{user?.role === 'ORGANIZER' && <button onClick={onStart}>Начать квиз</button>}</div>;
}

function QuestionCard({ question, onSubmit, user, answerStats }) {
  const [selected, setSelected] = useState([]);
  useEffect(() => setSelected([]), [question?.id]);
  if (!question) return <p>Ожидаем вопрос...</p>;
  const toggle = (id) => setSelected((prev) => question.allowMultiple ? (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]) : [id]);
  return <div><h2>{question.prompt}</h2>{question.imageUrl && <img className="preview" src={question.imageUrl} alt="Вопрос"/>}
    {user?.role === 'ORGANIZER' && <p>Ответили: <b>{answerStats.answeredPlayers}</b> / {answerStats.totalPlayers}</p>}
    <div className="stack">{question.options.map((o) => <button key={o.id} className={`option ${selected.includes(o.id) ? 'active' : ''}`} onClick={() => toggle(o.id)}>{o.text}</button>)}</div>
    {user?.role === 'PARTICIPANT' && <button onClick={() => onSubmit(selected)} disabled={!selected.length}>Ответить</button>}
  </div>;
}

function ResultsCard({ leaderboard, onBack }) {
  return <div><h2>Лидерборд</h2><div className="stack">{leaderboard.map((row, i) => <article key={row.id} className="tile"><b>{i + 1}. {row.user.displayName}</b><span>{row.totalScore} очков</span></article>)}</div><button onClick={onBack}>В профиль</button></div>;
}

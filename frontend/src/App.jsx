import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';
import { Header } from './components/Header.jsx';
import { ToastHub, useToasts } from './components/ToastHub.jsx';
import { GradientBackground } from './components/GradientBackground.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const WS_URL = import.meta.env.VITE_WS_URL || API_URL;

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
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth');
  const [dashboard, setDashboard] = useState(null);
  const [quizList, setQuizList] = useState([]);
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const { toasts, pushToast, removeToast } = useToasts();

  const socket = useMemo(() => (token ? io(WS_URL, { auth: { token } }) : null), [token]);

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
        setView('profile');
      })
      .catch(() => {
        setToken(null);
        setUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on('session:started', ({ question }) => {
      setView('quiz');
      setCurrentQuestion(question);
      setSecondsLeft(question?.timeLimitSec || 20);
    });
    socket.on('session:question', ({ question }) => {
      setCurrentQuestion(question);
      setSecondsLeft(question?.timeLimitSec || 20);
    });
    socket.on('session:leaderboard-update', ({ leaderboard: rows }) => setLeaderboard(rows));
    socket.on('session:finished', ({ leaderboard: rows }) => {
      setLeaderboard(rows);
      setView('results');
      pushToast('Квиз завершен. Показан итоговый лидерборд.', 'info');
    });
    return () => socket.disconnect();
  }, [socket, pushToast]);

  useEffect(() => {
    if (view !== 'quiz' || !secondsLeft) return;
    const timer = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [view, secondsLeft]);

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
      socket?.emit('session:join-room', { roomCode }, (ack) => {
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
      socket?.emit('session:join-room', { roomCode: created.roomCode });
      pushToast(`Сессия запущена. Код комнаты: ${created.roomCode}`, 'success');
    } catch (e) {
      pushToast(e.message, 'error');
    }
  };

  const startQuiz = () => socket?.emit('session:start', { sessionId: session.id }, (ack) => !ack.ok && pushToast(ack.error, 'error'));
  const nextQuestion = () => socket?.emit('session:next-question', { sessionId: session.id }, (ack) => !ack.ok && pushToast(ack.error, 'error'));
  const submitAnswer = (optionIds) => socket?.emit('session:submit-answer', { sessionId: session.id, questionId: currentQuestion.id, optionIds }, (ack) => {
    if (!ack.ok) return pushToast(ack.error, 'error');
    pushToast(ack.isCorrect ? `Верно (+${ack.earnedPoints})` : 'Неверно', ack.isCorrect ? 'success' : 'error');
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
        onNavigate={setView}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />

      <main className="content">
        <AnimatePresence mode="wait">
          <motion.section
            key={view}
            className="card"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.35 }}
          >
            {view === 'auth' && <AuthCard onSubmit={onLogin} />}
            {view === 'profile' && <ProfileCard user={user} dashboard={dashboard} quizzes={quizList} onLaunch={launchSession} />}
            {view === 'join' && <JoinCard onJoin={joinByCode} />}
            {view === 'history' && <HistoryCard dashboard={dashboard} role={user?.role} />}
            {view === 'waiting' && <WaitingCard session={session} user={user} onStart={startQuiz} />}
            {view === 'quiz' && <QuestionCard question={currentQuestion} onSubmit={submitAnswer} user={user} onNext={nextQuestion} />}
            {view === 'results' && <ResultsCard leaderboard={leaderboard} onBack={() => setView('profile')} />}
          </motion.section>
        </AnimatePresence>
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

function ProfileCard({ user, dashboard, quizzes, onLaunch }) {
  return <div>
    <h2>Профиль</h2><p>{user?.displayName} ({user?.role})</p>
    {user?.role === 'ORGANIZER' && <div className="stack"><h3>Мои квизы</h3>{quizzes?.map((quiz) => <article key={quiz.id} className="tile"><b>{quiz.title}</b><span>{quiz._count.questions} вопросов</span><button onClick={() => onLaunch(quiz.id)}>Запустить</button></article>)}</div>}
    {user?.role === 'PARTICIPANT' && <p>Используйте «Присоединиться», чтобы войти в активный квиз.</p>}
    {!dashboard && <p>Загрузка...</p>}
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

function QuestionCard({ question, onSubmit, user, onNext }) {
  const [selected, setSelected] = useState([]);
  useEffect(() => setSelected([]), [question?.id]);
  if (!question) return <p>Ожидаем вопрос...</p>;
  const toggle = (id) => setSelected((prev) => question.allowMultiple ? (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]) : [id]);
  return <div><h2>{question.prompt}</h2>{question.imageUrl && <img className="preview" src={question.imageUrl} alt="Вопрос"/>}
    <div className="stack">{question.options.map((o) => <button key={o.id} className={`option ${selected.includes(o.id) ? 'active' : ''}`} onClick={() => toggle(o.id)}>{o.text}</button>)}</div>
    {user?.role === 'PARTICIPANT' ? <button onClick={() => onSubmit(selected)} disabled={!selected.length}>Ответить</button> : <button onClick={onNext}>Следующий вопрос</button>}
  </div>;
}

function ResultsCard({ leaderboard, onBack }) {
  return <div><h2>Лидерборд</h2><div className="stack">{leaderboard.map((row, i) => <article key={row.id} className="tile"><b>{i + 1}. {row.user.displayName}</b><span>{row.totalScore} очков</span></article>)}</div><button onClick={onBack}>В профиль</button></div>;
}

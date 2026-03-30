export function Header({ user, session, waiting, activeQuiz, secondsLeft, onNavigate, onToggleTheme }) {
  return (
    <header className="header">
      <div className="brand">QUIZ LIVE</div>
      <div className="header-middle">
        {!user && <span>Авторизуйтесь для начала</span>}
        {user && !session && !activeQuiz && !waiting && (
          <nav>
            <button className="ghost" onClick={() => onNavigate('profile')}>Профиль</button>
            <button className="ghost" onClick={() => onNavigate('join')}>Присоединиться к квизу</button>
            <button className="ghost" onClick={() => onNavigate('history')}>История</button>
          </nav>
        )}
        {session && waiting && <span>Ожидание начала квиза…</span>}
        {activeQuiz && <span className="timer">{secondsLeft}s</span>}
      </div>
      <button className="theme" onClick={onToggleTheme}>Сменить тему</button>
    </header>
  );
}

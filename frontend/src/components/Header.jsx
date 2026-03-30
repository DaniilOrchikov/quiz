import React from 'react';

export function Header({ user, session, waiting, activeQuiz, secondsLeft, activeView, onNavigate, onToggleTheme }) {
  const isOrganizer = user?.role === 'ORGANIZER';
  const navItems = isOrganizer
    ? [
      { key: 'profile', label: 'Профиль' },
      { key: 'quizzes', label: 'Квизы' },
      { key: 'history', label: 'История' }
    ]
    : [
      { key: 'profile', label: 'Профиль' },
      { key: 'join', label: 'Присоединиться к квизу' },
      { key: 'history', label: 'История' }
    ];

  return (
    <header className="header">
      <div className="brand">QUIZ LIVE</div>
      <div className="header-middle">
        {!user && <span>Авторизуйтесь для начала</span>}
        {user && !session && !activeQuiz && !waiting && (
          <nav>
            {navItems.map((item) => (
              <button
                key={item.key}
                className="ghost"
                data-active={item.key === activeView ? 'true' : 'false'}
                onClick={() => onNavigate(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
        {session && waiting && <span>Ожидание начала квиза…</span>}
        {activeQuiz && <span className="timer">{secondsLeft}s</span>}
      </div>
      <button className="theme" onClick={onToggleTheme}>Сменить тему</button>
    </header>
  );
}

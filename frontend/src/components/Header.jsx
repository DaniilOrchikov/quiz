import React from 'react';

export function Header({ user, session, waiting, activeQuiz, secondsLeft, activeView, onNavigate, onToggleTheme, theme, onLeaveQuiz }) {
  const isOrganizer = user?.role === 'ORGANIZER';
  const navItems = isOrganizer
    ? [
      { key: 'profile', label: 'Профиль' },
      { key: 'quizzes', label: 'Квизы' },
      { key: 'history', label: 'История' }
    ]
    : [
      { key: 'profile', label: 'Профиль' },
      { key: 'join', label: 'Присоединиться' },
      { key: 'history', label: 'История' }
    ];

  const activeIndex = Math.max(0, navItems.findIndex((item) => item.key === activeView));

  return (
    <header className="header">
      <button className="theme-icon" onClick={onToggleTheme} aria-label="toggle theme">
        {theme === 'light' ? <span className="material-symbols-outlined">wb_sunny</span> : <span className="moon">☾</span>}
      </button>

      <div className="header-middle">
        {user && !session && !activeQuiz && !waiting && (
          <nav className="menu-nav" style={{ '--active-index': activeIndex, '--items-count': navItems.length }}>
            <span className="menu-active-pill" />
            {navItems.map((item) => (
              <button
                key={item.key}
                className="menu-link"
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

      {!isOrganizer && session && (waiting || activeQuiz) ? (
        <button className="ghost" onClick={onLeaveQuiz}>Выйти из квиза</button>
      ) : <div style={{ width: 40 }} />}
    </header>
  );
}

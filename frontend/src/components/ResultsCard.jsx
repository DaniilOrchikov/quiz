import React from 'react';

export function ResultsCard({leaderboard, onBack, user}) {
    const backLabel = user?.role === 'ORGANIZER' ? 'К квизам' : 'Присоединиться';
    return <div className="stack centered"><h2>Лидерборд</h2>
        <div className="stack field-full">{leaderboard.map((row, i) => <article key={row.id} className="tile">
            <b>{i + 1}. {row.user.displayName}</b><span>{row.totalScore} очков</span></article>)}</div>
        <button onClick={onBack}>{backLabel}</button>
    </div>;
}

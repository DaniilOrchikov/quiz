import React from 'react';

export function ResultsCard({leaderboard, onBack, user}) {
    const backLabel = user?.role === 'ORGANIZER' ? 'К квизам' : 'Присоединиться';
    const topFive = leaderboard.slice(0, 5);
    const currentPlayerIndex = leaderboard.findIndex((row) => row.user.id === user?.id);
    const currentPlayerInTopFive = currentPlayerIndex > -1 && currentPlayerIndex < 5;
    const currentPlayerRow = currentPlayerIndex > -1 ? leaderboard[currentPlayerIndex] : null;

    return <div className="stack centered"><h2>Лидерборд</h2>
        <div className="stack field-full">{topFive.map((row, i) => <article key={row.id} className="tile">
            <b>{i + 1}. {row.user.displayName}</b><span>{row.totalScore} очков</span></article>)}
            {!currentPlayerInTopFive && currentPlayerRow && <article className="tile">
                <b>{currentPlayerIndex + 1}. {currentPlayerRow.user.displayName}</b>
                <span>{currentPlayerRow.totalScore} очков</span>
            </article>}
        </div>
        <button onClick={onBack}>{backLabel}</button>
    </div>;
}

import React from 'react';

export function HistoryCard({dashboard, role, onContentChange}) {
    const groupedParticipations = (dashboard?.participations || []).reduce((acc, participation) => {
        const quizId = participation.session.quiz.id;
        if (!acc[quizId]) {
            acc[quizId] = {
                quizId,
                quizTitle: participation.session.quiz.title,
                games: []
            };
        }
        acc[quizId].games.push(participation);
        return acc;
    }, {});
    const organizerHistory = dashboard?.quizzes || [];
    const participantHistory = Object.values(groupedParticipations);
    const isOrganizer = role === 'ORGANIZER';
    const isHistoryEmpty = isOrganizer ? organizerHistory.length === 0 : participantHistory.length === 0;
    const emptyHistoryLabel = isOrganizer
        ? 'Пока не было запущено ни одного квиза'
        : 'Пока не было сыграно ни одного квиза';

    return <div className="stack centered"><h2>История</h2>
        {isHistoryEmpty && <p>{emptyHistoryLabel}</p>}
        <div className="stack field-full">{isOrganizer ? organizerHistory.map((q) => <article
            className="tile" key={q.id}>{q.title}<span>Сессий: {q._count.sessions}</span>
        </article>) : participantHistory.map((group) => <details className="history-group"
                                                                  key={group.quizId}
                                                                  onToggle={() => requestAnimationFrame(() => onContentChange?.())}>
            <summary className="tile">
                <b>{group.quizTitle}</b>
                <span>Игр: {group.games.length}</span>
            </summary>
            <div className="stack history-group-content">
                {group.games.map((game) => <article className="tile" key={game.id}>
                    <span>Комната: {game.session.roomCode}</span>
                    <span>{game.totalScore} очков</span>
                </article>)}
            </div>
        </details>)}</div>
    </div>;
}

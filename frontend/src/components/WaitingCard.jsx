import React from 'react';

export function WaitingCard({session, user, onStart, onCancel, onLeave, participantCount}) {
    return <div className="stack centered waiting-card"><h2>{session?.quiz?.title || 'Квиз'}</h2><p>Код комнаты: <b>{session?.roomCode}</b></p>
        {user?.role === 'ORGANIZER' && <p>Подключилось игроков: <b>{participantCount}</b></p>}
        {user?.role === 'ORGANIZER' && <div className="row-actions waiting-actions">
            <button onClick={onStart}>Начать квиз</button>
            <button className="ghost" onClick={onCancel}>Отменить квиз</button>
        </div>}
        {user?.role === 'PARTICIPANT' && <button className="ghost waiting-leave-button" onClick={onLeave}>Выйти из квиза</button>}
    </div>;
}

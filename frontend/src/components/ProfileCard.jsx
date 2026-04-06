import React from 'react';

export function ProfileCard({user, dashboard, onLogout}) {
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

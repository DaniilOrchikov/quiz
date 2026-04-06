import React, {useState} from 'react';

export function JoinCard({onJoin}) {
    const [roomCode, setRoomCode] = useState('');
    return <div className="stack centered"><h2>Войти в игру</h2>
        <p>Код квиза спросите у организатора</p>
        <form className="stack field-full centered" onSubmit={(e) => {
            e.preventDefault();
            onJoin(roomCode.trim().toUpperCase());
        }}><input className="field-half" maxLength={6} placeholder="Код комнаты" value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)} required/>
            <button>Подключиться</button>
        </form>
    </div>;
}

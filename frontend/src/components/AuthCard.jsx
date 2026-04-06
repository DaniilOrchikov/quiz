import React, {useState} from 'react';
import {CustomSelect} from './CustomSelect.jsx';

export function AuthCard({onSubmit, pushToast}) {
    const [isRegister, setRegister] = useState(false);
    const [form, setForm] = useState({email: '', password: '', displayName: '', role: 'PARTICIPANT'});
    const isWeakPassword = isRegister && form.password.length > 0 && !/^(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(form.password);
    return <div>
        <div className="stack centered auth-card">
            <h2>{isRegister ? 'Регистрация' : 'Вход'}</h2>
            <form className="stack centered field-full" onSubmit={async (e) => {
                e.preventDefault();
                if (isRegister && isWeakPassword) {
                    pushToast?.('Пароль должен быть не короче 8 символов и содержать строчные и заглавные буквы', 'error');
                    return;
                }
                onSubmit(form, isRegister);
            }}>
                {isRegister &&
                    <input className="field-full" placeholder="Имя" value={form.displayName}
                           onChange={(e) => setForm({...form, displayName: e.target.value})} required/>}
                <input className="field-full" placeholder="Email" type="email" value={form.email}
                       onChange={(e) => setForm({...form, email: e.target.value})} required/>
                {!isRegister && <input className="field-full" placeholder="Пароль" type="password" value={form.password}
                                       onChange={(e) => setForm({...form, password: e.target.value})} required/>}
                {isRegister && <>
                    <input className="field-full" placeholder="Пароль" type="password" value={form.password}
                           onChange={(e) => setForm({...form, password: e.target.value})} required/>
                    {isWeakPassword && <p className="error-text">Простой пароль</p>}
                    <CustomSelect
                        className="field-full"
                        value={form.role}
                        onChange={(value) => setForm({...form, role: value})}
                        options={[
                            {value: 'PARTICIPANT', label: 'Участник'},
                            {value: 'ORGANIZER', label: 'Организатор'}
                        ]}
                    />
                </>}
                <button>Продолжить</button>
            </form>
            <button type="button" className="link-button" onClick={() => {
                setRegister((s) => !s);
            }}>
                {isRegister ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}
            </button>
        </div>
    </div>;
}

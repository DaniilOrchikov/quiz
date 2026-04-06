export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const WS_URL = import.meta.env.VITE_WS_URL || API_URL;

export async function request(path, method = 'GET', token, body) {
    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? {Authorization: `Bearer ${token}`} : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
}

export function toRuError(message) {
    const map = {
        'Failed to fetch': 'Не удалось подключиться к серверу',
        'NetworkError when attempting to fetch resource.': 'Ошибка сети при обращении к серверу',
        'Invalid credentials': 'Неверный email или пароль',
        Unauthorized: 'Требуется авторизация',
        Forbidden: 'Недостаточно прав',
        'Quiz not found': 'Квиз не найден',
        'Session not found': 'Сессия не найдена',
        'Question must have at least one correct option': 'Укажите хотя бы один правильный вариант ответа'
    };
    return map[message] || message || 'Произошла ошибка';
}

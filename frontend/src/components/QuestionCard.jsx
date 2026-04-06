import React, {useEffect, useState} from 'react';

export function QuestionCard({question, totalQuestions, onSubmit, onLeave, user, answerStats, onContentChange}) {
    const [selected, setSelected] = useState([]);
    const [submitted, setSubmitted] = useState(false);
    useEffect(() => setSelected([]), [question?.id]);
    useEffect(() => setSubmitted(false), [question?.id]);
    useEffect(() => {
        onContentChange?.();
    }, [question?.id, question?.imageUrl, onContentChange]);
    if (!question) return <p>Ожидаем вопрос...</p>;
    const toggle = (id) => setSelected((prev) => question.allowMultiple ? (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]) : [id]);
    return <div className="stack centered"><h2>Вопрос {question.orderIndex + 1}/{totalQuestions || '?'}</h2>
        <p>{question.prompt}</p>{question.imageUrl && <img className="preview" src={question.imageUrl} alt="Вопрос"
                                                           onLoad={() => onContentChange?.()}
                                                           onError={() => onContentChange?.()}/>} 
        {user?.role === 'ORGANIZER' && (
            <div className="stack">
                <p>Ответили: <b>{answerStats.answeredPlayers}</b> / {answerStats.totalPlayers}</p>
                <p>Верно: <b>{answerStats.correctPercent}%</b> ({answerStats.correctAnswers})</p>
                <p>Неверно: <b>{answerStats.wrongPercent}%</b> ({answerStats.wrongAnswers})</p>
            </div>
        )}
        {user?.role === 'PARTICIPANT' && (
            <>
                {!submitted && <div className="stack field-full">{question.options.map((o) => <label key={o.id}
                                                                                                     className={'field-full ' + `option option-answer ${selected.includes(o.id) ? 'active' : ''}`}>
                    <input
                        className="option-native-control"
                        type={question.allowMultiple ? 'checkbox' : 'radio'}
                        name={`question-${question.id}`}
                        checked={selected.includes(o.id)}
                        onChange={() => toggle(o.id)}
                    />
                    <span>{o.text}</span>
                </label>)}</div>}
                {!submitted
                    ? <button className="field-half" onClick={() => {
                        onSubmit(selected);
                        setSubmitted(true);
                    }} disabled={!selected.length}>Ответить</button>
                    :
                    <p>Ответ отправлен. Ответили: <b>{answerStats.answeredPlayers}</b> / {answerStats.totalPlayers}</p>}
            </>
        )}
    </div>;
}

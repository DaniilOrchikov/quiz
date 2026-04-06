import React, {useState} from 'react';
import {CustomSelect} from './CustomSelect.jsx';

export function CreateQuizCard({quiz, onCreateQuiz, onAddQuestion, onUpdateQuestion, onDeleteQuestion, onPublish, onBack}) {
    const [newQuiz, setNewQuiz] = useState({title: '', description: '', categoryNames: ''});
    const [question, setQuestion] = useState({
        type: 'TEXT',
        prompt: '',
        imageUrl: '',
        allowMultiple: false,
        points: 100,
        timeLimitSec: 20,
        options: [
            {text: '', isCorrect: false},
            {text: '', isCorrect: false}
        ]
    });
    const [editingQuestionId, setEditingQuestionId] = useState(null);
    const getEmptyQuestion = () => ({
        type: 'TEXT',
        prompt: '',
        imageUrl: '',
        allowMultiple: false,
        points: 100,
        timeLimitSec: 20,
        options: [
            {text: '', isCorrect: false},
            {text: '', isCorrect: false}
        ]
    });

    const handleCreateQuiz = async (e) => {
        e.preventDefault();
        const created = await onCreateQuiz({
            title: newQuiz.title,
            description: newQuiz.description,
            categoryNames: newQuiz.categoryNames.split(',').map((s) => s.trim()).filter(Boolean)
        });
        if (created) {
            setNewQuiz({title: '', description: '', categoryNames: ''});
        }
    };

    if (!quiz) {
        return <div className="stack centered">
            <h2>Создание квиза</h2>
            <form className="stack centered field-full" onSubmit={handleCreateQuiz}>
                <input className="field-full" placeholder="Название квиза" value={newQuiz.title}
                       onChange={(e) => setNewQuiz({...newQuiz, title: e.target.value})} required/>
                <div className="inline-fields">
                    <input placeholder="Описание" value={newQuiz.description}
                           onChange={(e) => setNewQuiz({...newQuiz, description: e.target.value})}/>
                    <input placeholder="Категории через запятую" value={newQuiz.categoryNames}
                           onChange={(e) => setNewQuiz({...newQuiz, categoryNames: e.target.value})}/>
                </div>
                <button style={{marginBottom: -20}}>Создать квиз</button>
            </form>
            <button className="ghost" onClick={onBack}>Назад</button>
        </div>;
    }

    const changeOption = (index, patch) => {
        setQuestion((prev) => {
            let nextOptions = prev.options.map((option, idx) => (idx === index ? {...option, ...patch} : option));
            if (!prev.allowMultiple && patch.isCorrect) {
                nextOptions = nextOptions.map((option, idx) => ({...option, isCorrect: idx === index}));
            }
            return {
                ...prev,
                options: nextOptions
            };
        });
    };

    return <div className="stack centered">
        <h2>Редактор квиза: {quiz.title}</h2>
        <p>Статус: <b>{quiz.status}</b></p>

        <form className="stack centered field-full" onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
                ...question,
                options: question.options.filter((option) => option.text.trim())
            };

            let success = false;
            if (editingQuestionId) {
                success = await onUpdateQuestion(quiz.id, editingQuestionId, payload);
            } else {
                success = await onAddQuestion(quiz.id, payload);
            }

            if (success) {
                setQuestion(getEmptyQuestion());
                setEditingQuestionId(null);
            }
        }}>
            <div className="inline-fields" style={{display: 'flex'}}>
                <CustomSelect
                    className="field-full"
                    value={question.type}
                    onChange={(value) => setQuestion({...question, type: value})}
                    options={[
                        {value: 'TEXT', label: 'Текстовый вопрос'},
                        {value: 'IMAGE', label: 'Вопрос с изображением'}
                    ]}
                />
                <input className="field-full" placeholder="Текст вопроса" value={question.prompt}
                       onChange={(e) => setQuestion({...question, prompt: e.target.value})} required/>
            </div>
            {question.type === 'IMAGE' && <>
                <input className="field-full" placeholder="URL изображения" value={question.imageUrl}
                       onChange={(e) => setQuestion({...question, imageUrl: e.target.value})} required/>
            </>}
            {question.imageUrl &&
                <img className="preview field-half" src={question.imageUrl} alt="Превью изображения вопроса"/>}
            <div className="field-full" style={{display: 'flex', justifyContent: 'space-evenly'}}>
                <label className="number-input-label">Очки за вопрос
                    <input type="number" min="10" max="1000" value={question.points}
                           onChange={(e) => setQuestion({...question, points: Number(e.target.value)})}/>
                </label>
                <label className="number-input-label">Время на вопрос
                    <input type="number" min="5" max="180" value={question.timeLimitSec}
                           onChange={(e) => setQuestion({...question, timeLimitSec: Number(e.target.value)})}/>
                </label>
            </div>
            <label><input type="checkbox" checked={question.allowMultiple} onChange={(e) => {
                const allowMultiple = e.target.checked;
                setQuestion((prev) => {
                    if (allowMultiple) {
                        return {...prev, allowMultiple};
                    }
                    const firstCorrectIndex = prev.options.findIndex((option) => option.isCorrect);
                    return {
                        ...prev,
                        allowMultiple: false,
                        options: prev.options.map((option, index) => ({
                            ...option,
                            isCorrect: firstCorrectIndex === -1 ? false : index === firstCorrectIndex
                        }))
                    };
                });
            }}/> Множественный выбор</label>

            <h4>Варианты ответа</h4>
            {question.options.map((option, idx) => (
                <div key={idx} className="option-editor">
                    <input type="checkbox" checked={option.isCorrect}
                           onChange={(e) => changeOption(idx, {isCorrect: e.target.checked})}/>
                    <input placeholder={`Вариант ${idx + 1}`} value={option.text}
                           onChange={(e) => changeOption(idx, {text: e.target.value})} required/>
                    <button
                        type="button"
                        className="ghost field-full icon-button option-remove"
                        onClick={() => setQuestion((prev) => ({
                            ...prev,
                            options: prev.options.filter((_, optionIndex) => optionIndex !== idx)
                        }))}
                        disabled={question.options.length <= 2}
                        aria-label={`Удалить вариант ${idx + 1}`}
                        title={`Удалить вариант ${idx + 1}`}
                    >
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    </button>
                </div>
            ))}
            <button type="button" className="ghost" onClick={() => setQuestion((prev) => ({
                ...prev,
                options: [...prev.options, {text: '', isCorrect: false}]
            }))}>+ Добавить вариант
            </button>

            <div className="row-actions">
                {editingQuestionId &&
                    <button type="button" className="ghost" onClick={() => setEditingQuestionId(null)}>Отмена
                        редактирования</button>}
                <button>{editingQuestionId ? 'Обновить вопрос' : 'Сохранить вопрос'}</button>
            </div>
        </form>

        <div className="stack field-full">
            <h4>Текущие вопросы ({quiz.questions?.length || 0})</h4>
            {quiz.questions?.map((q) => <article key={q.id} className="question-tile">
                <b className={'quiz-col-title'}>{q.orderIndex + 1}. {q.prompt}</b><span>{q.points} очков</span>
                <button className="ghost" onClick={() => {
                    setEditingQuestionId(q.id);
                    setQuestion({
                        type: q.type,
                        prompt: q.prompt,
                        imageUrl: q.imageUrl || '',
                        allowMultiple: q.allowMultiple,
                        points: q.points,
                        timeLimitSec: q.timeLimitSec || 20,
                        options: q.options.map((option) => ({text: option.text, isCorrect: option.isCorrect}))
                    });
                }}>Ред.
                </button>
                <button className="ghost icon-button" onClick={async () => {
                    const success = await onDeleteQuestion(quiz.id, q.id);
                    if (!success) return;
                    if (editingQuestionId === q.id) {
                        setEditingQuestionId(null);
                        setQuestion(getEmptyQuestion());
                    }
                }} aria-label={`Удалить вопрос ${q.orderIndex + 1}`} title={`Удалить вопрос ${q.orderIndex + 1}`}>
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
            </article>)}
        </div>

        <div className="row-actions">
            <button className="ghost" onClick={onBack}>Назад</button>
            <button onClick={() => onPublish(quiz.id)} disabled={!quiz.questions?.length}>Опубликовать квиз</button>
        </div>
    </div>;
}

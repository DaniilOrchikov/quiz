import React from 'react';

export function QuizListCard({quizzes, user, onLaunch, onEditQuiz, onDeleteQuiz, onCreateQuizClick}) {
    return <div className="stack centered">
        <h2 style={{marginBottom: 0}}>Квизы</h2>
        {user?.role === 'ORGANIZER' &&
            <button style={{marginBottom: 20}} onClick={onCreateQuizClick}>Создать квиз</button>}
        {quizzes?.map((quiz) => (
            <article key={quiz.id} className="tile quiz-row">
                <b className="quiz-col-title">{quiz.title}</b>
                <span className="quiz-col-count">{quiz._count.questions} вопросов</span>
                <button className="ghost field-full" onClick={() => onEditQuiz(quiz.id)}>Ред.</button>
                <button className="ghost field-full icon-button" onClick={() => onDeleteQuiz(quiz.id)}
                        aria-label="Удалить квиз" title="Удалить квиз">
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
                <button className="field-full" onClick={() => onLaunch(quiz.id)}>Запустить</button>
            </article>
        ))}
    </div>;
}

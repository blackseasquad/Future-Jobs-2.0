import { createContext, useContext } from 'react';

/** Състоянието на анкетата живее над страниците – запазва се при навигация. */
export const QuizCtx = createContext(null);
export const useQuiz = () => useContext(QuizCtx);
export const EMPTY_QUIZ = { step: 0, answers: {}, result: null, error: null, total: 9 };

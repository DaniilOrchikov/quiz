import {useCallback, useLayoutEffect, useRef, useState} from 'react';

export function useCardHeight(dependencies = []) {
    const cardContentRef = useRef(null);
    const [cardHeight, setCardHeight] = useState(null);
    const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

    const recalculateCardHeight = useCallback(() => {
        if (!cardContentRef.current) return;
        setCardHeight(Math.min(cardContentRef.current.scrollHeight + 2, window.innerHeight * 0.82));
    }, []);

    useLayoutEffect(() => {
        if (!cardContentRef.current) return;
        recalculateCardHeight();
        const observer = new ResizeObserver(recalculateCardHeight);
        observer.observe(cardContentRef.current);
        const mutationObserver = new MutationObserver(recalculateCardHeight);
        mutationObserver.observe(cardContentRef.current, {attributes: true, childList: true, subtree: true});
        const onResize = () => {
            setViewportHeight(window.innerHeight);
            recalculateCardHeight();
        };
        window.addEventListener('resize', onResize);
        return () => {
            observer.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener('resize', onResize);
        };
    }, [recalculateCardHeight, ...dependencies]);

    return {cardContentRef, cardHeight, viewportHeight, recalculateCardHeight};
}

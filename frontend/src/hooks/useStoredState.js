import {useMemo} from 'react';

export function useStoredState(storageKey, fallback = {}) {
    return useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(fallback));
        } catch {
            return fallback;
        }
    }, [storageKey]);
}

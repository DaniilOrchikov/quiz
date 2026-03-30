import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);

  return useMemo(() => ({ toasts, pushToast, removeToast }), [toasts, pushToast, removeToast]);
}

export function ToastHub({ toasts, removeToast }) {
  return (
    <aside className="toast-hub">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.article
            key={toast.id}
            className={`toast ${toast.type}`}
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </motion.article>
        ))}
      </AnimatePresence>
    </aside>
  );
}

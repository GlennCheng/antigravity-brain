import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Wait for the DOM to be ready
window.addEventListener('load', () => {
    const rootElement = document.getElementById('root');
    if (rootElement) {
        const root = createRoot(rootElement);
        root.render(<App />);
    }
});

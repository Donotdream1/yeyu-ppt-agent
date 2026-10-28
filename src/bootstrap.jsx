import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import AuthGate from './components/AuthGate';
import './app.css';
import './workspace.css';
import './chatgpt-ui.css';
import './project-workspace.css';
createRoot(document.getElementById('root')).render(<AuthGate><App/></AuthGate>);

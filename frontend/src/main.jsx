import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './MKNEnterprises.jsx';
import './index.css';

// This function assumes your main HTML page has a div with id="root"
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you are running this in a single-file environment like the canvas, 
// you can often omit this file and the MKNEnterprises.jsx component runs directly.
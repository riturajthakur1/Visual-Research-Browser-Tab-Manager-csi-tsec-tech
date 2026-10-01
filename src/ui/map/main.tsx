import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/base.css';
import './map.css';
import { MapApp } from './MapApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MapApp />
  </StrictMode>,
);

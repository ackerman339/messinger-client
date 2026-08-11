import './App.css';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from './pages/chat-page';
import { AuthPage } from './pages/auth-page';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Navigate to='/chat' replace />} />
        <Route path='/sign-in' element={<AuthPage />} />
        <Route path='/sign-up' element={<AuthPage />} />
        <Route path='/chat' element={<ChatPage />} />
        <Route path='*' element={<Navigate to='/chat' replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

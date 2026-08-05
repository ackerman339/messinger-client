import './App.css';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from './pages/chat-page';
import { AuthPage } from './pages/auth-page';
import { PublicOnly, RequireAuth } from './pages/route-guards';
import { UserProvider } from './providers/user-provider';

function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<Navigate to='/chat' replace />} />
          <Route
            path='/signin'
            element={
              <PublicOnly>
                <AuthPage />
              </PublicOnly>
            }
          />
          <Route
            path='/signup'
            element={
              <PublicOnly>
                <AuthPage />
              </PublicOnly>
            }
          />
          <Route
            path='/chat'
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />
          <Route path='*' element={<Navigate to='/chat' replace />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}

export default App;

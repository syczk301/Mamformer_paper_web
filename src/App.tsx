import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import MainLayout from './layouts/MainLayout';
import TrainingConfig from './pages/TrainingConfig';
import TrainingMonitor from './pages/TrainingMonitor';
import Results from './pages/Results';
import History from './pages/History';
import Display from './pages/Display';
import Dashboard from './pages/Dashboard';
import { ConfigSyncProvider } from './components/ConfigSyncProvider';

function App() {
  return (
    <Router>
      <ConfigSyncProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="config" element={<TrainingConfig />} />
            <Route path="monitor/:taskId" element={<TrainingMonitor />} />
            <Route path="results/:taskId" element={<Results />} />
            <Route path="history" element={<History />} />
            <Route path="display" element={<Display />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConfigSyncProvider>
    </Router>
  );
}

export default App;

import { Route, Routes } from 'react-router-dom';
import { Agent } from './screens/Agent';
import { Home } from './screens/Home';
import { Room } from './screens/Room';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rooms/:id" element={<Room />} />
      <Route path="/agents/:id" element={<Agent />} />
    </Routes>
  );
}

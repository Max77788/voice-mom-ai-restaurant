import { ConsolePage } from './pages/ConsolePage';
import './App.scss';
import logo from './static/logo_trans.png';


function App() {
  return (
    <div data-component="App">
      <div data-component="logo-container">
        <img src={logo} alt="Logo" className="app-logo" style={{ width: '150px', height: 'auto' }} />
      </div>
      <ConsolePage />
    </div>
  );
}

export default App;


import { useState, useEffect, useRef } from 'react';
import './App.css';
import { students } from './students';

function App() {
  // ゲームの状態管理
  const [gameMode, setGameMode] = useState('reading'); // 'reading'(ひらがな) or 'name'(漢字)
  const [currentStudent, setCurrentStudent] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  // 自己ベスト（ローカルストレージから読み込み）
  const [bestTime, setBestTime] = useState(() => {
    const saved = localStorage.getItem('class104_best_time');
    return saved ? parseFloat(saved) : null;
  });

  const inputRef = useRef(null);

  // ゲーム開始処理
  const startGame = (mode) => {
    setGameMode(mode);
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setIsGameStarted(true);
    setStartTime(Date.now());
    pickNextStudent([], mode);
  };

  // 次の問題を選ぶ
  const pickNextStudent = (doneIds) => {
    const remainingStudents = students.filter(s => !doneIds.includes(s.id));
    
    if (remainingStudents.length === 0) {
      finishGame();
      return;
    }

    const randomIndex = Math.floor(Math.random() * remainingStudents.length);
    setCurrentStudent(remainingStudents[randomIndex]);
  };

  // ゲーム終了処理
  const finishGame = () => {
    const end = Date.now();
    setEndTime(end);
    setCurrentStudent(null);

    // タイム計算と自己ベスト更新
    const currentTime = (end - startTime) / 1000;
    if (!bestTime || currentTime < bestTime) {
      setBestTime(currentTime);
      localStorage.setItem('class104_best_time', currentTime);
    }
  };

  // 文字入力判定
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);

    if (!currentStudent) return;

    // ターゲットの文字列を取得（モードによって切り替え）
    const targetRaw = gameMode === 'reading' ? currentStudent.reading : currentStudent.name;
    
    // 空白を削除して比較（漢字モードでの入力ミス軽減のため）
    const cleanVal = val.replace(/\s+/g, '');
    const cleanTarget = targetRaw.replace(/\s+/g, '');

    if (cleanVal === cleanTarget) {
      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal('');
      pickNextStudent(newCompletedIds);
    }
  };

  // 結果画面でのエンターキー操作
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && endTime) {
      startGame(gameMode);
    }
  };

  // タイムのフォーマット
  const formatTime = (time) => time ? time.toFixed(2) : '-.--';

  return (
    <div className="container">
      <h1>104 名前当てタイムアタック</h1>
      
      {!isGameStarted && !endTime && (
        <div className="start-screen">
          <p>モードを選んでスタート！</p>
          
          <div className="mode-select">
            <button onClick={() => startGame('reading')} className="btn-primary">
              ひらがな (Easy)
            </button>
            <button onClick={() => startGame('name')} className="btn-secondary">
              漢字 (Hard)
            </button>
          </div>

          {bestTime && (
            <p className="best-score">👑 自己ベスト: {formatTime(bestTime)} 秒</p>
          )}
        </div>
      )}

      {isGameStarted && !endTime && currentStudent && (
        <div className="game-screen">
          <div className="header-info">
             <span className="progress">残り: {37 - completedIds.length} 人</span>
             <span className="mode-badge">{gameMode === 'reading' ? 'ひらがな' : '漢字'}</span>
          </div>
          
          <div className="question-card">
            <h2 className="student-number">{currentStudent.id}番</h2>
          </div>

          <div className="input-area">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              placeholder={gameMode === 'reading' ? "ひらがな（例：ほんだおさむ）" : "漢字（例：本田理）"}
              autoFocus
            />
          </div>
          <p className="hint">※入力すると自動判定（スペース不要）</p>
        </div>
      )}

      {endTime && (
        <div className="result-screen" onKeyDown={handleKeyDown}>
          <h2>クリア！</h2>
          
          <div className="result-box">
            <p className="time-label">タイム</p>
            <p className="time-display">{formatTime((endTime - startTime) / 1000)} 秒</p>
            
            {((endTime - startTime) / 1000) === bestTime && (
              <p className="new-record">✨ New Record! ✨</p>
            )}
          </div>

          <div className="retry-buttons">
            <button onClick={() => startGame(gameMode)} className="btn-primary">
              もう一度 ({gameMode === 'reading' ? 'ひらがな' : '漢字'})
            </button>
            <button onClick={() => {setIsGameStarted(false); setEndTime(null);}} className="btn-text">
              トップに戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
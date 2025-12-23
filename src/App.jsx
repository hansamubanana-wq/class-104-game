import { useState, useEffect, useRef } from 'react';
import './App.css';
import { students } from './students';
import { playSound } from './SoundManager';

function App() {
  const [gameMode, setGameMode] = useState('reading');
  const [currentStudent, setCurrentStudent] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  // ローカルランキング（配列で保持）
  const [ranking, setRanking] = useState(() => {
    const saved = localStorage.getItem('class104_ranking');
    return saved ? JSON.parse(saved) : [];
  });

  const inputRef = useRef(null);

  const startGame = (mode) => {
    // 音声コンテキストの有効化（スマホ対策）
    playSound('dummy'); 
    
    setGameMode(mode);
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setIsGameStarted(true);
    setStartTime(Date.now());
    pickNextStudent([], mode);
  };

  const pickNextStudent = (doneIds) => {
    const remainingStudents = students.filter(s => !doneIds.includes(s.id));
    
    if (remainingStudents.length === 0) {
      finishGame();
      return;
    }

    const randomIndex = Math.floor(Math.random() * remainingStudents.length);
    setCurrentStudent(remainingStudents[randomIndex]);
  };

  const finishGame = () => {
    const end = Date.now();
    setEndTime(end);
    setCurrentStudent(null);
    playSound('clear'); // ファンファーレ

    const currentTime = (end - startTime) / 1000;
    
    // ランキング更新処理
    const newRecord = {
      date: new Date().toLocaleDateString(),
      time: currentTime,
      mode: gameMode
    };
    
    // 新しい記録を追加してソートし、トップ5を残す
    const newRanking = [...ranking, newRecord]
      .sort((a, b) => a.time - b.time)
      .slice(0, 5);

    setRanking(newRanking);
    localStorage.setItem('class104_ranking', JSON.stringify(newRanking));
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);

    if (!currentStudent) return;

    const targetRaw = gameMode === 'reading' ? currentStudent.reading : currentStudent.name;
    const cleanVal = val.replace(/\s+/g, '');
    const cleanTarget = targetRaw.replace(/\s+/g, '');

    if (cleanVal === cleanTarget) {
      playSound('correct'); // ピンポン！
      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal('');
      pickNextStudent(newCompletedIds);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && endTime) {
      startGame(gameMode);
    }
  };

  const formatTime = (time) => time ? time.toFixed(2) : '-.--';

  // シェア機能
  const shareResult = (platform) => {
    const time = formatTime((endTime - startTime) / 1000);
    const text = `【104名前当て】${gameMode === 'reading' ? 'ひらがな' : '漢字'}モードを${time}秒でクリア！みんなも挑戦して！`;
    const url = window.location.href;
    
    if (platform === 'line') {
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text + '\n' + url)}`, '_blank');
    } else if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    }
  };

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

          {ranking.length > 0 && (
            <div className="ranking-box">
              <h3>🏆 トップ5 (この端末)</h3>
              <ul>
                {ranking.map((r, i) => (
                  <li key={i} className={i === 0 ? 'rank-1' : ''}>
                    <span className="rank-num">{i + 1}位</span>
                    <span className="rank-time">{formatTime(r.time)}秒</span>
                    <span className="rank-mode">({r.mode === 'reading' ? 'ひ' : '漢'})</span>
                  </li>
                ))}
              </ul>
            </div>
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
              placeholder={gameMode === 'reading' ? "ひらがな" : "漢字"}
              autoFocus
            />
          </div>
        </div>
      )}

      {endTime && (
        <div className="result-screen" onKeyDown={handleKeyDown}>
          <h2>クリア！</h2>
          
          <div className="result-box">
            <p className="time-label">今回のタイム</p>
            <p className="time-display">{formatTime((endTime - startTime) / 1000)} 秒</p>
          </div>

          <div className="share-area">
            <p>結果をシェアする</p>
            <div className="share-buttons">
              <button onClick={() => shareResult('line')} className="btn-line">LINE</button>
              <button onClick={() => shareResult('x')} className="btn-x">X</button>
            </div>
          </div>

          <div className="retry-buttons">
            <button onClick={() => startGame(gameMode)} className="btn-primary">
              もう一度
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